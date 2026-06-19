import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { signSession, COOKIE_NAME, cookieOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ message: 'กรุณากรอกอีเมลและรหัสผ่าน' }, { status: 400 })
  }

  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.execute(
      'SELECT id, email, name, role, department FROM users WHERE email = ? AND password = ?',
      [email, password],
    )
    const users = rows as { id: string; email: string; name: string; role: string; department: string }[]
    if (users.length === 0) {
      return NextResponse.json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 })
    }
    const user = users[0]
    // Auth-1: ออก signed JWT → เซ็ตเป็น HttpOnly cookie (client ยังได้ user object ไว้แสดง UI เหมือนเดิม)
    const token = await signSession({ sub: user.id, email: user.email, name: user.name, role: user.role })
    const res = NextResponse.json({ user })
    res.cookies.set(COOKIE_NAME, token, cookieOptions)
    return res
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ message: 'เกิดข้อผิดพลาดกับฐานข้อมูล' }, { status: 500 })
  } finally {
    conn.release()
  }
}
