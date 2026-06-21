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

// role-guard: เส้นที่ต้องเป็น admin
const ADMIN_ALL = ['/api/users']                                       // admin ทุก method (จัดการผู้ใช้ — รวมการดูรายชื่อ)
const ADMIN_MUTATE = ['/api/kpis', '/api/categories', '/api/monthly', '/api/moph'] // admin เฉพาะ mutation (GET เปิดให้ผู้ที่ login)

const underAny = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(p + '/'))

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_API.has(pathname)) return NextResponse.next()

  const token = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null
  if (!session) {
    return NextResponse.json({ ok: false, message: 'ไม่ได้เข้าสู่ระบบ' }, { status: 401 })
  }

  // ต้องเป็น admin ถ้า: เส้น admin-only ทุก method · หรือ เป็น mutation บนเส้น admin-mutate
  const needAdmin =
    underAny(pathname, ADMIN_ALL) ||
    (req.method !== 'GET' && underAny(pathname, ADMIN_MUTATE))
  if (needAdmin && session.role !== 'admin') {
    return NextResponse.json({ ok: false, message: 'ต้องเป็นผู้ดูแลระบบ (admin)' }, { status: 403 })
  }

  return NextResponse.next()
}

export const config = { matcher: ['/api/:path*'] }
