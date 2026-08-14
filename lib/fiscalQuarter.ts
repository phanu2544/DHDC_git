/**
 * L4 — ปฏิทินไตรมาสปีงบประมาณไทย (docs/kpi-sets-plan.md §11.2)
 *
 * ปีงบ 2569 = ต.ค. 2568 – ก.ย. 2569 · แบ่ง 4 ไตรมาส เก็บค่าที่ "เดือนปิดไตรมาส"
 *   ไตรมาส 1 = ต.ค.–ธ.ค. → ปิด ธ.ค. (2025-12)
 *   ไตรมาส 2 = ม.ค.–มี.ค. → ปิด มี.ค. (2026-03)
 *   ไตรมาส 3 = เม.ย.–มิ.ย. → ปิด มิ.ย. (2026-06)
 *   ไตรมาส 4 = ก.ค.–ก.ย. → ปิด ก.ย. (2026-09)
 *
 * ตรวจราชการส่ง 2 รอบ: รอบ 1 = ผลไตรมาส 2 · รอบ 2 = ผลไตรมาส 4
 *
 * ไม่แตะ schema — "ไตรมาส" คือเดือนปิดไตรมาสใน monthly_data ตามเดิม
 * (ข้อมูลที่นำเข้าไว้ที่ 2026-03 จึงกลายเป็นไตรมาส 2/2569 ทันทีโดยไม่ต้องย้าย)
 *
 * ⚠️ ปรับ 30 ก.ค. ตาม owner: **เก็บรายเดือนเหมือนกันหมด** — ไตรมาสเป็นแค่ *มุมมอง + รอบส่ง*
 * ไม่ใช่ข้อจำกัดการกรอก · หน้า KPI สลับดู "รายไตรมาส ↔ รายเดือน" ได้จากข้อมูลชุดเดียวกัน
 * ใช้ได้เพราะตัวเลขเป็น "ยอดสะสมปีงบ" → ค่าไตรมาส = ค่า ณ เดือนปิดไตรมาส ไม่ต้องบวก/เฉลี่ย
 * (ถ้าเจอตัวชี้วัดที่เป็น "ยอดรายเดือน" ไม่ใช่สะสม ต้องทำ rollup แบบบวก = กรณีพิเศษ ยังไม่เจอ)
 */

export type ReportFreq = 'monthly' | 'quarterly'

export const VALID_REPORT_FREQ: ReportFreq[] = ['monthly', 'quarterly']

export function isQuarterly(v: unknown): boolean {
  return v === 'quarterly'
}

/** normalize ค่าจาก DB/client — ไม่ใช่ 'quarterly' ให้เป็น 'monthly' เสมอ */
export function reportFreqOf(v: unknown): ReportFreq {
  return v === 'quarterly' ? 'quarterly' : 'monthly'
}

/** เดือนปิดของแต่ละไตรมาส (1-4) เรียงตามลำดับไตรมาส */
const CLOSING_MONTH: Record<number, number> = { 1: 12, 2: 3, 3: 6, 4: 9 }

/** ปี พ.ศ. ที่ใช้แสดงในช่วงเวลา — ไตรมาส 1 (ต.ค.-ธ.ค.) อยู่ในปฏิทินปีก่อนหน้าปีงบ */
function rangeYear(fiscalYear: number, q: number): string {
  const y = q === 1 ? fiscalYear - 1 : fiscalYear
  return String(y % 100).padStart(2, '0')
}

/** ชื่อช่วงเวลาไทยของแต่ละไตรมาส (ใช้แสดงผลเท่านั้น) */
const RANGE_LABEL: Record<number, string> = {
  1: 'ต.ค. – ธ.ค.',
  2: 'ม.ค. – มี.ค.',
  3: 'เม.ย. – มิ.ย.',
  4: 'ก.ค. – ก.ย.',
}

export interface QuarterInfo {
  /** ไตรมาสที่ 1-4 */
  q: number
  /** ปีงบประมาณ พ.ศ. เช่น 2569 */
  fiscalYear: number
  /** เดือนปิดไตรมาสในรูปแบบ YYYY-MM (ค.ศ.) — คีย์จริงใน monthly_data */
  month: string
  /** ป้ายสั้น เช่น "ไตรมาส 2/2569" */
  label: string
  /** ช่วงเวลา เช่น "ม.ค. – มี.ค. 69" */
  range: string
}

/** ปีงบประมาณ (พ.ศ.) ของเดือน YYYY-MM — ต.ค. ขึ้นปีงบใหม่ */
export function fiscalYearOfMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return 0
  const beYear = y + 543
  return m >= 10 ? beYear + 1 : beYear
}

/** เดือน YYYY-MM เป็นเดือนปิดไตรมาสไหม (ธ.ค./มี.ค./มิ.ย./ก.ย. เท่านั้น) */
export function isQuarterEndMonth(month: string): boolean {
  const m = Number(month.split('-')[1])
  return m === 12 || m === 3 || m === 6 || m === 9
}

/** ไตรมาสที่เท่าไรของเดือนปิดนี้ — คืน 0 ถ้าไม่ใช่เดือนปิดไตรมาส */
export function quarterOfMonth(month: string): number {
  const m = Number(month.split('-')[1])
  const found = Object.entries(CLOSING_MONTH).find(([, cm]) => cm === m)
  return found ? Number(found[0]) : 0
}

/** เดือนปิดไตรมาส q ของปีงบ fiscalYear (พ.ศ.) → 'YYYY-MM' (ค.ศ.) */
export function quarterMonth(fiscalYear: number, q: number): string {
  const m = CLOSING_MONTH[q]
  if (!m) return ''
  // ไตรมาส 1 (ต.ค.-ธ.ค.) อยู่ในปฏิทินปีก่อนหน้าปีงบ
  const ceYear = (q === 1 ? fiscalYear - 1 : fiscalYear) - 543
  return `${ceYear}-${String(m).padStart(2, '0')}`
}

/** ข้อมูลไตรมาสของเดือนปิด — คืน null ถ้าเดือนนั้นไม่ใช่เดือนปิดไตรมาส */
export function quarterInfoOfMonth(month: string): QuarterInfo | null {
  const q = quarterOfMonth(month)
  if (!q) return null
  const fy = fiscalYearOfMonth(month)
  return {
    q,
    fiscalYear: fy,
    month,
    label: `ไตรมาส ${q}/${fy}`,
    range: `${RANGE_LABEL[q]} ${rangeYear(fy, q)}`,
  }
}

/** 4 ไตรมาสของปีงบ fiscalYear (พ.ศ.) เรียง 1→4 */
export function quartersOfFiscalYear(fiscalYear: number): QuarterInfo[] {
  return [1, 2, 3, 4].map((q) => {
    const month = quarterMonth(fiscalYear, q)
    return {
      q,
      fiscalYear,
      month,
      label: `ไตรมาส ${q}/${fiscalYear}`,
      range: `${RANGE_LABEL[q]} ${rangeYear(fiscalYear, q)}`,
    }
  })
}

export interface FiscalMonth {
  /** 'YYYY-MM' (ค.ศ.) — คีย์จริงใน monthly_data */
  month: string
  /** ลำดับเดือนในปีงบ 1-12 (1 = ต.ค.) */
  order: number
  /** ไตรมาสที่เดือนนี้อยู่ (1-4) */
  q: number
  /** เดือนนี้เป็นเดือนปิดไตรมาสไหม */
  isQuarterEnd: boolean
}

/**
 * 12 เดือนของปีงบ fiscalYear (พ.ศ.) เรียง ต.ค. → ก.ย.
 * ใช้กับมุมมอง "รายเดือน" ที่สลับจากมุมมองไตรมาสได้ (owner ขอ 30 ก.ค.)
 */
export function monthsOfFiscalYear(fiscalYear: number): FiscalMonth[] {
  const out: FiscalMonth[] = []
  for (let i = 0; i < 12; i++) {
    const mNum = ((9 + i) % 12) + 1                    // 10,11,12,1,2,...,9
    const ceYear = (i < 3 ? fiscalYear - 1 : fiscalYear) - 543
    const month = `${ceYear}-${String(mNum).padStart(2, '0')}`
    out.push({
      month,
      order: i + 1,
      q: Math.floor(i / 3) + 1,
      isQuarterEnd: isQuarterEndMonth(month),
    })
  }
  return out
}

/**
 * ไตรมาสปัจจุบัน (ตามเวลาเซิร์ฟเวอร์) — ใช้ตัดสินว่า staff กรอกไตรมาสไหนได้
 * คืนเดือนปิดของไตรมาสที่ "กำลังดำเนินอยู่" เช่น อยู่ ก.ค. → ไตรมาส 4 (ปิด ก.ย.)
 */
export function currentQuarter(now: Date = new Date()): QuarterInfo {
  const m = now.getMonth() + 1
  const beYear = now.getFullYear() + 543
  const fy = m >= 10 ? beYear + 1 : beYear
  const q = m >= 10 ? 1 : m <= 3 ? 2 : m <= 6 ? 3 : 4
  const month = quarterMonth(fy, q)
  return {
    q, fiscalYear: fy, month,
    label: `ไตรมาส ${q}/${fy}`,
    range: `${RANGE_LABEL[q]} ${rangeYear(fy, q)}`,
  }
}
