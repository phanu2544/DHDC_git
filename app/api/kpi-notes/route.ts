import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { COOKIE_NAME, verifySession } from '@/lib/auth'
import { canEditManualKpi, isEditableMonth, monthLockMessage } from '@/lib/kpiOwnership'

/**
 * L2 — บันทึกเชิงคุณภาพต่อรอบ (ปัญหาอุปสรรค / แนวทางดำเนินงานต่อไป / แหล่งที่มาข้อมูล)
 * ตาราง `kpi_period_notes` (kpi_id, period) — แยกจาก monthly_data เพื่อให้ cron/batch ไม่ทับข้อความที่คนเขียน
 *
 * GET  /api/kpi-notes?kpiId=&period=YYYY-MM  → { note: {...} | null }
 * GET  /api/kpi-notes?period=YYYY-MM         → { notes: [...] }  (ทั้งรอบ — ใช้ตอน export L6)
 * POST /api/kpi-notes  body: { kpiId, period, problem?, nextAction?, dataRef? }
 *
 * สิทธิ์เขียน = เดียวกับ key-in ผลงาน (docs/kpi-keyin-plan.md):
 *   admin ทุกตัวทุกเดือน · staff เฉพาะ KPI ที่กลุ่มงานตัวเองรับผิดชอบ + เฉพาะเดือนปัจจุบัน
 * middleware ปล่อย mutation ผ่าน (อยู่ใน STAFF_OWNED_WRITE) → route นี้ต้องเช็ก ownership เอง
 */

const MAX_TEXT = 5000
const MAX_REF = 500

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const kpiId = searchParams.get('kpiId')
  const period = searchParams.get('period')
  if (!period) {
    return NextResponse.json({ message: 'ต้องระบุ period' }, { status: 400 })
  }
  // ไม่ส่ง kpiId = ขอทั้งรอบ (export ฟอร์มตรวจราชการ — ไม่งั้นต้องยิงทีละตัว 44 request)
  const bulk = !kpiId

  const shape = (r: Record<string, unknown>) => ({
    kpiId: r.kpi_id, period: r.period,
    problem: r.problem ?? '', nextAction: r.next_action ?? '', dataRef: r.data_ref ?? '',
    updatedBy: r.updated_by ?? null, updatedAt: r.updated_at ?? null,
  })

  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.execute(
      `SELECT kpi_id, period, problem, next_action, data_ref, updated_by,
              DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updated_at
         FROM kpi_period_notes WHERE period = ?${bulk ? '' : ' AND kpi_id = ?'}`,
      bulk ? [period] : [period, kpiId],
    )
    const list = rows as Record<string, unknown>[]
    if (bulk) return NextResponse.json({ notes: list.map(shape) })
    const r = list[0]
    if (!r) return NextResponse.json({ note: null })
    return NextResponse.json({ note: shape(r) })
  } catch (err) {
    // ตาราง L2 ยังไม่มี (production ที่ยังไม่รัน /api/init รอบใหม่) → คืนว่างแทน throw
    // บทเรียน work-groups §14: อย่าให้ฟีเจอร์ใหม่ทำหน้าเดิมพังทั้งหน้า
    console.error('GET /api/kpi-notes error:', err)
    return NextResponse.json(bulk ? { notes: [], unavailable: true } : { note: null, unavailable: true })
  } finally {
    conn.release()
  }
}

export async function POST(req: NextRequest) {
  const { kpiId, period, problem, nextAction, dataRef } = await req.json()
  if (!kpiId || !period) {
    return NextResponse.json({ message: 'ต้องระบุ kpiId และ period' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}$/.test(String(period))) {
    return NextResponse.json({ message: 'period ต้องอยู่ในรูปแบบ YYYY-MM' }, { status: 400 })
  }

  const token = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null
  if (!session) return NextResponse.json({ message: 'ไม่ได้เข้าสู่ระบบ' }, { status: 401 })

  const clean = (v: unknown, max: number): string | null => {
    if (typeof v !== 'string') return null
    const s = v.trim()
    if (!s) return null
    return s.slice(0, max)
  }
  const pVal = clean(problem, MAX_TEXT)
  const nVal = clean(nextAction, MAX_TEXT)
  const dVal = clean(dataRef, MAX_REF)

  const conn = await pool.getConnection()
  try {
    const [kr] = await conn.execute('SELECT id FROM kpi_reports WHERE id = ?', [kpiId])
    if ((kr as unknown[]).length === 0) {
      return NextResponse.json({ message: 'ไม่พบ KPI' }, { status: 404 })
    }
    // ownership: admin ทุกตัว / staff เฉพาะ KPI ที่กลุ่มงานตัวเองผูกอยู่ (fail-closed)
    if (!(await canEditManualKpi(conn, session, kpiId))) {
      const noDept = session.role !== 'admin' && !session.department.trim()
      return NextResponse.json({
        message: noDept
          ? 'บัญชีนี้ยังไม่มีกลุ่มงาน — ติดต่อผู้ดูแลระบบให้ตั้งกลุ่มงานก่อนจึงจะบันทึกได้'
          : 'ไม่มีสิทธิ์บันทึกหมายเหตุของ KPI นี้ — ต้องเป็นผู้ดูแลระบบ หรือเจ้าหน้าที่กลุ่มงานที่รับผิดชอบ',
      }, { status: 403 })
    }
    // รอบ: กฎเดียวกับกรอกผลงาน (Phase J) — staff เฉพาะเดือนปัจจุบัน
    if (!isEditableMonth(session, period)) {
      return NextResponse.json({ message: monthLockMessage() }, { status: 403 })
    }

    // ทั้ง 3 ช่องว่าง = ลบแถวทิ้ง (ไม่เก็บแถวเปล่า)
    if (pVal === null && nVal === null && dVal === null) {
      await conn.execute('DELETE FROM kpi_period_notes WHERE kpi_id = ? AND period = ?', [kpiId, period])
      return NextResponse.json({ ok: true, message: 'ล้างหมายเหตุแล้ว', cleared: true })
    }

    await conn.execute(
      `INSERT INTO kpi_period_notes (kpi_id, period, problem, next_action, data_ref, updated_by, updated_at)
       VALUES (?,?,?,?,?,?, NOW())
       ON DUPLICATE KEY UPDATE problem=VALUES(problem), next_action=VALUES(next_action),
         data_ref=VALUES(data_ref), updated_by=VALUES(updated_by), updated_at=NOW()`,
      [kpiId, period, pVal, nVal, dVal, session.name || 'ไม่ทราบผู้บันทึก'],
    )
    return NextResponse.json({ ok: true, message: 'บันทึกหมายเหตุสำเร็จ' })
  } catch (err) {
    console.error('POST /api/kpi-notes error:', err)
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
