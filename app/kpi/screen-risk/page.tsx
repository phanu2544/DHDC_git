'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import Navbar from '@/components/Navbar'
import { getSession } from '@/lib/storage'
import { DISTRICT_NAME } from '@/lib/areaRef'
import type { User } from '@/lib/types'

interface Cat { key: string; label: string }
interface TambonRow {
  code: string; name: string; target: number; result: number; coverPct: number | null
  cats: Record<string, { count: number; pct: number | null }>
}
interface Resp {
  ok: boolean; message?: string; disease: string; table: string; diseaseLabel: string; year: string
  cats: Cat[]; tambons: TambonRow[]; total: TambonRow
}

// สีตามระดับความเสี่ยง (เขียว→แดง)
const CAT_COLOR: Record<string, string> = {
  normal: '#22c55e', risk: '#f59e0b', high_risk: '#f97316', ill: '#dc2626',
}

export default function ScreenRiskPage() {
  const router = useRouter()
  const [disease, setDisease] = useState('dm')
  const [user, setUser] = useState<User | null>(null)
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback((d: string) => {
    setDisease(d)
    setLoading(true); setError(''); setData(null)
    window.history.replaceState(null, '', `/kpi/screen-risk?disease=${d}`)
    fetch(`/api/screen-risk?disease=${d}`)
      .then((r) => r.json())
      .then((j: Resp) => { if (!j.ok) throw new Error(j.message || 'โหลดไม่สำเร็จ'); setData(j) })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const session = getSession()
    if (!session) { router.push('/login'); return }
    setUser(session)
    const d = (new URLSearchParams(window.location.search).get('disease') || 'dm').toLowerCase()
    load(d)
  }, [router, load])

  if (!user) return null

  // stacked: จำนวนคน แต่ละกลุ่ม รายตำบล
  const chartData = (data?.tambons ?? []).map((t) => {
    const row: Record<string, string | number> = { name: t.name }
    for (const c of data!.cats) row[c.label] = t.cats[c.key]?.count ?? 0
    return row
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-1 text-sm">
          <Link href="/dashboard" className="text-blue-600 hover:underline">← กลับ Scorecard</Link>
        </div>
        <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">คัดกรอง{data?.diseaseLabel ?? ''} ประชากร 35 ปีขึ้นไป — รายตำบล</h1>
            <p className="text-gray-500 text-sm mt-1">
              {DISTRICT_NAME} • ปกติ / เสี่ยง / เสี่ยงสูง / สงสัยป่วย • ปีงบ {data?.year ?? ''}
            </p>
          </div>
          <div className="flex gap-1 bg-white border rounded-lg p-1 text-sm">
            <button type="button" onClick={() => load('dm')}
              className={`px-3 py-1.5 rounded-md ${disease === 'dm' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>เบาหวาน</button>
            <button type="button" onClick={() => load('ht')}
              className={`px-3 py-1.5 rounded-md ${disease === 'ht' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>ความดัน</button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">กำลังโหลดข้อมูลจาก MOPH...</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">⚠️ {error}</div>
        ) : !data ? null : (
          <>
            {/* กราฟแท่ง stacked: องค์ประกอบผลคัดกรอง รายตำบล */}
            <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
              <h2 className="font-semibold text-gray-800 mb-3 text-sm">ผลคัดกรองรายตำบล — จำนวนคนแต่ละกลุ่ม</h2>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {data.cats.map((c) => (
                    <Bar key={c.key} dataKey={c.label} stackId="s" fill={CAT_COLOR[c.key] ?? '#3b82f6'} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ตารางรายตำบล */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-3">
              <div className="px-5 py-3 border-b">
                <h2 className="font-semibold text-gray-800 text-sm">ตารางรายตำบล (จำนวน / % ของผู้คัดกรอง)</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium" rowSpan={2}>ตำบล</th>
                      <th className="text-right px-2 py-2 font-medium" rowSpan={2}>เป้าหมาย</th>
                      <th className="text-right px-2 py-2 font-medium border-l" rowSpan={2}>คัดกรอง</th>
                      <th className="text-right px-2 py-2 font-medium" rowSpan={2}>คัดกรอง %</th>
                      {data.cats.map((c) => (
                        <th key={c.key} className="text-center px-2 py-2 font-medium border-l whitespace-nowrap" colSpan={2}
                          style={{ color: CAT_COLOR[c.key] }}>{c.label}</th>
                      ))}
                    </tr>
                    <tr>
                      {data.cats.map((c) => (
                        <Fragment key={c.key}>
                          <th className="text-right px-2 py-1 font-normal border-l">คน</th>
                          <th className="text-right px-2 py-1 font-normal">%</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.tambons.map((t) => (
                      <tr key={t.code} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 font-medium text-gray-900">{t.name}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">{t.target.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums border-l">{t.result.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums font-semibold">{t.coverPct ?? '—'}</td>
                        {data.cats.map((c) => (
                          <Fragment key={c.key}>
                            <td className="px-2 py-2.5 text-right tabular-nums border-l text-gray-600">{(t.cats[c.key]?.count ?? 0).toLocaleString()}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums font-medium" style={{ color: CAT_COLOR[c.key] }}>{t.cats[c.key]?.pct ?? '—'}</td>
                          </Fragment>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-semibold">
                      <td className="px-3 py-2.5">{data.total.name}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{data.total.target.toLocaleString()}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums border-l">{data.total.result.toLocaleString()}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{data.total.coverPct ?? '—'}</td>
                      {data.cats.map((c) => (
                        <Fragment key={c.key}>
                          <td className="px-2 py-2.5 text-right tabular-nums border-l">{(data.total.cats[c.key]?.count ?? 0).toLocaleString()}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: CAT_COLOR[c.key] }}>{data.total.cats[c.key]?.pct ?? '—'}</td>
                        </Fragment>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              เป้าหมาย = ประชากร 35 ปีขึ้นไป · คัดกรอง % = คัดกรอง÷เป้าหมาย · กลุ่ม ปกติ/เสี่ยง/เสี่ยงสูง/สงสัยป่วย = % ของผู้คัดกรอง
              · ข้อมูลสดจาก MOPH ({data.table}) {DISTRICT_NAME} · ผลรวมกลุ่มอาจไม่เท่าจำนวนคัดกรองพอดี (ตามการบันทึก HDC) · ขอเจ้าของ KPI ยืนยันนิยามกลุ่มก่อนใช้ทางการ
            </p>
          </>
        )}
      </div>
    </div>
  )
}
