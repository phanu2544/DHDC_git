'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/useAuth'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import Navbar from '@/components/Navbar'
import StatusBadge from '@/components/StatusBadge'
import type { KPIReport, MonthlyData } from '@/lib/types'

export default function ComparePage() {
  const { user } = useAuth()
  const [kpis, setKpis] = useState<KPIReport[]>([])
  const [monthly, setMonthly] = useState<MonthlyData[]>([])
  const [months, setMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    async function load() {
      try {
        const [kRes, mRes] = await Promise.all([fetch('/api/kpis'), fetch('/api/monthly')])
        const kData: KPIReport[] = await kRes.json()
        const mData: MonthlyData[] = await mRes.json()
        setKpis(kData)
        setMonthly(mData)
        const mlist = Array.from(new Set(mData.map((m) => m.month))).sort()
        setMonths(mlist)
        setSelectedMonth(mlist[mlist.length - 1] || '')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  if (!user) return null

  const prevMonth = months[months.indexOf(selectedMonth) - 1] || ''

  function getVal(kpiId: string, month: string) {
    return monthly.find((m) => m.kpiId === kpiId && m.month === month)?.value ?? null
  }

  function getSparkData(kpiId: string) {
    return months.map((m) => ({ m: m.slice(2), v: getVal(kpiId, m) })).filter((d) => d.v !== null)
  }

  function formatMonth(m: string) {
    if (!m) return '-'
    return new Date(m + '-01').toLocaleDateString('th-TH', { month: 'short', year: 'numeric' })
  }

  function changeBadge(cur: number | null, prev: number | null) {
    if (cur === null || prev === null) return null
    const diff = +(cur - prev).toFixed(1)
    if (diff > 0) return <span className="text-green-600 font-medium">▲ {diff}</span>
    if (diff < 0) return <span className="text-red-600 font-medium">▼ {Math.abs(diff)}</span>
    return <span className="text-gray-400">─</span>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">เปรียบเทียบรายเดือน</h1>
            <p className="text-gray-500 text-sm mt-1">ติดตามความก้าวหน้าแต่ละเดือน</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">เลือกเดือน:</label>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 text-sm text-blue-700 flex flex-wrap gap-6">
          <span>▲ เพิ่มขึ้นจากเดือนก่อน</span>
          <span>▼ ลดลงจากเดือนก่อน</span>
          <span>เส้นกราฟ = แนวโน้ม 6 เดือน</span>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {loading ? (
            <div className="text-center py-16 text-gray-400">กำลังโหลดข้อมูลจาก MariaDB...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">ชื่อ KPI</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">{formatMonth(prevMonth) || 'เดือนก่อน'}</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">{formatMonth(selectedMonth)}</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">เปลี่ยนแปลง</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">เป้าหมาย</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">แนวโน้ม</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {kpis.map((kpi) => {
                    const cur = getVal(kpi.id, selectedMonth)
                    const prev = getVal(kpi.id, prevMonth)
                    const spark = getSparkData(kpi.id)
                    return (
                      <tr key={kpi.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 line-clamp-2 text-xs">{kpi.name}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{kpi.owner}</p>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{prev !== null ? `${prev} ${kpi.unit}` : '-'}</td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-900">{cur !== null ? `${cur} ${kpi.unit}` : '-'}</td>
                        <td className="px-4 py-3 text-center">{changeBadge(cur, prev)}</td>
                        <td className="px-4 py-3 text-center text-blue-600 font-medium">{kpi.target} {kpi.unit}</td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <ResponsiveContainer width={100} height={40}>
                            <LineChart data={spark}>
                              <Line type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                              <Tooltip formatter={(v) => [`${v} ${kpi.unit}`]} labelFormatter={(l) => `เดือน ${l}`} />
                              <XAxis dataKey="m" hide /><YAxis hide />
                            </LineChart>
                          </ResponsiveContainer>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={kpi.status} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
