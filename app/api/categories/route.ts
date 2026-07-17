import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/categories → string[] (ค่าเริ่มต้น ใช้กับ dropdown ทั่วไป)
// GET /api/categories?detail=1 → { name, groupName }[] (ใช้กับหน้าจัดการหมวดหมู่ใน /admin)
export async function GET(req: NextRequest) {
  const detail = new URL(req.url).searchParams.get('detail')
  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.execute(
      'SELECT name, group_name FROM categories ORDER BY sort_order ASC, id ASC',
    )
    const list = rows as { name: string; group_name: string | null }[]
    if (detail) {
      return NextResponse.json(list.map((r) => ({ name: r.name, groupName: r.group_name })))
    }
    return NextResponse.json(list.map((r) => r.name))
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

// POST /api/categories  body: { name, groupName? }
export async function POST(req: NextRequest) {
  const { name, groupName } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ message: 'กรุณาระบุชื่อหมวดหมู่' }, { status: 400 })
  }
  const conn = await pool.getConnection()
  try {
    await conn.execute(
      'INSERT INTO categories (name, group_name) VALUES (?, ?)',
      [name.trim(), groupName?.trim() || null],
    )
    return NextResponse.json({ ok: true, message: 'เพิ่มหมวดหมู่สำเร็จ' })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ message: 'หมวดหมู่นี้มีอยู่แล้ว' }, { status: 409 })
    }
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

// DELETE /api/categories?name=NCD
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name')
  if (!name) {
    return NextResponse.json({ message: 'ต้องระบุชื่อหมวดหมู่' }, { status: 400 })
  }
  const conn = await pool.getConnection()
  try {
    // ตรวจสอบว่ามี KPI ใช้หมวดหมู่นี้อยู่หรือไม่
    const [kpis] = await conn.execute(
      'SELECT COUNT(*) as count FROM kpi_reports WHERE category = ?', [name],
    )
    const count = (kpis as { count: number }[])[0].count
    if (count > 0) {
      return NextResponse.json(
        { message: `ลบไม่ได้ — มี ${count} KPI ใช้หมวดหมู่นี้อยู่` },
        { status: 409 },
      )
    }
    const [result] = await conn.execute('DELETE FROM categories WHERE name = ?', [name])
    const affected = (result as { affectedRows: number }).affectedRows
    if (affected === 0) return NextResponse.json({ message: 'ไม่พบหมวดหมู่' }, { status: 404 })
    return NextResponse.json({ ok: true, message: 'ลบหมวดหมู่สำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
