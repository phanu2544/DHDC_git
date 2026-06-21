/**
 * ป้ายชื่อไทย + ลำดับคอลัมน์ของตาราง drilldown (หน้า generic /kpi/[id])
 * key = moph_table · ค่าใน object = field → ป้ายไทย
 * ลำดับ key = ลำดับคอลัมน์ที่อยากให้แสดง (อ่านง่ายแบบ HDC)
 *
 * KPI ที่ไม่มีใน map นี้ → หน้า generic แสดงชื่อ field ดิบเหมือนเดิม (fallback)
 */
export const DETAIL_FIELD_LABELS: Record<string, Record<string, string>> = {
  // ผู้สูงอายุ 9 ด้าน (Healthy Ageing) — ข้อมูลราย "รอบ" (q1=รอบ1 ต.ค.-มี.ค., q2=รอบ2 เม.ย.-ก.ย.)
  // ร้อยละ = ติดสังคม/คัดกรอง · ห้ามรวม 2 รอบ (คนเดียวกันอาจถูกประเมินทั้งคู่)
  s_kpi_ageing: {
    target: 'ผู้สูงอายุ',
    targetq1: 'คัดกรอง รอบ1',
    result1q1: 'ติดสังคม รอบ1',
    result2q1: 'ติดบ้าน รอบ1',
    result3q1: 'ติดเตียง รอบ1',
    targetq2: 'คัดกรอง รอบ2',
    result1q2: 'ติดสังคม รอบ2',
    result2q2: 'ติดบ้าน รอบ2',
    result3q2: 'ติดเตียง รอบ2',
  },
}

/** คืน label map ของ moph_table นั้น (null ถ้าไม่ได้กำหนด → ใช้ชื่อ field ดิบ) */
export function fieldLabelsFor(mophTable: string | null | undefined): Record<string, string> | null {
  return (mophTable && DETAIL_FIELD_LABELS[mophTable]) || null
}
