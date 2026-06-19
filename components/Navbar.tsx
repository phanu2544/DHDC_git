'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { setSession } from '@/lib/storage'
import type { User } from '@/lib/types'

interface NavbarProps {
  user: User
}

const NAV_LINKS = [
  { href: '/dashboard', label: 'ภาพรวม' },
  { href: '/kpi', label: 'รายการ KPI' },
  { href: '/compare', label: 'เปรียบเทียบรายเดือน' },
]

export default function Navbar({ user }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }) } catch { /* เคลียร์ฝั่ง client ต่อแม้ API ล่ม */ }
    setSession(null)
    router.push('/login')
  }

  return (
    <nav className="bg-blue-900 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <div className="font-bold text-lg tracking-wide">
              🏥 DHDC <span className="text-blue-300 text-sm font-normal">ระบบติดตาม KPI</span>
            </div>
            <div className="hidden md:flex gap-1">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    pathname.startsWith(href)
                      ? 'bg-blue-700 text-white'
                      : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                  }`}
                >
                  {label}
                </Link>
              ))}
              {user.role === 'admin' && (
                <>
                  <Link
                    href="/admin/targets"
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      pathname === '/admin/targets'
                        ? 'bg-blue-700 text-white'
                        : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                    }`}
                  >
                    ตั้งเป้าหมาย
                  </Link>
                  <Link
                    href="/admin"
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      pathname === '/admin'
                        ? 'bg-blue-700 text-white'
                        : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                    }`}
                  >
                    จัดการระบบ
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm hidden md:block">
              <div className="font-medium">{user.name}</div>
              <div className="text-blue-300 text-xs">
                {user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่'} • {user.department}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="bg-blue-700 hover:bg-blue-600 text-white text-sm px-3 py-1.5 rounded-md transition-colors"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
