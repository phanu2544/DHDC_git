import bcrypt from 'bcryptjs'

/**
 * Auth-2 — hash/verify รหัสผ่าน (bcrypt)
 * ไฟล์นี้ใช้เฉพาะ route handler (node) — ห้าม import เข้า middleware (edge)
 */
const ROUNDS = 10

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS)
}

/**
 * เทียบรหัสผ่าน · รองรับ transition: ถ้าค่าใน DB ยังเป็น plaintext (ไม่ขึ้นต้น $2)
 * ให้เทียบตรงไปก่อน เพื่อไม่ให้ login พังระหว่างยัง migrate ไม่ครบ
 * (หลัง migrate ทุก row เป็น hash → branch นี้ไม่ถูกใช้)
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored) return false
  if (!stored.startsWith('$2')) return plain === stored
  try {
    return await bcrypt.compare(plain, stored)
  } catch {
    return false
  }
}
