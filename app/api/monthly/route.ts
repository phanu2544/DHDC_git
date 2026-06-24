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
        'SELECT kpi_id as kpiId, month, value, target FROM monthly_data WHERE kpi_id = ? ORDER BY month',
        [kpiId],
      )
    } else {
      ;[rows] = await conn.execute(
        'SELECT kpi_id as kpiId, month, value, target FROM monthly_data ORDER BY kpi_id, month',
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
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const kpiId = searchParams.get('kpiId')
  const month = searchParams.get('month')
  if (!kpiId || !month) {
    return NextResponse.json({ message: 'ต้องระบุ kpiId และ month' }, { status: 400 })
  }
  const conn = await pool.getConnection()
  try {
    const [result] = await conn.execute(
      'DELETE FROM monthly_data WHERE kpi_id = ? AND month = ?', [kpiId, month],
    )
    const affected = (result as { affectedRows: number }).affectedRows
    if (affected === 0) return NextResponse.json({ message: 'ไม่พบข้อมูลที่จะลบ' }, { status: 404 })
    return NextResponse.json({ ok: true, message: `ลบข้อมูลเดือน ${month} ของ ${kpiId} สำเร็จ` })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
