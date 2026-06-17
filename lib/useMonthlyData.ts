'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/storage'
import type { User } from '@/lib/types'

/**
 * Phase 8 — state กลางของหน้า drilldown ที่อ่านผ่าน lib/monthlyView
 * รวม boilerplate ที่ซ้ำกันทุกหน้า: user/session, data, month, loading, error, fetch
 * หน้าที่ใช้ยังสร้าง URL เอง (param ต่างกัน เช่น table/disease) ผ่าน loadUrl()
 */
export interface MonthlyBase {
  ok: boolean
  message?: string
  source: 'snapshot' | 'live'
  month: string | null
  availableMonths: string[]
}

export function useMonthlyData<T extends MonthlyBase>() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [data, setData] = useState<T | null>(null)
  const [month, setMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /** ตรวจ session — คืน user หรือ null (ถ้าไม่มี → redirect ไป /login) */
  const requireSession = useCallback((): User | null => {
    const s = getSession()
    if (!s) { router.push('/login'); return null }
    setUser(s)
    return s
  }, [router])

  /** ยิง fetch URL (หน้าสร้างเอง) → set data + month + loading/error */
  const loadUrl = useCallback((url: string) => {
    setLoading(true); setError('')
    fetch(url)
      .then((r) => r.json())
      .then((j: T) => {
        if (!j.ok) throw new Error(j.message || 'โหลดไม่สำเร็จ')
        setData(j); setMonth(j.source === 'live' ? 'live' : (j.month ?? ''))
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return { user, data, month, loading, error, requireSession, loadUrl }
}
