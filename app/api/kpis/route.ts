import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.execute(
      `SELECT id, name, category,
              moph_url        as mophUrl,
              moph_table      as mophTable,
              moph_value_field as mophValueField,
              moph_target_field as mophTargetField,
              moph_calc_mode  as mophCalcMode,
              owner,
              DATE_FORMAT(deadline,'%Y-%m-%d') as deadline,
              status, target, unit, description
       FROM kpi_reports ORDER BY category, name`,
    )
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, category, mophUrl, mophTable, mophValueField, mophTargetField, mophCalcMode,
          owner, deadline, status, target, unit, description } = body

  if (!name || !owner || !deadline) {
    return NextResponse.json({ message: 'กรุณากรอกข้อมูลที่จำเป็น' }, { status: 400 })
  }

  const id = `kpi-${Date.now()}`
  const conn = await pool.getConnection()
  try {
    await conn.execute(
      `INSERT INTO kpi_reports
        (id, name, category, moph_url, moph_table, moph_value_field, moph_target_field, moph_calc_mode,
         owner, deadline, status, target, unit, description)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, name, category,
       mophUrl ?? null, mophTable ?? null, mophValueField ?? null, mophTargetField ?? null, mophCalcMode ?? 'percent',
       owner, deadline, status ?? 'in_progress', target ?? 0, unit ?? '%', description ?? null],
    )
    return NextResponse.json({ id, message: 'เพิ่ม KPI สำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
