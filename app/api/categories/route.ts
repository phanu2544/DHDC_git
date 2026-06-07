import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/categories → string[]
export async function GET() {
  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.execute(
      'SELECT name FROM categories ORDER BY sort_order ASC, id ASC',
    )
    return NextResponse.json((rows as { name: string }[]).map((r) => r.name))
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

// POST /api/categories  body: { name }
export async function POST(req: NextRequest) {
  const { name } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ message: 'กรุณาระบุชื่อหมวดหมู่' }, { status: 400 })
  }
  const conn = await pool.getConnection()
  try {
    await conn.execute('INSERT INTO categories (name) VALUES (?)', [name.trim()])
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
