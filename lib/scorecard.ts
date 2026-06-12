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
