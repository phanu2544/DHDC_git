import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { COOKIE_NAME, verifySession } from '@/lib/auth'

/**
 * Auth-1 — ด่านตรวจกลางสำหรับ /api/* (รันก่อนเข้า route)
 * ไม่ผ่าน = 401 ทันที · ตรวจแค่ลายเซ็น cookie (stateless ไม่แตะ DB) → ทำงานบน edge ได้
 *
 * whitelist (เข้าได้ก่อน login):
 *  - /api/auth/login, /api/auth/logout — เส้น auth เอง
 *  - /api/dbinfo — หน้า login เรียกดู label DB ก่อน auth
 *  - /api/init   — bootstrap schema/seed บน DB ใหม่ (ยังไม่มี user ให้ login) · idempotent (CREATE IF NOT EXISTS / INSERT IGNORE)
 */
const PUBLIC_API = new Set(['/api/auth/login', '/api/auth/logout', '/api/dbinfo', '/api/init'])

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_API.has(pathname)) return NextResponse.next()

  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token || !(await verifySession(token))) {
    return NextResponse.json({ ok: false, message: 'ไม่ได้เข้าสู่ระบบ' }, { status: 401 })
  }
  return NextResponse.next()
}

export const config = { matcher: ['/api/:path*'] }
