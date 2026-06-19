import { NextResponse } from 'next/server'
import { COOKIE_NAME, cookieOptions } from '@/lib/auth'

/** Auth-1 — ออกจากระบบ: ลบ cookie (maxAge=0) */
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', { ...cookieOptions, maxAge: 0 })
  return res
}
