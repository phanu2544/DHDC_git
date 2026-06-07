'use client'

import type { User } from './types'

const SESSION_KEY = 'dhdc_session'

export function getSession(): User | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(SESSION_KEY)
  return raw ? (JSON.parse(raw) as User) : null
}

export function setSession(user: User | null) {
  if (typeof window === 'undefined') return
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(SESSION_KEY)
  }
}
