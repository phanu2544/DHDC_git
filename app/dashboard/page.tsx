'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import Navbar from '@/components/Navbar'
import StatusBadge from '@/components/StatusBadge'
import { getSession } from '@/lib/storage'
import type { User, KPIReport } from '@/lib/types'

const PIE_COLORS = ['#22c55e', '#3b82f6', '#ef4444']

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [kpis, setKpis] = useState<KPIReport[]>([])
  const [latestMonth, setLatestMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const session = getSession()
    if (!session) { router.push('/login'); return }
    setUser(session)

    async function load() {
      try {
        const [kRes, mRes] = await Promise.all([
          fetch('/api/kpis'),
          fetch('/api/monthly'),
        ])
        if (!kRes.ok) throw new Error('โหลด KPI ไม่สำเร็จ')
        const kData: KPIReport[] = await kRes.json()
        setKpis(kData)

        const mData: { month: string }[] = await mRes.json()
        const months = Array.from(new Set(mData.map((m) => m.month))).sort()
        setLatestMonth(months[months.length - 1] || '')
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  if (!user) return null

  const completed = kpis.filter((k) => k.status === 'completed').length
  const inProgress = kpis.filter((k) => k.status === 'in_progress').length
  const overdue = kpis.filter((k) => k.status === 'overdue').length
  const total = kpis.length

  const pieData = [
    { name: 'เสร็จแล้ว', value: completed },
    { name: 'กำลังดำเนินการ', value: inProgress },
    { name: 'เกินกำหนด', value: overdue },
  ]

  const categoryCount: Record<string, number> = {}
  kpis.forEach((k) => { categoryCount[k.category] = (categoryCount[k.category] || 0) + 1 })

  const overduekpis = kpis.filter((k) => k.status === 'overdue')

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">ภาพรวม KPI</h1>
          <p className="text-gray-500 text-sm mt-1">
            {latestMonth
              ? `ข้อมูล ณ เดือน ${new Date(latestMonth + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}`
              : 'กำลังโหลด...'}
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-gray-400">กำลังโหลดข้อมูลจาก MariaDB...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <SummaryCard label="KPI ทั้งหมด" value={total} color="bg-gray-800" icon="📋" />
              <SummaryCard label="เสร็จแล้ว" value={completed} color="bg-green-600" icon="✅" />
              <SummaryCard label="กำลังดำเนินการ" value={inProgress} color="bg-blue-600" icon="🔄" />
              <SummaryCard label="เกินกำหนด" value={overdue} color="bg-red-600" icon="⚠️" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="font-semibold text-gray-800 mb-4">สัดส่วนสถานะ KPI</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} รายการ`]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="font-semibold text-gray-800 mb-4">KPI แยกตามหมวดหมู่</h2>
                <div className="space-y-3">
                  {Object.entries(categoryCount).map(([cat, count]) => (
                    <div key={cat}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">{cat}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(count / total) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="font-semibold text-gray-800 mb-4">ความสำเร็จโดยรวม</h2>
                <div className="flex items-center justify-center h-40">
                  <div className="text-center">
                    <div className="text-5xl font-bold text-blue-700">
                      {total > 0 ? Math.round((completed / total) * 100) : 0}
                      <span className="text-2xl text-gray-400">%</span>
                    </div>
                    <p className="text-gray-500 text-sm mt-2">KPI บรรลุเป้าหมาย</p>
                    <p className="text-gray-400 text-xs mt-1">{completed} จาก {total} ตัวชี้วัด</p>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 mt-4">
                  <div className="bg-green-500 h-3 rounded-full" style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }} />
                </div>
              </div>
            </div>

            {overduekpis.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border">
                <div className="px-6 py-4 border-b flex items-center gap-2">
                  <span className="text-red-500">⚠️</span>
                  <h2 className="font-semibold text-gray-800">KPI ที่เกินระยะเวลา ({overduekpis.length} รายการ)</h2>
                </div>
                <div className="divide-y">
                  {overduekpis.map((kpi) => (
                    <div key={kpi.id} className="px-6 py-4 flex flex-wrap items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{kpi.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          ผู้รับผิดชอบ: {kpi.owner} • กำหนด: {new Date(kpi.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <StatusBadge status={kpi.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div className={`${color} text-white rounded-xl p-5 shadow-sm`}>
      <div className="text-3xl mb-1">{icon}</div>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm opacity-90 mt-1">{label}</div>
    </div>
  )
}
