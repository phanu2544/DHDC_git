import type { PoolConnection } from 'mysql2/promise'
import type { SessionPayload } from './auth'

/**
 * ตรวจว่า user (จาก signed session) มีสิทธิ์กรอก/แก้ "ผลงาน" (manual entry) ของ KPI ตัวนี้ไหม
 * - admin: แก้ได้ทุกตัว
 * - staff: แก้ได้เฉพาะ KPI ที่กลุ่มงานตัวเอง (users.department) ผูกอยู่ใน kpi_work_groups
 *
 * fail-closed: department ว่าง/NULL หรือ query พลาด (เช่น ตาราง kpi_work_groups ยังไม่มีบน production
 * ที่ยังไม่ได้รัน /api/init) → ไม่ให้แก้ — เขียนข้อมูลต้องปลอดภัยไว้ก่อนเสมอ
 */
export async function canEditManualKpi(
  conn: PoolConnection,
  session: SessionPayload,
  kpiId: string,
): Promise<boolean> {
  if (session.role === 'admin') return true
  const department = session.department.trim()
  if (!department) return false
  try {
    const [rows] = await conn.execute(
      'SELECT 1 FROM kpi_work_groups WHERE kpi_id = ? AND work_group = ? LIMIT 1',
      [kpiId, department],
    )
    return (rows as unknown[]).length > 0
  } catch {
    return false
  }
}

/**
 * ข้อความ 403 ให้ตรงกับกฎที่บล็อกจริง — ผู้ใช้จะได้รู้ว่าต้องทำยังไงต่อ
 */
export function monthLockMessage(): string {
  return 'เจ้าหน้าที่กรอก/แก้ไขได้เฉพาะเดือนปัจจุบันเท่านั้น — ติดต่อผู้ดูแลระบบหากต้องการแก้ไขย้อนหลัง'
}

/**
 * เดือนนี้แก้ไขได้ไหม — เวลาปัจจุบันคำนวณจากเซิร์ฟเวอร์เอง ไม่เชื่อ client
 * admin ทุกเดือน (รวมย้อนหลัง) · staff เฉพาะเดือนปัจจุบัน (owner ขอ 2026-07-20)
 */
export function isEditableMonth(session: SessionPayload, month: string): boolean {
  // L4 (ปรับ 30 ก.ค. ตาม owner): ตัวชี้วัดรายไตรมาสก็ "เก็บรายเดือน" เหมือนกันหมด
  // — ไตรมาสเป็นแค่ *มุมมอง/รอบส่ง* ไม่ใช่ข้อจำกัดการกรอก
  // ใครมีข้อมูลรายเดือนก็กรอกได้ทุกเดือน ใครไม่มีก็กรอกเฉพาะเดือนปิดไตรมาส
  // (แบนเนอร์เตือนยังเตือนเฉพาะเดือนปิดไตรมาส = ไม่ทวงเกินจำเป็น)
  if (session.role === 'admin') return true
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return month === thisMonth
}
