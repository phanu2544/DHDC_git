import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/work-groups → { name, sortOrder }[]
export async function GET() {
  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.execute(
      'SELECT name, sort_order FROM work_groups ORDER BY sort_order ASC, id ASC',
    )
    return NextResponse.json(
      (rows as { name: string; sort_order: number }[]).map((r) => ({ name: r.name, sortOrder: r.sort_order })),
    )
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

// POST /api/work-groups  body: { name }
export async function POST(req: NextRequest) {
  const { name } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ message: 'กรุณาระบุชื่อกลุ่มงาน' }, { status: 400 })
  }
  const conn = await pool.getConnection()
  try {
    const [maxRow] = await conn.execute('SELECT COALESCE(MAX(sort_order), 0) AS m FROM work_groups')
    const nextOrder = (maxRow as { m: number }[])[0].m + 1
    await conn.execute(
      'INSERT INTO work_groups (name, sort_order) VALUES (?, ?)',
      [name.trim(), nextOrder],
    )
    return NextResponse.json({ ok: true, message: 'เพิ่มกลุ่มงานสำเร็จ' })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ message: 'กลุ่มงานนี้มีอยู่แล้ว' }, { status: 409 })
    }
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

// DELETE /api/work-groups?name=ปฐมภูมิ
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name')
  if (!name) {
    return NextResponse.json({ message: 'ต้องระบุชื่อกลุ่มงาน' }, { status: 400 })
  }
  const conn = await pool.getConnection()
  try {
    // กัน DB integrity: ห้ามลบกลุ่มงานที่ยังมี KPI หรือ user สังกัดอยู่
    // (kpi_work_groups มี FK ON DELETE CASCADE จริง — เช็คชั้นนี้กันข้อมูลหายเงียบๆ ไม่ใช่กัน error)
    const [kwgRows] = await conn.execute(
      'SELECT COUNT(*) as count FROM kpi_work_groups WHERE work_group = ?', [name],
    )
    const kwgCount = (kwgRows as { count: number }[])[0].count
    const [userRows] = await conn.execute(
      'SELECT COUNT(*) as count FROM users WHERE department = ?', [name],
    )
    const userCount = (userRows as { count: number }[])[0].count
    if (kwgCount > 0 || userCount > 0) {
      const parts = []
      if (kwgCount > 0) parts.push(`${kwgCount} KPI`)
      if (userCount > 0) parts.push(`${userCount} ผู้ใช้`)
      return NextResponse.json(
        { message: `ลบไม่ได้ — มี ${parts.join(' และ ')} สังกัดกลุ่มงานนี้อยู่` },
        { status: 409 },
      )
    }
    const [result] = await conn.execute('DELETE FROM work_groups WHERE name = ?', [name])
    const affected = (result as { affectedRows: number }).affectedRows
    if (affected === 0) return NextResponse.json({ message: 'ไม่พบกลุ่มงาน' }, { status: 404 })
    return NextResponse.json({ ok: true, message: 'ลบกลุ่มงานสำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
