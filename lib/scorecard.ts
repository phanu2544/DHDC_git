import { evaluateKpiStatus, summarizeStatuses } from './kpiStatus'
import type { StatusSummary } from './kpiStatus'
import type { KPIReport, KpiEvalStatus, EvalDirection, MonthlyData } from './types'

// ══════════════════════════════════════════════════════════════════════════
// Executive Scorecard core (Phase 5: ย้ายจาก app/dashboard/page.tsx เพื่อ reuse
// ระหว่าง Dashboard และ Export — logic เดิมทุกบรรทัด ห้ามเปลี่ยน behavior)
// ใช้ evaluateKpiStatus / summarizeStatuses จาก lib/kpiStatus.ts (pure engine)
// ══════════════════════════════════════════════════════════════════════════

/**
 * ลำดับความสำคัญสำหรับ "Executive Dashboard เท่านั้น" — เรียงตามสิ่งที่ผู้บริหารควรสนใจก่อน
 * NOTE: ตั้งใจ "ไม่" ใช้ STATUS_META.severity เพราะลำดับนั้นไม่ตรง priority ของหน้านี้
 */
export const EXECUTIVE_SEVERITY_ORDER: KpiEvalStatus[] = [
  'fail', 'needs_review', 'invalid', 'watch', 'no_data', 'pass', 'no_target',
]

/** สถานะที่ถือว่า "ต้องติดตาม" — ใช้กับ toggle เฉพาะที่ต้องติดตาม */
export const ATTENTION_STATUSES: KpiEvalStatus[] = ['fail', 'watch', 'no_data', 'needs_review', 'invalid']

export const DIRECTION_LABEL: Record<EvalDirection, string> = {
  gte: 'ยิ่งมากยิ่งดี',
  lte: 'ยิ่งน้อยยิ่งดี',
  eq: 'เท่ากับเป้า',
  none: 'ไม่ประเมิน',
}

export interface ScorecardRow {
  kpi: KPIReport
  value: number | null
  target: number
  direction: EvalDirection
  status: KpiEvalStatus
  message?: string
  valueText?: string | null   // ผลงานข้อความ (เมื่อ status='narrative') — L1
}

/**
 * ประเมิน KPI หนึ่งตัวสำหรับเดือนที่เลือก
 * - ไม่มี row: ห้าม fallback kpi.target มาตัดสิน pass/watch/fail/needs_review
 *     target<0 → invalid · direction='none' → no_target · อื่นๆ → no_data
 * - มี row: monthly_data เป็น source หลักเสมอ (value/target ของเดือนนั้น)
 *     value=0 = ข้อมูลจริง (ไม่ใช่ no_data)
 */
export function evalScorecardRow(kpi: KPIReport, row: MonthlyData | undefined): ScorecardRow {
  const direction: EvalDirection = kpi.direction ?? 'gte'

  // ── L1: ตัวชี้วัดชนิดข้อความ — ไม่ประเมินผ่าน/ไม่ผ่าน แสดง value_text ล้วน ──
  //    ต้องมาก่อนทุก branch (รวมก่อน !row) เพื่อไม่ให้ engine ตัวเลขมายุ่ง
  //    ตัวชี้วัดเดิม (measureType undefined/'numeric') ไม่เข้า branch นี้เลย
  if (kpi.measureType === 'text') {
    return {
      kpi, value: null, target: 0, direction: 'none', status: 'narrative',
      valueText: row?.valueText ?? null,
      message: row ? undefined : 'ยังไม่ได้กรอกผลงานเดือนนี้',
    }
  }

  // ── L1b: ตัวชี้วัดชนิด "ระดับ" — ระดับเรียงลำดับ (textOptions ต่ำ→สูง) ตัดสินผ่าน/ไม่ผ่าน ──
  //    เป้า = kpi.target เก็บเป็น index 1-based ของระดับที่ถือว่าผ่าน · ประเมิน achieved ≥ target
  if (kpi.measureType === 'level') {
    const levels = (kpi.textOptions ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
    const achieved = row?.valueText ?? null
    const targetIdx = Math.round(Number(kpi.target ?? 0)) - 1   // 1-based → 0-based
    if (!achieved) {
      return { kpi, value: null, target: kpi.target ?? 0, direction: 'gte', status: 'no_data', valueText: null, message: 'ยังไม่ได้กรอกผลงานเดือนนี้' }
    }
    const achievedIdx = levels.indexOf(achieved)
    // เลือก "อื่นๆ (พิมพ์เอง)" = ค่าไม่อยู่ในลิสต์ระดับ → แสดงเฉยๆ ไม่ตัดสิน
    if (achievedIdx < 0) {
      return { kpi, value: null, target: 0, direction: 'none', status: 'narrative', valueText: achieved }
    }
    // ยังไม่ได้ตั้งระดับเป้าหมาย → ติดตามเฉยๆ (แสดงระดับที่ได้)
    if (targetIdx < 0 || targetIdx >= levels.length) {
      return { kpi, value: null, target: 0, direction: 'none', status: 'no_target', valueText: achieved, message: 'ยังไม่ได้ตั้งระดับเป้าหมาย' }
    }
    const pass = achievedIdx >= targetIdx
    return {
      kpi, value: null, target: kpi.target ?? 0, direction: 'gte',
      status: pass ? 'pass' : 'fail', valueText: achieved,
      message: pass ? undefined : `ยังไม่ถึงระดับเป้าหมาย (${levels[targetIdx]})`,
    }
  }

  // ── ไม่มี monthly row เดือนนี้ — แยก logic ก่อนเรียก engine ──
  if (!row) {
    const configTarget = Number(kpi.target ?? 0)
    if (configTarget < 0) {
      return { kpi, value: null, target: configTarget, direction, status: 'invalid', message: 'เป้าหมายติดลบ' }
    }
    if (direction === 'none') {
      return { kpi, value: null, target: configTarget, direction, status: 'no_target', message: 'ตัวชี้วัดติดตาม ไม่ประเมินผ่าน/ไม่ผ่าน' }
    }
    return { kpi, value: null, target: configTarget, direction, status: 'no_data', message: 'ยังไม่มีข้อมูลเดือนนี้' }
  }

  // ── มี row — monthly_data.target ของเดือนนั้นเท่านั้น (ห้ามใช้ kpi.target ปัจจุบัน) ──
  const value = Number(row.value)    // value=0 = ข้อมูลจริง
  const target = Number(row.target)
  const result = evaluateKpiStatus(value, target, direction)
  return { kpi, value, target, direction, status: result.status, message: result.message }
}

export interface ScorecardResult {
  rows: ScorecardRow[]
  summary: StatusSummary
}

/** ประเมินทุก KPI สำหรับเดือนที่เลือก (pure — Dashboard และ Export ใช้ตัวเดียวกัน) */
export function buildScorecard(
  kpis: KPIReport[],
  monthly: MonthlyData[],
  month: string,
): ScorecardResult {
  const byKpi = new Map<string, MonthlyData>()
  for (const m of monthly) {
    if (m.month === month) byKpi.set(m.kpiId, m)
  }
  const rows = kpis.map((kpi) => evalScorecardRow(kpi, byKpi.get(kpi.id)))
  const summary = summarizeStatuses(rows.map((r) => r.status))
  return { rows, summary }
}
