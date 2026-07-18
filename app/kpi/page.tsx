'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/useAuth'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import Navbar from '@/components/Navbar'
import StatusBadge from '@/components/StatusBadge'
import type { KPIReport, KPIStatus, KPICategory } from '@/lib/types'

const STATUSES = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'completed', label: 'เสร็จแล้ว' },
  { value: 'in_progress', label: 'กำลังดำเนินการ' },
  { value: 'overdue', label: 'เกินกำหนด' },
]

export default function KPIListPage() {
  const { user } = useAuth()
  const [kpis, setKpis] = useState<KPIReport[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('ทุกหมวด')
  const [statusFilter, setStatusFilter] = useState('')
  const [onlyMyGroup, setOnlyMyGroup] = useState(false)
  const [selected, setSelected] = useState<KPIReport | null>(null)
  const [chartData, setChartData] = useState<{ month: string; value: number; target: number }[]>([])
  const [chartLoading, setChartLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    Promise.all([fetch('/api/kpis'), fetch('/api/categories')])
      .then(async ([kRes, cRes]) => {
        setKpis(await kRes.json())
        if (cRes.ok) setCategories(await cRes.json())
      })
      .finally(() => setLoading(false))
  }, [user])

  async function openDetail(kpi: KPIReport) {
    setSelected(kpi)
    setChartLoading(true)
    setChartData([])
    try {
      const res = await fetch(`/api/monthly?kpiId=${kpi.id}`)
      const data: { kpiId: string; month: string; value: number; target: number }[] = await res.json()
      setChartData(
        data.sort((a, b) => a.month.localeCompare(b.month))
             .map((m) => ({ month: m.month.slice(2), value: m.value, target: m.target })),
      )
    } finally {
      setChartLoading(false)
    }
  }

  if (!user) return null

  const filtered = kpis.filter((k) => {
    const matchSearch = k.name.toLowerCase().includes(search.toLowerCase()) || k.owner.toLowerCase().includes(search.toLowerCase())
    const matchCat = catFilter === 'ทุกหมวด' || k.category === catFilter
    const matchStatus = !statusFilter || k.status === statusFilter
    const matchGroup = !onlyMyGroup || (user.department && k.workGroups?.includes(user.department))
    return matchSearch && matchCat && matchStatus && matchGroup
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">รายการ KPI ทั้งหมด</h1>
          <p className="text-gray-500 text-sm mt-1">{kpis.length} ตัวชี้วัด</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4 mb-6 flex flex-wrap gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ KPI หรือผู้รับผิดชอบ..."
            className="flex-1 min-w-52 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option>ทุกหมวด</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {user.department && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none" title={`กรองเฉพาะ KPI ของกลุ่มงาน "${user.department}"`}>
              <input type="checkbox" checked={onlyMyGroup} onChange={(e) => setOnlyMyGroup(e.target.checked)} className="rounded" />
              เฉพาะกลุ่มงานของฉัน
            </label>
          )}
          <span className="self-center text-sm text-gray-500">พบ {filtered.length} รายการ</span>
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
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">หมวด</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">ผู้รับผิดชอบ</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">กำหนดเสร็จ</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">เป้าหมาย</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">สถานะ</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((kpi) => (
                    <tr key={kpi.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3"><span className="font-medium text-gray-900 line-clamp-2">{kpi.name}</span></td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">{kpi.category}</span>
                        {kpi.workGroups && kpi.workGroups.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {kpi.workGroups.map((g) => (
                              <span key={g} className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-medium">{g}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{kpi.owner}</td>
                      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                        {new Date(kpi.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-blue-700">{kpi.target} {kpi.unit}</td>
                      <td className="px-4 py-3"><StatusBadge status={kpi.status} /></td>
                      <td className="px-4 py-3">
                        <button onClick={() => openDetail(kpi)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 rounded hover:bg-blue-50">
                          ดูรายละเอียด →
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">ไม่พบ KPI ที่ตรงกับเงื่อนไข</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-bold text-gray-900 text-lg">{selected.name}</h2>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">{selected.category}</span>
                    <StatusBadge status={selected.status} />
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                <div><span className="text-gray-500">ผู้รับผิดชอบ</span><p className="font-medium text-gray-900 mt-0.5">{selected.owner}</p></div>
                <div>
                  <span className="text-gray-500">กำหนดเสร็จ</span>
                  <p className="font-medium text-gray-900 mt-0.5">
                    {new Date(selected.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <div><span className="text-gray-500">เป้าหมาย</span><p className="font-medium text-blue-700 mt-0.5">{selected.target} {selected.unit}</p></div>
                {selected.description && <div className="col-span-2"><span className="text-gray-500">รายละเอียด</span><p className="text-gray-700 mt-0.5">{selected.description}</p></div>}
              </div>
              <h3 className="font-semibold text-gray-800 mb-3">แนวโน้มรายเดือน</h3>
              {chartLoading ? (
                <div className="text-center py-10 text-gray-400">กำลังโหลด...</div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <ReferenceLine y={selected.target} stroke="#ef4444" strokeDasharray="4 4"
                      label={{ value: 'เป้าหมาย', fill: '#ef4444', fontSize: 11 }} />
                    <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} name="ค่าจริง" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-400 text-sm text-center py-8">ไม่มีข้อมูลรายเดือน</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
