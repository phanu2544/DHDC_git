import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { COOKIE_NAME, verifySession } from '@/lib/auth'
import { isManualEntry, parseManualNumber } from '@/lib/manualKpi'
import { canEditManualKpi, isEditableMonth, monthLockMessage } from '@/lib/kpiOwnership'
import { HOSPCODE_NAMES, hospcodeNameOf } from '@/lib/areaRef'

/**
 * POST /api/monthly/detail — บันทึกค่า manual "รายหน่วยบริการ" (KPI ที่กรอกเอง)
 * body: { kpiId, month, rows: [{ hospcode, target, result }] }  (hospcode = รหัสหน่วยบริการ 5 หลัก)
 *
 * ทำไมรายหน่วยบริการ (ไม่ใช่รายตำบล): hospcode→tambon ไม่ใช่ 1:1
 *   (07705 ดูแล ต.01+02, รพ.ดงเจริญ 27980 ดูแล ต.01+05) → เลขรวมต่อ hospcode แตกกลับเป็นตำบลไม่ได้
 *   → กรอกราย hospcode ตรงกับ HDC "รายหน่วยบริการ" ก๊อปมาวางได้เลย
 *
 * - เก็บรายหน่วยลง moph_monthly_detail (hospcode=รหัสจริง, areacode='', data={target,result})
 *   → หน้า drilldown คำนวณ %/หน่วย จากตารางนี้ด้วย mapping result/target (reuse logic เดิม) view=unit
 * - คำนวณรวมอำเภอ ΣA/ΣB → upsert monthly_data (+ audit: source/entered_by/entered_at)
 *   (ค่ารวม = total grouping-independent — ตรงกับรายตำบลของ HDC เสมอ)
 * - สิทธิ์: middleware ยกเว้น path นี้จาก admin-mutate (STAFF_OWNED_WRITE) → route เช็กเอง
 *   ผ่าน canEditManualKpi (admin ทุกตัว / staff เฉพาะ KPI ที่กลุ่มงานตัวเองผูกอยู่) — docs/kpi-keyin-plan.md
 */
export async function POST(req: NextRequest) {
  const { kpiId, month, rows } = await req.json()
  if (!kpiId || !month || !Array.isArray(rows)) {
    return NextResponse.json({ message: 'ต้องระบุ kpiId, month, rows' }, { status: 400 })
  }

  // validate แต่ละหน่วย: hospcode รู้จัก (ในเขต 6611), ตัวเลข ≥0, result ≤ target
  const clean: { hospcode: string; target: number; result: number }[] = []
  for (const r of rows) {
    const hospcode = String(r.hospcode ?? '').trim()
    if (!Object.prototype.hasOwnProperty.call(HOSPCODE_NAMES, hospcode)) {
      return NextResponse.json({ message: `หน่วยบริการไม่ถูกต้อง: "${hospcode}" — รับเฉพาะหน่วยในอำเภอดงเจริญ` }, { status: 400 })
    }
    let target: number, result: number
    try {
      target = parseManualNumber(r.target, `${hospcodeNameOf(hospcode)}: ฐาน (B)`)
      result = parseManualNumber(r.result, `${hospcodeNameOf(hospcode)}: ผลงาน (A)`)
    } catch (err) {
      return NextResponse.json({ message: String(err instanceof Error ? err.message : err) }, { status: 400 })
    }
    if (target < 0 || result < 0) return NextResponse.json({ message: 'ค่าต้องไม่ติดลบ' }, { status: 400 })
    if (result > target) return NextResponse.json({ message: `${hospcodeNameOf(hospcode)}: ผลงาน (A=${result}) ต้องไม่เกินฐาน (B=${target})` }, { status: 400 })
    clean.push({ hospcode, target, result })
  }

  // audit: ผู้กรอกจาก session (ไม่เชื่อ client) — middleware ยืนยัน login แล้ว แต่ route ตรวจซ้ำเอง (ตาม pattern เดิม)
  const token = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null
  if (!session) return NextResponse.json({ message: 'ไม่ได้เข้าสู่ระบบ' }, { status: 401 })
  const enteredBy = session.name || 'ไม่ทราบผู้กรอก'

  const conn = await pool.getConnection()
  try {
    // target รวมของ KPI + ตรวจว่าเป็น manual จริง (กันเรียก save ผิดตัว → cron จะมาทับทีหลัง)
    const [kr] = await conn.execute('SELECT target, manual_entry FROM kpi_reports WHERE id = ?', [kpiId])
    const krow = (kr as { target: number; manual_entry: number }[])[0]
    if (!krow) return NextResponse.json({ message: 'ไม่พบ KPI' }, { status: 404 })
    if (!isManualEntry(krow.manual_entry)) {
      return NextResponse.json({ message: 'KPI นี้ไม่ได้ตั้งเป็น "กรอกค่าเอง" (manual) — ติ๊กในหน้า /admin ก่อน' }, { status: 400 })
    }
    // ownership: admin แก้ได้ทุกตัว / staff เฉพาะ KPI ที่กลุ่มงานตัวเองรับผิดชอบ (kpi_work_groups)
    if (!(await canEditManualKpi(conn, session, kpiId))) {
      // แยกข้อความ: "ยังไม่มีกลุ่มงาน" (แก้ที่ /admin) ต่างจาก "มีกลุ่มงานแต่ไม่ใช่เจ้าของ KPI นี้"
      const noDept = session.role !== 'admin' && !session.department.trim()
      return NextResponse.json({
        message: noDept
          ? 'บัญชีนี้ยังไม่มีกลุ่มงาน — ติดต่อผู้ดูแลระบบให้ตั้งกลุ่มงานก่อนจึงจะกรอกผลงานได้'
          : 'ไม่มีสิทธิ์กรอกผลงาน KPI นี้ — ต้องเป็นผู้ดูแลระบบ หรือเจ้าหน้าที่กลุ่มงานที่รับผิดชอบ',
      }, { status: 403 })
    }
    // เดือน: admin แก้ย้อนหลังได้ / staff แก้ได้เฉพาะเดือนปัจจุบัน (owner ขอ 2026-07-20)
    if (!isEditableMonth(session, month)) {
      return NextResponse.json({ message: monthLockMessage() }, { status: 403 })
    }
    const kpiTarget = Number(krow.target ?? 0)

    // ครอบ transaction: DELETE→INSERT→upsert ทั้งก้อน (ถ้าพังกลางคัน rollback ข้อมูลเก่าไม่หาย)
    await conn.beginTransaction()

    // ถ้าเดือนนี้มีข้อมูลเดิมอยู่ → เก็บลง data_change_log (action=overwrite) ก่อนทับ (กู้คืนได้)
    const [oldM] = await conn.execute(
      'SELECT value, target, source FROM monthly_data WHERE kpi_id = ? AND month = ?', [kpiId, month],
    )
    const prevMonthly = (oldM as { value: number; target: number; source: string }[])[0]
    if (prevMonthly) {
      const [oldD] = await conn.execute(
        'SELECT hospcode, data FROM moph_monthly_detail WHERE kpi_id = ? AND month = ?', [kpiId, month],
      )
      const oldData = JSON.stringify({ monthly: prevMonthly, detail: oldD as { hospcode: string; data: string }[] })
      await conn.execute(
        `INSERT INTO data_change_log (kpi_id, month, action, old_data, changed_by)
         VALUES (?, ?, 'overwrite', ?, ?)`,
        [kpiId, month, oldData, enteredBy],
      )
    }

    // ล้าง detail เดือนนี้ก่อน → ใส่รายหน่วยใหม่ (กันค่าเก่า/auto/รายตำบลเดิมปนกัน)
    await conn.execute('DELETE FROM moph_monthly_detail WHERE kpi_id = ? AND month = ?', [kpiId, month])
    let sumT = 0, sumR = 0
    for (const r of clean) {
      sumT += r.target; sumR += r.result
      await conn.execute(
        `INSERT INTO moph_monthly_detail (kpi_id, month, hospcode, areacode, data)
         VALUES (?, ?, ?, '', ?)`,
        [kpiId, month, r.hospcode, JSON.stringify({ target: r.target, result: r.result })],
      )
    }
    const value = sumT > 0 ? +((sumR / sumT) * 100).toFixed(2) : 0

    // รวมอำเภอ → monthly_data (+ audit)
    await conn.execute(
      `INSERT INTO monthly_data (kpi_id, month, value, target, source, entered_by, entered_at)
       VALUES (?,?,?,?, 'manual', ?, NOW())
       ON DUPLICATE KEY UPDATE value=VALUES(value), target=VALUES(target),
         source='manual', entered_by=VALUES(entered_by), entered_at=NOW()`,
      [kpiId, month, value, kpiTarget, enteredBy],
    )
    await conn.commit()
    return NextResponse.json({ ok: true, message: 'บันทึกรายหน่วยบริการสำเร็จ', value, sumTarget: sumT, sumResult: sumR })
  } catch (err) {
    await conn.rollback().catch(() => {})
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
