import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { COOKIE_NAME, verifySession } from '@/lib/auth'
import { isManualEntry } from '@/lib/manualKpi'

/**
 * POST /api/monthly/detail — บันทึกค่า manual "รายตำบล" (KPI ที่กรอกเอง)
 * body: { kpiId, month, rows: [{ code, target, result }] }  (code = รหัสตำบล 2 หลัก)
 *
 * - เก็บรายตำบลลง moph_monthly_detail (hospcode='manual', areacode=6611+code+00, data={target,result})
 *   → หน้า drilldown คำนวณ %/ตำบล จากตารางนี้ด้วย mapping result/target (reuse logic เดิม)
 * - คำนวณรวมอำเภอ ΣA/ΣB → upsert monthly_data (+ audit: source/entered_by/entered_at)
 * - middleware: อยู่ใต้ /api/monthly → admin-mutate เท่านั้น
 */
export async function POST(req: NextRequest) {
  const { kpiId, month, rows } = await req.json()
  if (!kpiId || !month || !Array.isArray(rows)) {
    return NextResponse.json({ message: 'ต้องระบุ kpiId, month, rows' }, { status: 400 })
  }

  // validate แต่ละตำบล: ตัวเลข ≥0, result ≤ target
  const clean: { code: string; target: number; result: number }[] = []
  for (const r of rows) {
    const target = Number(r.target) || 0
    const result = Number(r.result) || 0
    const code = String(r.code ?? '').padStart(2, '0')
    if (target < 0 || result < 0) return NextResponse.json({ message: 'ค่าต้องไม่ติดลบ' }, { status: 400 })
    if (result > target) return NextResponse.json({ message: `ตำบล ${code}: ผลงาน (A=${result}) ต้องไม่เกินฐาน (B=${target})` }, { status: 400 })
    clean.push({ code, target, result })
  }

  // audit: ผู้กรอกจาก session (ไม่เชื่อ client)
  const token = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null
  const enteredBy = session?.name || 'ไม่ทราบผู้กรอก'

  const conn = await pool.getConnection()
  try {
    // target รวมของ KPI + ตรวจว่าเป็น manual จริง (กันเรียก save ผิดตัว → cron จะมาทับทีหลัง)
    const [kr] = await conn.execute('SELECT target, manual_entry FROM kpi_reports WHERE id = ?', [kpiId])
    const krow = (kr as { target: number; manual_entry: number }[])[0]
    if (!krow) return NextResponse.json({ message: 'ไม่พบ KPI' }, { status: 404 })
    if (!isManualEntry(krow.manual_entry)) {
      return NextResponse.json({ message: 'KPI นี้ไม่ได้ตั้งเป็น "กรอกค่าเอง" (manual) — ติ๊กในหน้า /admin ก่อน' }, { status: 400 })
    }
    const kpiTarget = Number(krow.target ?? 0)

    // ล้าง detail เดือนนี้ก่อน → ใส่รายตำบลใหม่ (กันค่าเก่า/auto ปนกัน)
    await conn.execute('DELETE FROM moph_monthly_detail WHERE kpi_id = ? AND month = ?', [kpiId, month])
    let sumT = 0, sumR = 0
    for (const r of clean) {
      sumT += r.target; sumR += r.result
      await conn.execute(
        `INSERT INTO moph_monthly_detail (kpi_id, month, hospcode, areacode, data)
         VALUES (?, ?, 'manual', ?, ?)`,
        [kpiId, month, `6611${r.code}00`, JSON.stringify({ target: r.target, result: r.result })],
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
    return NextResponse.json({ ok: true, message: 'บันทึกรายตำบลสำเร็จ', value, sumTarget: sumT, sumResult: sumR })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
