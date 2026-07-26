import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { COOKIE_NAME, verifySession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const kpiId = searchParams.get('kpiId')

  const conn = await pool.getConnection()
  try {
    let rows
    if (kpiId) {
      ;[rows] = await conn.execute(
        'SELECT kpi_id as kpiId, month, value, target, value_text as valueText FROM monthly_data WHERE kpi_id = ? ORDER BY month',
        [kpiId],
      )
    } else {
      ;[rows] = await conn.execute(
        'SELECT kpi_id as kpiId, month, value, target, value_text as valueText FROM monthly_data ORDER BY kpi_id, month',
      )
    }
    return NextResponse.json(rows)
  } catch (err) {
    console.error('GET /api/monthly error:', err)
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function POST(req: NextRequest) {
  const { kpiId, month, value, target } = await req.json()
  // audit: เก็บผู้กรอกจาก session (POST นี้ = กรอกค่าเอง manual) — ไม่เชื่อ client
  const token = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null
  const enteredBy = session?.name || 'ไม่ทราบผู้กรอก'
  const conn = await pool.getConnection()
  try {
    await conn.execute(
      `INSERT INTO monthly_data (kpi_id, month, value, target, source, entered_by, entered_at)
       VALUES (?,?,?,?, 'manual', ?, NOW())
       ON DUPLICATE KEY UPDATE value=VALUES(value), target=VALUES(target),
         source='manual', entered_by=VALUES(entered_by), entered_at=NOW()`,
      [kpiId, month, value, target, enteredBy],
    )
    return NextResponse.json({ message: 'บันทึกข้อมูลรายเดือนสำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

// DELETE /api/monthly?kpiId=xxx&month=YYYY-MM
// ลบทั้ง monthly_data + moph_monthly_detail (กัน orphan) + เก็บค่าเก่าลง data_change_log (audit/กู้คืน) ใน transaction
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const kpiId = searchParams.get('kpiId')
  const month = searchParams.get('month')
  if (!kpiId || !month) {
    return NextResponse.json({ message: 'ต้องระบุ kpiId และ month' }, { status: 400 })
  }
  // audit: ใครลบ (จาก session — ไม่เชื่อ client)
  const token = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null
  const changedBy = session?.name || 'ไม่ทราบผู้ลบ'

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // เก็บค่าเก่าก่อนลบ (monthly_data + รายหน่วย) → old_data JSON
    const [mRows] = await conn.execute(
      'SELECT value, target, source FROM monthly_data WHERE kpi_id = ? AND month = ?', [kpiId, month],
    )
    const monthly = (mRows as { value: number; target: number; source: string }[])[0]
    if (!monthly) {
      await conn.rollback()
      return NextResponse.json({ message: 'ไม่พบข้อมูลที่จะลบ' }, { status: 404 })
    }
    const [dRows] = await conn.execute(
      'SELECT hospcode, data FROM moph_monthly_detail WHERE kpi_id = ? AND month = ?', [kpiId, month],
    )
    const detail = dRows as { hospcode: string; data: string }[]
    const oldData = JSON.stringify({ monthly, detail })

    // log → ลบทั้ง 2 ตาราง (detail ไม่โดน FK cascade เพราะ cascade ผูกกับ kpi_reports ไม่ใช่ monthly_data)
    await conn.execute(
      `INSERT INTO data_change_log (kpi_id, month, action, old_data, changed_by)
       VALUES (?, ?, 'delete', ?, ?)`,
      [kpiId, month, oldData, changedBy],
    )
    await conn.execute('DELETE FROM monthly_data WHERE kpi_id = ? AND month = ?', [kpiId, month])
    await conn.execute('DELETE FROM moph_monthly_detail WHERE kpi_id = ? AND month = ?', [kpiId, month])

    await conn.commit()
    return NextResponse.json({ ok: true, message: `ลบข้อมูลเดือน ${month} ของ ${kpiId} สำเร็จ` })
  } catch (err) {
    await conn.rollback().catch(() => {})
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
