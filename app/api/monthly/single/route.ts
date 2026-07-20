import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { COOKIE_NAME, verifySession } from '@/lib/auth'
import { isManualEntry, manualScopeOf, parseManualNumber } from '@/lib/manualKpi'
import { canEditManualKpi, isEditableMonth } from '@/lib/kpiOwnership'

/**
 * POST /api/monthly/single — บันทึกค่า manual แบบ "ค่าเดียว" (ไม่แยกราย รพ.สต.)
 * body: { kpiId, month, target, result }
 *
 * ใช้กับ KPI manual ที่ manual_scope='single' เท่านั้น — เช่น ตัวชี้วัดเฉพาะโรงพยาบาลดงเจริญ
 * ที่ไม่มีข้อมูลราย รพ.สต. จริงๆ (ต่างจาก /api/monthly/detail ที่ scope='unit' กรอกราย 7 หน่วย)
 *
 * - ไม่เขียน moph_monthly_detail (ไม่มีอะไรให้ drilldown รายหน่วย) — upsert monthly_data ตรงๆ
 *   (+ audit: source/entered_by/entered_at) + data_change_log เก็บค่าเก่าก่อนทับ (กู้คืนได้)
 * - สิทธิ์: middleware ยกเว้น path นี้จาก admin-mutate (STAFF_OWNED_WRITE) → route เช็กเอง
 *   ผ่าน canEditManualKpi (admin ทุกตัว / staff เฉพาะ KPI ที่กลุ่มงานตัวเองผูกอยู่) — docs/kpi-keyin-plan.md
 */
export async function POST(req: NextRequest) {
  const { kpiId, month, target, result } = await req.json()
  if (!kpiId || !month) {
    return NextResponse.json({ message: 'ต้องระบุ kpiId, month' }, { status: 400 })
  }
  let t: number, r: number
  try {
    t = parseManualNumber(target, 'ฐาน (B)')
    r = parseManualNumber(result, 'ผลงาน (A)')
  } catch (err) {
    return NextResponse.json({ message: String(err instanceof Error ? err.message : err) }, { status: 400 })
  }
  if (t < 0 || r < 0) return NextResponse.json({ message: 'ค่าต้องไม่ติดลบ' }, { status: 400 })
  if (r > t) return NextResponse.json({ message: 'ผลงาน (A) ต้องไม่เกินฐาน (B)' }, { status: 400 })

  // audit: ผู้กรอกจาก session (ไม่เชื่อ client)
  const token = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null
  if (!session) return NextResponse.json({ message: 'ไม่ได้เข้าสู่ระบบ' }, { status: 401 })
  const enteredBy = session.name || 'ไม่ทราบผู้กรอก'

  const conn = await pool.getConnection()
  try {
    const [kr] = await conn.execute('SELECT target, manual_entry, manual_scope FROM kpi_reports WHERE id = ?', [kpiId])
    const krow = (kr as { target: number; manual_entry: number; manual_scope: string }[])[0]
    if (!krow) return NextResponse.json({ message: 'ไม่พบ KPI' }, { status: 404 })
    if (!isManualEntry(krow.manual_entry)) {
      return NextResponse.json({ message: 'KPI นี้ไม่ได้ตั้งเป็น "กรอกค่าเอง" (manual) — ติ๊กในหน้า /admin ก่อน' }, { status: 400 })
    }
    if (manualScopeOf(krow.manual_scope) !== 'single') {
      return NextResponse.json({ message: 'KPI นี้ไม่ได้ตั้งเป็นโหมด "ค่าเดียว" — ใช้แบบรายหน่วยบริการแทน' }, { status: 400 })
    }
    // ownership: admin แก้ได้ทุกตัว / staff เฉพาะ KPI ที่กลุ่มงานตัวเองรับผิดชอบ (kpi_work_groups)
    if (!(await canEditManualKpi(conn, session, kpiId))) {
      const noDept = session.role !== 'admin' && !session.department.trim()
      return NextResponse.json({
        message: noDept
          ? 'บัญชีนี้ยังไม่มีกลุ่มงาน — ติดต่อผู้ดูแลระบบให้ตั้งกลุ่มงานก่อนจึงจะกรอกผลงานได้'
          : 'ไม่มีสิทธิ์กรอกผลงาน KPI นี้ — ต้องเป็นผู้ดูแลระบบ หรือเจ้าหน้าที่กลุ่มงานที่รับผิดชอบ',
      }, { status: 403 })
    }
    // เดือน: admin แก้ย้อนหลังได้ / staff แก้ได้เฉพาะเดือนปัจจุบันเท่านั้น (owner ขอ 2026-07-20)
    if (!isEditableMonth(session, month)) {
      return NextResponse.json({ message: 'เจ้าหน้าที่กรอก/แก้ไขได้เฉพาะเดือนปัจจุบันเท่านั้น — ติดต่อผู้ดูแลระบบหากต้องการแก้ไขย้อนหลัง' }, { status: 403 })
    }

    const kpiTarget = Number(krow.target ?? 0) // เป้าหมายจริงของ KPI (ประเมินผ่าน/ไม่ผ่าน) — คนละตัวกับ "ฐาน (B)" ที่ผู้ใช้กรอกไว้เป็นตัวหาร
    const value = t > 0 ? +((r / t) * 100).toFixed(2) : 0

    await conn.beginTransaction()

    // ถ้าเดือนนี้มีข้อมูลเดิมอยู่ → เก็บลง data_change_log (action=overwrite) ก่อนทับ (กู้คืนได้)
    const [oldM] = await conn.execute(
      'SELECT value, target, source FROM monthly_data WHERE kpi_id = ? AND month = ?', [kpiId, month],
    )
    const prevMonthly = (oldM as { value: number; target: number; source: string }[])[0]
    if (prevMonthly) {
      await conn.execute(
        `INSERT INTO data_change_log (kpi_id, month, action, old_data, changed_by)
         VALUES (?, ?, 'overwrite', ?, ?)`,
        [kpiId, month, JSON.stringify({ monthly: prevMonthly }), enteredBy],
      )
    }

    await conn.execute(
      `INSERT INTO monthly_data (kpi_id, month, value, target, source, entered_by, entered_at)
       VALUES (?,?,?,?, 'manual', ?, NOW())
       ON DUPLICATE KEY UPDATE value=VALUES(value), target=VALUES(target),
         source='manual', entered_by=VALUES(entered_by), entered_at=NOW()`,
      [kpiId, month, value, kpiTarget, enteredBy],
    )
    await conn.commit()
    return NextResponse.json({ ok: true, message: 'บันทึกผลงานสำเร็จ', value, target: t, result: r })
  } catch (err) {
    await conn.rollback().catch(() => {})
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
