'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setSession } from './storage'
import type { User } from './types'

/**
 * Auth-3 — ยืนยันตัวตนจาก server (`/api/auth/me` อ่าน signed HttpOnly cookie) ไม่เชื่อ localStorage
 * เหตุผล: role ใน localStorage ปลอมได้ (devtools) → เดิม UI admin โผล่ได้แม้ API จะ 403
 * ตอนนี้ identity/role มาจาก cookie ที่ server เซ็นเท่านั้น
 *
 *  - ไม่มี session (401) → เด้งไป /login
 *  - requireAdmin + ไม่ใช่ admin → เด้งไป /dashboard
 *  - สำเร็จ → คืน user + sync localStorage ให้ตรงความจริง (เผื่อโค้ดเก่าอ่าน)
 */
export function useAuth(opts?: { requireAdmin?: boolean }): { user: User | null } {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const requireAdmin = opts?.requireAdmin ?? false

  useEffect(() => {
    let alive = true
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return
        const u: User | null = data?.user ?? null
        if (!u) {
          setSession(null)
          router.push('/login')
          return
        }
        if (requireAdmin && u.role !== 'admin') {
          router.push('/dashboard')
          return
        }
        setSession(u)
        setUser(u)
      })
      .catch(() => {
        if (alive) router.push('/login')
      })
    return () => {
      alive = false
    }
  }, [router, requireAdmin])

  return { user }
}
