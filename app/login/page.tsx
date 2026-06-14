'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setSession } from '@/lib/storage'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [dbInfo, setDbInfo] = useState<{ host: string; port: number; database: string; label: string } | null>(null)

  useEffect(() => {
    fetch('/api/dbinfo').then((r) => r.json()).then(setDbInfo).catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'เกิดข้อผิดพลาด')
        return
      }
      setSession(data.user)
      router.push('/dashboard')
    } catch {
      setError('ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่อ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏥</div>
          <h1 className="text-2xl font-bold text-gray-900">DHDC KPI System</h1>
          <p className="text-gray-500 mt-1 text-sm">ระบบติดตามตัวชี้วัด HDC กระทรวงสาธารณสุข</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="email@hospital.go.th"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="รหัสผ่าน"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-800 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600 mb-2">บัญชีทดสอบ:</p>
          <p>👑 Admin: admin@hospital.go.th / admin123</p>
          <p>👤 Staff: staff@hospital.go.th / staff123</p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          🗄️ MariaDB: {dbInfo ? `${dbInfo.host}:${dbInfo.port} / ${dbInfo.database} (${dbInfo.label})` : '...'}
        </p>
      </div>
    </div>
  )
}
