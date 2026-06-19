import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME, verifySession } from '@/lib/auth'

/** Auth-1 — คืน user ปัจจุบันจาก session cookie (ใช้ยืนยันสถานะ login ฝั่ง server) */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  return NextResponse.json({
    ok: true,
    user: { id: session.sub, email: session.email, name: session.name, role: session.role },
  })
}
