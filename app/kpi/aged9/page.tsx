'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Navbar from '@/components/Navbar'
import MonthPicker from '@/components/MonthPicker'
import { DISTRICT_NAME } from '@/lib/areaRef'
import { useMonthlyData } from '@/lib/useMonthlyData'

interface DomainCell { n: number; name: string; screened: number; normal: number; risk: number; riskPct: number | null }
interface TambonRow { code: string; name: string; total: number; screened9: number; coverPct: number | null; domains: DomainCell[] }
interface Aged9Resp {
  ok: boolean; message?: string; table: string; year: string
  source: 'snapshot' | 'live'; month: string | null; availableMonths: string[]
  domainNames: { n: number; name: string }[]
  tambons: TambonRow[]; total: TambonRow
}

// สีตาม %เสี่ยง (ยิ่งสูงยิ่งแดง)
function riskColor(pct: number | null): string {
  if (pct === null) return 'var(--c-none)'
  if (pct >= 15) return '#dc2626'
  if (pct >= 10) return '#f59e0b'
  return '#16a34a'
}

export default function Aged9Page() {
  const [table, setTable] = useState('s_aged9')
  const { user, data, month, loading, error, requireSession, loadUrl } = useMonthlyData<Aged9Resp>()
  const load = useCallback((t: string, m: string) => loadUrl(`/api/aged9?table=${t}${m ? `&month=${m}` : ''}`), [loadUrl])

  useEffect(() => {
    if (!requireSession()) return
    const t = new URLSearchParams(window.location.search).get('table') || 's_aged9'
    setTable(t)
    load(t, '')
  }, [requireSession, load])

  if (!user) return null

  const chartData = (data?.tambons ?? []).map((t) => ({ name: t.name, cover: t.coverPct ?? 0 }))

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-1 text-sm">
          <Link href="/dashboard" className="text-blue-600 hover:underline">← กลับ Scorecard</Link>
        </div>
        <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">คัดกรองสุขภาพผู้สูงอายุ 9 ด้าน — รายตำบล</h1>
            <p className="text-gray-500 text-sm mt-1">
              {DISTRICT_NAME} • {table === 's_aged9_app' ? 'จาก API' : 'Basic/Community STEP1'} • ปีงบ {data?.year ?? ''}
            </p>
          </div>
          <MonthPicker
            month={month}
            source={data?.source}
            availableMonths={data?.availableMonths ?? []}
            onChange={(m) => load(table, m)}
            disabled={loading}
          />
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">กำลังโหลดข้อมูลจาก MOPH...</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">⚠️ {error}</div>
        ) : !data ? null : (
          <>
            {/* กราฟ %คัดกรองครบ 9 ด้าน รายตำบล (แบบ HDC) */}
            <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
              <h2 className="font-semibold text-gray-800 mb-3 text-sm">คัดกรองครบ 9 ด้าน — รายตำบล (%)</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => [`${v}%`]} />
                  <Bar dataKey="cover" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ตาราง ตำบล × 9 ด้าน (%เสี่ยง color-coded) */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-3">
              <div className="px-5 py-3 border-b">
                <h2 className="font-semibold text-gray-800 text-sm">ตารางรายตำบล × 9 ด้าน (% พบเสี่ยง)</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium sticky left-0 bg-gray-50" rowSpan={2}>ตำบล</th>
                      <th className="text-right px-2 py-2 font-medium" rowSpan={2}>ผู้สูงอายุ</th>
                      <th className="text-right px-2 py-2 font-medium border-l" rowSpan={2}>ครบ 9 ด้าน %</th>
                      {data.domainNames.map((d) => (
                        <th key={d.n} className="text-center px-2 py-2 font-medium border-l whitespace-nowrap" colSpan={3}>{d.name}</th>
                      ))}
                    </tr>
                    <tr>
                      {data.domainNames.map((d) => (
                        <Fragment key={d.n}>
                          <th className="text-right px-2 py-1 font-normal border-l">คัดกรอง</th>
                          <th className="text-right px-2 py-1 font-normal">เสี่ยง</th>
                          <th className="text-right px-2 py-1 font-normal">%</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.tambons.map((t) => (
                      <tr key={t.code} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 font-medium text-gray-900 sticky left-0 bg-white">{t.name}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">{t.total.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums font-semibold border-l">{t.coverPct ?? '—'}</td>
                        {t.domains.map((d) => (
                          <Fragment key={d.n}>
                            <td className="px-2 py-2.5 text-right tabular-nums border-l text-gray-600">{d.screened.toLocaleString()}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">{d.risk.toLocaleString()}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums font-medium" style={{ color: riskColor(d.riskPct) }}>{d.riskPct ?? '—'}</td>
                          </Fragment>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-semibold">
                      <td className="px-3 py-2.5 sticky left-0 bg-gray-100">{data.total.name}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{data.total.total.toLocaleString()}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums border-l">{data.total.coverPct ?? '—'}</td>
                      {data.total.domains.map((d) => (
                        <Fragment key={d.n}>
                          <td className="px-2 py-2.5 text-right tabular-nums border-l">{d.screened.toLocaleString()}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{d.risk.toLocaleString()}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: riskColor(d.riskPct) }}>{d.riskPct ?? '—'}</td>
                        </Fragment>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              แต่ละด้านแสดง <b>คัดกรอง / เสี่ยง / %</b> · คอลัมน์ % = พบเสี่ยง (เสี่ยง÷คัดกรอง) สีแดง ≥15% · ส้ม 10–15% · เขียว &lt;10%
              · ข้อมูลจาก MOPH ({table}) {DISTRICT_NAME} · แหล่ง/เดือนดูที่ป้ายมุมขวาบน · field→ด้าน อ้างอิงลำดับ HDC (ขอเจ้าของ KPI ยืนยันชื่อด้านก่อนใช้ทางการ)
            </p>
          </>
        )}
      </div>
    </div>
  )
}
