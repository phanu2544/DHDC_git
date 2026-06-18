/**
 * แปลงเดือนรูปแบบ "YYYY-MM" (ค.ศ.) → "เดือนไทย พ.ศ." เช่น "2026-06" → "มิถุนายน 2569"
 * จุดเดียวสำหรับทุกหน้า (MonthPicker, dashboard) — toLocaleDateString('th-TH') ให้เดือนไทย + พ.ศ. อัตโนมัติ
 */
export function formatThaiMonth(month: string): string {
  if (!month) return ''
  const d = new Date(`${month}-01`)
  if (Number.isNaN(d.getTime())) return month // เผื่อค่าแปลก เช่น 'live' → คืนตามเดิม
  return d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
}
