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
 * เดือนนี้แก้ไขได้ไหม — admin แก้ได้ทุกเดือน (รวมย้อนหลัง) / staff แก้ได้เฉพาะเดือนปัจจุบันเท่านั้น
 * (กันแก้ข้อมูลย้อนหลัง — owner ขอ 2026-07-20) · เดือนปัจจุบันคำนวณจากเวลาเซิร์ฟเวอร์เอง ไม่เชื่อ client
 */
export function isEditableMonth(session: SessionPayload, month: string): boolean {
  if (session.role === 'admin') return true
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return month === thisMonth
}
