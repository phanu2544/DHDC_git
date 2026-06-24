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
