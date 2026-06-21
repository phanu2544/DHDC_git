/**
 * Rate limiter แบบ in-memory (fixed window) — กัน brute-force login
 * เก็บใน process เดียว (dev/PM2 single instance พอ) · รีเซ็ตเมื่อ restart
 * หมายเหตุ: ถ้า scale หลาย instance ในอนาคต ต้องย้ายไป store กลาง (Redis)
 */
interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export interface RateLimitResult {
  ok: boolean
  retryAfterSec: number
  remaining: number
}

/**
 * นับจำนวนครั้งต่อ key ภายใน window
 * @param key   ตัวระบุผู้เรียก (เช่น "login:<ip>")
 * @param limit จำนวนครั้งสูงสุดต่อ window
 * @param windowMs ความยาว window (ms)
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const b = buckets.get(key)

  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSec: 0, remaining: limit - 1 }
  }

  if (b.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000), remaining: 0 }
  }

  b.count++
  return { ok: true, retryAfterSec: 0, remaining: limit - b.count }
}

/** ล้าง bucket ของ key (เรียกเมื่อ login สำเร็จ เพื่อไม่ให้ติด limit จากความพยายามก่อนหน้า) */
export function rateLimitReset(key: string): void {
  buckets.delete(key)
}
