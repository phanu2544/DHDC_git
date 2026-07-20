/**
 * KPI ที่ต้อง "กรอกค่าเอง" (manual entry) — ไม่ดึง/คำนวณจาก MOPH อัตโนมัติ
 *
 * เหตุผล: บาง KPI (เช่น fully immunized) HDC คิดจากข้อมูลรายคน (AND ทุกวัคซีน + type_area)
 * ซึ่ง Public Open Data (report_data) ไม่เปิดให้ derive — sum/group ยังไงก็ไม่ตรง
 * → ผู้ดูแลกรอกเลขจริงเข้าระบบเอง (POST /api/monthly) · cron/batch ต้องข้าม
 *
 * ควบคุมด้วย flag `kpi_reports.manual_entry` (ติ๊กผ่านหน้า /admin ได้เอง ไม่ต้องแก้โค้ด)
 * (ดูที่มา: docs/kpi-verify-2569.md)
 */

/** ค่า manual_entry จาก DB เป็น "เปิด" หรือไม่ (รับ tinyint/number/string) */
export const isManualEntry = (v: unknown): boolean => Number(v) === 1

/**
 * ความละเอียดของการกรอกค่าเอง — เฉพาะเมื่อ isManualEntry() เป็น true
 * 'unit'   = ราย รพ.สต. 7 หน่วย (default, ของเดิม) → POST /api/monthly/detail
 * 'single' = ค่าเดียว (เป้าหมาย+ผลงาน รวม เช่น เฉพาะโรงพยาบาลดงเจริญ) → POST /api/monthly/single
 * ค่าอื่น/ไม่รู้จัก → fallback 'unit' (ปลอดภัยไว้ก่อน, ตรงกับ DB DEFAULT)
 */
export const manualScopeOf = (v: unknown): 'unit' | 'single' => (v === 'single' ? 'single' : 'unit')

/** ค่าตัวเลข manual entry ที่กรอกไม่ได้ (เช่น "90%", "abc") — ให้ route จับแล้วตอบ 400 ชัดเจน แทนเงียบๆ เป็น 0 */
export class ManualNumberError extends Error {}

/**
 * แปลงค่าจากฟอร์ม manual entry เป็นตัวเลข — ว่าง/null/undefined = 0 (ยังไม่กรอก, ปกติ)
 * ค่าที่ไม่ว่างแต่ไม่ใช่ตัวเลขจริง (เช่น "90%", "abc") → throw ManualNumberError
 * (เดิม `Number(x) || 0` เงียบๆ กลายเป็น 0 โดยไม่มี error — ทำให้ข้อมูลผิดหลุดเข้าระบบแบบไม่มีใครรู้)
 */
export function parseManualNumber(v: unknown, label: string): number {
  if (v === undefined || v === null || v === '') return 0
  const n = Number(v)
  if (!Number.isFinite(n)) throw new ManualNumberError(`${label} ต้องเป็นตัวเลข (ได้รับ: "${v}")`)
  return n
}
