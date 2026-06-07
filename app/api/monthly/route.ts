import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

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
  const conn = await pool.getConnection()
  try {
    await conn.execute(
      `INSERT INTO monthly_data (kpi_id, month, value, target) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE value=VALUES(value), target=VALUES(target)`,
      [kpiId, month, value, target],
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
