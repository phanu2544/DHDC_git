'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import Navbar from '@/components/Navbar'
import MonthPicker from '@/components/MonthPicker'
import { DISTRICT_NAME } from '@/lib/areaRef'
import { useMonthlyData } from '@/lib/useMonthlyData'

type View = 'area' | 'unit'

interface GroupRow {
  code: string; name: string
  pos: number; neg: number; total: number
  posPct: number | null; negPct: number | null
}
interface ColonResp {
  ok: boolean; message?: string; year: string
  source: 'snapshot' | 'live'; month: string | null; availableMonths: string[]
  view: View; tambons: GroupRow[]; total: GroupRow
}

function posColor(pct: number | null): string {
  if (pct === null) return '#9ca3af'
  if (pct > 15) return '#dc2626'
  if (pct > 10) return '#f59e0b'
  return '#16a34a'
}

export default function ColonFitPage() {
  const [view, setView] = useState<View>('area')
  const { user, data, month, loading, error, requireSession, loadUrl } = useMonthlyData<ColonResp>()

  const load = useCallback((m: string, v: View) => {
    loadUrl(`/api/colon-fit?view=${v}${m ? `&month=${m}` : ''}`)
  }, [loadUrl])

  useEffect(() => { if (requireSession()) load('', 'area') }, [requireSession, load])

  if (!user) return null

  const toggleView = (v: View) => { setView(v); load(month || '', v) }
  const groupLabel = view === 'unit' ? 'หน่วยบริการ' : 'ตำบล'
  const tambons = data?.tambons ?? []

  const chartData = tambons.map((t) => ({
    name: t.name,
    'FIT− (ผลลบ)': t.neg,
    'FIT+ (ผลบวก)': t.pos,
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-1 text-sm">
          <Link href="/dashboard" className="text-blue-600 hover:underline">← กลับ Scorecard</Link>
        </div>
        <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              คัดกรองมะเร็งลำไส้ใหญ่และลำไส้ตรง (FIT test) — ราย{groupLabel}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {DISTRICT_NAME} • ผลบวก (FIT+) / ผลลบ (FIT−) • ปีงบ {data?.year ?? ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-white border rounded-lg p-1 text-sm">
              <button type="button" onClick={() => toggleView('area')}
                className={`px-3 py-1.5 rounded-md ${view === 'area' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                รายตำบล
              </button>
              <button type="button" onClick={() => toggleView('unit')}
                className={`px-3 py-1.5 rounded-md ${view === 'unit' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                รายหน่วยบริการ
              </button>
            </div>
            <MonthPicker
              month={month}
              source={data?.source}
              availableMonths={data?.availableMonths ?? []}
              onChange={(m) => load(m, view)}
              disabled={loading}
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">กำลังโหลดข้อมูลจาก MOPH...</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">⚠️ {error}</div>
        ) : !data ? null : (
          <>
            <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
              <h2 className="font-semibold text-gray-800 mb-3 text-sm">จำนวนผู้รับการคัดกรอง FIT test ราย{groupLabel}</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="FIT− (ผลลบ)" stackId="s" fill="#22c55e" />
                  <Bar dataKey="FIT+ (ผลบวก)" stackId="s" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-3">
              <div className="px-5 py-3 border-b">
                <h2 className="font-semibold text-gray-800 text-sm">ตารางราย{groupLabel}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium" rowSpan={2}>{groupLabel}</th>
                      <th className="text-right px-2 py-2 font-medium" rowSpan={2}>คัดกรอง<br />(B)</th>
                      <th className="text-center px-2 py-2 font-medium border-l text-green-700" colSpan={2}>ผลลบ FIT− (ปกติ)</th>
                      <th className="text-center px-2 py-2 font-medium border-l text-red-600" colSpan={2}>ผลบวก FIT+ (สงสัยผิดปกติ)</th>
                    </tr>
                    <tr>
                      <th className="text-right px-2 py-1 font-normal border-l">คน</th>
                      <th className="text-right px-2 py-1 font-normal">ร้อยละ</th>
                      <th className="text-right px-2 py-1 font-normal border-l">คน</th>
                      <th className="text-right px-2 py-1 font-normal">ร้อยละ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tambons.map((t) => (
                      <tr key={t.code} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 font-medium text-gray-900">{t.name}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">{t.total.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums border-l text-green-700">{t.neg.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-green-700">{t.negPct ?? '—'}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums border-l font-semibold"
                          style={{ color: posColor(t.posPct) }}>{t.pos.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums font-semibold"
                          style={{ color: posColor(t.posPct) }}>{t.posPct ?? '—'}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-semibold">
                      <td className="px-3 py-2.5">{data.total.name}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{data.total.total.toLocaleString()}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums border-l text-green-700">{data.total.neg.toLocaleString()}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-green-700">{data.total.negPct ?? '—'}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums border-l"
                        style={{ color: posColor(data.total.posPct) }}>{data.total.pos.toLocaleString()}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums"
                        style={{ color: posColor(data.total.posPct) }}>{data.total.posPct ?? '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              B = จำนวนผู้รับการคัดกรอง FIT test ทั้งหมด (ผลบวก + ผลลบ ทุกไตรมาส) ·
              ร้อยละ FIT± = คน÷B ·
              สี <span className="text-red-600 font-medium">แดง</span> FIT+ &gt;15% ·
              <span className="text-yellow-600 font-medium"> เหลือง</span> 10–15% ·
              <span className="text-green-700 font-medium"> เขียว</span> &lt;10% ·
              ⚠️ ผล FIT+ ต้องส่งตรวจเพิ่มเติม (colonoscopy) ไม่ใช่ผลยืนยันมะเร็ง ·
              ข้อมูลจาก MOPH (s_colon_screen_w) {DISTRICT_NAME} · แหล่ง/เดือนดูที่ป้ายมุมขวาบน
            </p>
          </>
        )}
      </div>
    </div>
  )
}
