import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { signSession, COOKIE_NAME, cookieOptions } from '@/lib/auth'
import { verifyPassword } from '@/lib/password'
import { rateLimit, rateLimitReset } from '@/lib/rateLimit'

// กัน brute-force: 10 ครั้ง / 5 นาที ต่อ IP (รีเซ็ตเมื่อ login สำเร็จ)
const LOGIN_LIMIT = 10
const LOGIN_WINDOW_MS = 5 * 60 * 1000

export async function POST(req: NextRequest) {
  // ระบุ client จาก proxy header (production หลัง reverse proxy) → fallback 'local'
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local'
  const rlKey = `login:${ip}`
  const rl = rateLimit(rlKey, LOGIN_LIMIT, LOGIN_WINDOW_MS)
  if (!rl.ok) {
    return NextResponse.json(
      { message: `พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ ${rl.retryAfterSec} วินาที` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

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
    // login สำเร็จ → ล้าง rate-limit ของ IP นี้ (ไม่ให้ติด limit จาก attempt ก่อนหน้า)
    rateLimitReset(rlKey)
    // Auth-1: ออก signed JWT → เซ็ตเป็น HttpOnly cookie (client ยังได้ user object ไว้แสดง UI เหมือนเดิม)
    const token = await signSession({ sub: user.id, email: user.email, name: user.name, role: user.role, department: user.department })
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
