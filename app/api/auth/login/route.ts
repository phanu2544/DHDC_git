import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { signSession, COOKIE_NAME, cookieOptions } from '@/lib/auth'
import { verifyPassword } from '@/lib/password'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ message: 'กรุณากรอกอีเมลและรหัสผ่าน' }, { status: 400 })
  }

  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.execute(
      'SELECT id, email, name, role, department, password FROM users WHERE email = ?',
      [email],
    )
    const found = (rows as { id: string; email: string; name: string; role: string; department: string; password: string }[])[0]
    if (!found || !(await verifyPassword(password, found.password))) {
      return NextResponse.json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 })
    }
    // ไม่ส่ง password กลับ client
    const user = { id: found.id, email: found.email, name: found.name, role: found.role, department: found.department }
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
