import type { EvalDirection, KpiEvalStatus, KpiEvalResult } from './types'

// ── Constants ───────────────────────────────────────────────────────────────
/** แถบ "เฝ้าระวัง" (watch) = ±10% รอบเป้า — ใช้เฉพาะ target>0 */
export const WATCH_BAND = 0.10
/** ความคลาดเคลื่อนที่ยอมรับสำหรับ direction='eq' */
export const EQ_TOLERANCE = 0.01

/** ค่า direction ที่ระบบรองรับ — ใช้ validate ฝั่ง API ด้วย */
export const VALID_DIRECTIONS: readonly EvalDirection[] = ['gte', 'lte', 'eq', 'none']

export function isValidDirection(d: unknown): d is EvalDirection {
  return typeof d === 'string' && (VALID_DIRECTIONS as readonly string[]).includes(d)
}

/**
 * ประเมินสถานะ KPI หนึ่งตัวสำหรับเดือนหนึ่ง — pure function ไม่มี DB/fetch/side-effect
 *
 * สำคัญ:
 * - value === null เท่านั้น = ไม่มีข้อมูล (no_data); value === 0 = มีข้อมูลจริง
 *   → ห้ามใช้ if (!value) เพราะ 0 จะถูกตีความผิดเป็นไม่มีข้อมูล
 * - ลำดับการตัดสินเป็น "config-first" — ปัญหา config (none/invalid/needs_review)
 *   จะ surface ก่อนแม้ยังไม่มีข้อมูลเดือนนั้น เพื่อให้ admin เห็นและแก้ได้
 *
 * NOTE (Phase 4C Dashboard): ตอนแสดงเดือนย้อนหลัง ต้องส่ง value/target จาก
 *   monthly_data ของ "เดือนนั้น" (monthly_data.target = kpi.target ณ ตอนบันทึก)
 *   ไม่ใช่ kpi_reports.target ปัจจุบัน เพราะเป้าอาจเปลี่ยนภายหลัง
 */
export function evaluateKpiStatus(
  value: number | null,
  target: number,
  direction: EvalDirection,
): KpiEvalResult {
  // 1) target ติดลบ = config ผิด — ต้อง surface ก่อนทุกอย่าง
  //    (รวมถึงก่อน direction='none' เพราะ none ไม่ควรซ่อนปัญหา target ติดลบ)
  if (target < 0) {
    return { status: 'invalid', message: `เป้าหมายติดลบ (${target}) — ตรวจสอบ KPI` }
  }

  // 2) ไม่ประเมิน — ติดตามเฉยๆ
  if (direction === 'none') {
    return { status: 'no_target', message: 'ไม่ประเมิน (ติดตามเฉยๆ)' }
  }

  // 3) เป้า=0 + ยิ่งมากยิ่งดี = กำกวม (ผ่านเสมอ)
  if (direction === 'gte' && target === 0) {
    return {
      status: 'needs_review',
      message: 'ตรวจสอบเป้าหมาย KPI: เป้า=0 + ยิ่งมากยิ่งดี อาจตั้งค่าไม่ถูกต้อง',
    }
  }

  // 4) ไม่มีข้อมูลเดือนนี้ — value === null เท่านั้น (0 = มีข้อมูลจริง)
  if (value === null) {
    return { status: 'no_data', message: 'ยังไม่มีข้อมูลเดือนนี้' }
  }

  // 5) ค่าไม่ถูกต้อง (NaN)
  if (Number.isNaN(value)) {
    return { status: 'invalid', message: 'ค่าไม่ถูกต้อง (NaN)' }
  }

  // 4) ประเมินตามทิศทาง
  switch (direction) {
    case 'gte': {
      // target > 0 แน่นอน (target=0+gte ถูกดักเป็น needs_review ไปแล้ว)
      if (value >= target) return { status: 'pass' }
      if (value >= target * (1 - WATCH_BAND)) return { status: 'watch' }
      return { status: 'fail' }
    }
    case 'lte': {
      if (value <= target) return { status: 'pass' }
      // watch band เฉพาะ target>0; target=0 → ไม่มี watch (เกินคือ fail ทันที)
      if (target > 0 && value <= target * (1 + WATCH_BAND)) return { status: 'watch' }
      return { status: 'fail' }
    }
    case 'eq': {
      if (Math.abs(value - target) < EQ_TOLERANCE) return { status: 'pass' }
      return { status: 'fail' }   // eq ไม่มี watch
    }
  }
}

/** ผลรวมสถานะหลาย KPI สำหรับ Executive Scorecard (Phase 4C จะเรียกใช้) */
export interface StatusSummary {
  pass: number
  watch: number
  fail: number
  no_data: number
  no_target: number
  invalid: number
  needs_review: number
  narrative: number
  /** จำนวนที่ประเมินได้จริง = pass + watch + fail */
  evaluable: number
  /** % ผ่าน = pass / (pass+watch+fail) × 100 — no_data/no_target/invalid/needs_review ไม่อยู่ในตัวหาร */
  passRate: number | null
}

export function summarizeStatuses(statuses: KpiEvalStatus[]): StatusSummary {
  const count = (s: KpiEvalStatus) => statuses.filter((x) => x === s).length
  const pass = count('pass')
  const watch = count('watch')
  const fail = count('fail')
  const evaluable = pass + watch + fail
  return {
    pass, watch, fail,
    no_data:      count('no_data'),
    no_target:    count('no_target'),
    invalid:      count('invalid'),
    needs_review: count('needs_review'),
    narrative:    count('narrative'),
    evaluable,
    passRate: evaluable > 0 ? +((pass / evaluable) * 100).toFixed(1) : null,
  }
}

/**
 * Metadata สำหรับ UI (Phase 4C ใช้แสดงผล/เรียงลำดับ)
 * severity: เลขน้อย = สำคัญต้องติดตามก่อน (fail ขึ้นบนสุด)
 * (สี tailwind ปล่อยให้ UI กำหนดเอง เพื่อให้ไฟล์นี้ยัง pure)
 */
export const STATUS_META: Record<KpiEvalStatus, { label: string; severity: number }> = {
  fail:         { label: 'ไม่ผ่าน',          severity: 0 },
  watch:        { label: 'เฝ้าระวัง',        severity: 1 },
  no_data:      { label: 'ยังไม่มีข้อมูล',   severity: 2 },
  needs_review: { label: 'ตรวจสอบเป้าหมาย',  severity: 3 },
  invalid:      { label: 'ข้อมูลผิด',        severity: 4 },
  pass:         { label: 'ผ่าน',             severity: 5 },
  no_target:    { label: 'ติดตาม (ไม่ประเมิน)', severity: 6 },
  narrative:    { label: 'เชิงคุณภาพ',        severity: 7 },
}
