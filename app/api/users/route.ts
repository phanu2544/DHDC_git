import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashPassword } from '@/lib/password'

export async function GET() {
  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.execute(
      'SELECT id, email, name, role, title, department FROM users ORDER BY role DESC, name',
    )
    return NextResponse.json(rows)
  } catch (err) {
    console.error('GET /api/users error:', err)
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function POST(req: NextRequest) {
  const { email, name, password, role, title, department } = await req.json()
  if (!email || !name || !password) {
    return NextResponse.json({ message: 'กรุณากรอก email, ชื่อ และรหัสผ่าน' }, { status: 400 })
  }
  // generate a short unique id: "u" + timestamp36 + random4
  const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const conn = await pool.getConnection()
  try {
    await conn.execute(
      'INSERT INTO users (id, email, password, name, role, title, department) VALUES (?,?,?,?,?,?,?)',
      [id, email, await hashPassword(password), name, role ?? 'staff', title ?? null, department ?? ''],
    )
    return NextResponse.json({ ok: true, id, message: 'เพิ่มผู้ใช้สำเร็จ' })
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    if (code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ message: 'อีเมลนี้มีอยู่ในระบบแล้ว' }, { status: 409 })
    }
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
