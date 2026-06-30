'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import Navbar from '@/components/Navbar'
import MonthPicker from '@/components/MonthPicker'
import { DISTRICT_NAME } from '@/lib/areaRef'
import { useMonthlyData } from '@/lib/useMonthlyData'

type View = 'area' | 'unit'

interface VacCell { A: number; pct: number | null }
interface TambonRow { code: string; name: string; B: number; vaccines: Record<string, VacCell> }
interface VacResp {
  ok: boolean; message?: string; year: string
  source: 'snapshot' | 'live'; month: string | null; availableMonths: string[]
  view: View; vaccines: { key: string; label: string }[]
  tambons: TambonRow[]; total: TambonRow
}

const COLORS: Record<string, string> = {
  dtp4: '#38bdf8', opv4: '#6366f1', je2: '#22c55e', mmr1: '#f97316', mmr2: '#64748b',
}

export default function VaccinesPage() {
  const [view, setView] = useState<View>('area')
  const { user, data, month, loading, error, requireSession, loadUrl } = useMonthlyData<VacResp>()

  const load = useCallback((m: string, v: View) => {
    loadUrl(`/api/vaccines?view=${v}${m ? `&month=${m}` : ''}`)
  }, [loadUrl])

  useEffect(() => { if (requireSession()) load('', 'area') }, [requireSession, load])

  if (!user) return null

  const toggleView = (v: View) => { setView(v); load(month || '', v) }
  const groupLabel = view === 'unit' ? 'หน่วยบริการ' : 'ตำบล'

  const chartData = (data?.tambons ?? []).map((t) => {
    const row: Record<string, string | number | null> = { name: t.name }
    for (const v of data!.vaccines) row[v.label] = t.vaccines[v.key]?.pct ?? 0
    return row
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-1 text-sm">
          <Link href="/dashboard" className="text-blue-600 hover:underline">← กลับ Scorecard</Link>
        </div>
        <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">ความครอบคลุมวัคซีนเด็กอายุครบ 2 ปี (รายชนิด)</h1>
            <p className="text-gray-500 text-sm mt-1">
              {DISTRICT_NAME} • DTP4 / Polio4 / LAJE/JE / MMR1 เก็บตก / MMR2 • รายไตรมาส สะสมปีงบ {data?.year ?? ''} • ตัวติดตาม (ไม่ประเมินผ่าน/ไม่ผ่าน)
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-white border rounded-lg p-1 text-sm">
              <button type="button" onClick={() => toggleView('area')}
                className={`px-3 py-1.5 rounded-md ${view === 'area' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>รายตำบล</button>
              <button type="button" onClick={() => toggleView('unit')}
                className={`px-3 py-1.5 rounded-md ${view === 'unit' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>รายหน่วยบริการ</button>
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
          <div className="text-center py-20 text-gray-400">กำลังโหลดข้อมูลวัคซีนจาก MOPH...</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">⚠️ {error}</div>
        ) : !data ? null : (
          <>
            <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
              <h2 className="font-semibold text-gray-800 mb-3 text-sm">แผนภูมิราย{groupLabel} — ความครอบคลุม (%)</h2>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => [`${v}%`]} />
                  <Legend />
                  {data.vaccines.map((v) => (
                    <Bar key={v.key} dataKey={v.label} fill={COLORS[v.key] ?? '#3b82f6'} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-5 py-3 border-b">
                <h2 className="font-semibold text-gray-800 text-sm">ตารางราย{groupLabel}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium" rowSpan={2}>{groupLabel}</th>
                      <th className="text-right px-3 py-2 font-medium" rowSpan={2}>B รวม</th>
                      {data.vaccines.map((v) => (
                        <th key={v.key} className="text-center px-3 py-2 font-medium border-l">{v.label}</th>
                      ))}
                    </tr>
                    <tr>
                      {data.vaccines.map((v) => (
                        <th key={v.key} className="text-right px-2 py-1 font-normal border-l">A / %</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.tambons.map((t) => (
                      <tr key={t.code} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{t.name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{t.B}</td>
                        {data.vaccines.map((v) => (
                          <td key={v.key} className="px-3 py-2.5 text-right tabular-nums border-l">
                            {t.vaccines[v.key]?.A ?? 0} <span className="text-gray-400">/</span> <b>{t.vaccines[v.key]?.pct ?? '—'}</b>
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-semibold">
                      <td className="px-4 py-2.5">{data.total.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{data.total.B}</td>
                      {data.vaccines.map((v) => (
                        <td key={v.key} className="px-3 py-2.5 text-right tabular-nums border-l">
                          {data.total.vaccines[v.key]?.A ?? 0} <span className="text-gray-400">/</span> {data.total.vaccines[v.key]?.pct ?? '—'}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-3 leading-relaxed">
              B = จำนวนเด็กครบ 2 ปีในเขตรับผิดชอบ (เป้าหมาย) · A = ได้รับวัคซีนครบตามเกณฑ์ · % = A/B
              · ข้อมูลจาก MOPH (s_epi2) ขอบเขต {DISTRICT_NAME} · แหล่ง/เดือนดูที่ป้ายมุมขวาบน
            </p>
          </>
        )}
      </div>
    </div>
  )
}
