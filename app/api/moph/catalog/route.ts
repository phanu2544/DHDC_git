import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/moph/catalog  → รายการ catalog ทั้งหมด
export async function GET() {
  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.execute(
      `SELECT id, name, moph_table, value_field, target_field, calc_mode,
              category, province, hospcode, description, active,
              DATE_FORMAT(created_at,'%Y-%m-%d') as created_at
       FROM moph_report_catalog
       ORDER BY category, name`,
    )
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

// POST /api/moph/catalog  → เพิ่ม/แก้ไข report ใน catalog
export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    id, name, mophTable, valueField, targetField, calcMode,
    category, province, hospcode, areacode, description,
  } = body

  if (!id || !name || !mophTable) {
    return NextResponse.json({ message: 'กรุณาระบุ id, name, mophTable' }, { status: 400 })
  }

  const conn = await pool.getConnection()
  try {
    await conn.execute(
      `INSERT INTO moph_report_catalog
         (id, name, moph_table, value_field, target_field, calc_mode,
          category, province, hospcode, areacode, description, active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,1)
       ON DUPLICATE KEY UPDATE
         name         = VALUES(name),
         moph_table   = VALUES(moph_table),
         value_field  = VALUES(value_field),
         target_field = VALUES(target_field),
         calc_mode    = VALUES(calc_mode),
         category     = VALUES(category),
         province     = VALUES(province),
         hospcode     = VALUES(hospcode),
         areacode     = VALUES(areacode),
         description  = VALUES(description)`,
      [
        id, name, mophTable,
        valueField ?? 'result', targetField ?? 'target', calcMode ?? 'percent',
        category ?? null, province ?? '66', hospcode ?? '', areacode ?? '', description ?? null,
      ],
    )
    return NextResponse.json({ ok: true, message: 'บันทึกรายงานสำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

// DELETE /api/moph/catalog?id=xxx
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ message: 'ต้องระบุ id' }, { status: 400 })
  const conn = await pool.getConnection()
  try {
    await conn.execute('DELETE FROM moph_report_catalog WHERE id = ?', [id])
    return NextResponse.json({ ok: true, message: 'ลบสำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
