import { SignJWT, jwtVerify } from 'jose'

/**
 * Auth-1 — session แบบ signed JWT ใน HttpOnly cookie
 * ใช้ได้ทั้งฝั่ง route handler (node) และ middleware (edge) — jose รองรับทั้งคู่
 * (ไฟล์นี้ห้าม import อะไรที่เป็น node-only เช่น lib/db เพราะ middleware รันบน edge)
 */
export const COOKIE_NAME = 'dhdc_auth'
const MAX_AGE_SEC = 60 * 60 * 8 // อายุ session 8 ชม.

// ⚠️ production ต้องตั้ง AUTH_SECRET (ค่าสุ่มยาว) ใน .env.local
// dev ไม่มี .env.local → ใช้ fallback ชั่วคราว (ไม่ปลอดภัย ห้ามใช้จริง)
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'dev-only-insecure-secret-change-in-production',
)

export interface SessionPayload {
  sub: string // user id
  email: string
  name: string
  role: string
}

/** เซ็น JWT จากข้อมูล user → string เก็บใน cookie */
export async function signSession(p: SessionPayload): Promise<string> {
  return new SignJWT({ email: p.email, name: p.name, role: p.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(secret)
}

/** ตรวจลายเซ็น + อายุ → คืน payload ถ้าถูกต้อง, null ถ้าไม่ผ่าน/หมดอายุ/ปลอม */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return {
      sub: String(payload.sub ?? ''),
      email: String(payload.email ?? ''),
      name: String(payload.name ?? ''),
      role: String(payload.role ?? ''),
    }
  } catch {
    return null
  }
}

/** option ของ cookie ตอน set (logout ใช้ตัวนี้แล้ว override maxAge=0) */
export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: MAX_AGE_SEC,
  secure: process.env.NODE_ENV === 'production', // dev เป็น http → ต้อง false ไม่งั้น cookie ไม่ติด
}
