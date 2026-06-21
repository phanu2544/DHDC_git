'use client'

import { Fragment, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Navbar from '@/components/Navbar'
import MonthPicker from '@/components/MonthPicker'
import { DISTRICT_NAME } from '@/lib/areaRef'
import { useMonthlyData } from '@/lib/useMonthlyData'

interface Round { screen: number; social: number; home: number; bed: number; pct: number | null }
interface TambonRow { code: string; name: string; elderly: number; r1: Round; r2: Round }
interface AgeingResp {
  ok: boolean; message?: string; table: string; year: string
  source: 'snapshot' | 'live'; month: string | null; availableMonths: string[]
  tambons: TambonRow[]; total: TambonRow
}

// สี %ติดสังคม (ยิ่งสูงยิ่งดี — ผู้สูงอายุช่วยเหลือตัวเองได้)
function socialColor(pct: number | null): string {
  if (pct === null) return '#9ca3af'
  if (pct >= 95) return '#16a34a'
  if (pct >= 90) return '#f59e0b'
  return '#dc2626'
}

const ROUNDS: { key: 'r1' | 'r2'; label: string; period: string; bar: string }[] = [
  { key: 'r1', label: 'รอบ1', period: 'ไตรมาส 1-2 (ต.ค.–มี.ค.)', bar: '#3b82f6' },
  { key: 'r2', label: 'รอบ2', period: 'ไตรมาส 3-4 (เม.ย.–ก.ย.)', bar: '#0d9488' },
]

export default function AgeingPage() {
  const { user, data, month, loading, error, requireSession, loadUrl } = useMonthlyData<AgeingResp>()
  const load = useCallback((m: string) => loadUrl(`/api/ageing${m ? `?month=${m}` : ''}`), [loadUrl])

  useEffect(() => {
    if (!requireSession()) return
    load('')
  }, [requireSession, load])

  if (!user) return null

  const tambons = data?.tambons ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-1 text-sm">
          <Link href="/dashboard" className="text-blue-600 hover:underline">← กลับ Scorecard</Link>
        </div>
        <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Healthy Ageing — ผู้สูงอายุติดสังคม รายตำบล</h1>
            <p className="text-gray-500 text-sm mt-1">
              {DISTRICT_NAME} • ประเมินสมรรถนะผู้สูงอายุ (ADL) แยก 2 รอบ • ปีงบ {data?.year ?? ''} • ติดตามเฉยๆ (ไม่ประเมินผ่าน/ไม่ผ่าน)
            </p>
          </div>
          <MonthPicker
            month={month}
            source={data?.source}
            availableMonths={data?.availableMonths ?? []}
            onChange={(m) => load(m)}
            disabled={loading}
          />
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">กำลังโหลดข้อมูลจาก MOPH...</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">⚠️ {error}</div>
        ) : !data ? null : (
          <>
            {/* กราฟ %ติดสังคม รายตำบล — แยก 2 รอบ (แบบ HDC) */}
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              {ROUNDS.map((rd) => (
                <div key={rd.key} className="bg-white rounded-xl shadow-sm border p-5">
                  <h2 className="font-semibold text-gray-800 mb-1 text-sm">%ติดสังคม — {rd.label}</h2>
                  <p className="text-gray-400 text-xs mb-3">{rd.period}</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={tambons.map((t) => ({ name: t.name, pct: t[rd.key].pct ?? 0 }))}
                      margin={{ top: 16, right: 12, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v) => [`${v}%`, '%ติดสังคม']} />
                      <Bar dataKey="pct" fill={rd.bar} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>

            {/* ตารางรายตำบล × 2 รอบ (HDC-style) */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-3">
              <div className="px-5 py-3 border-b">
                <h2 className="font-semibold text-gray-800 text-sm">ตารางรายตำบล — แยก 2 รอบประเมิน</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium sticky left-0 bg-gray-50" rowSpan={2}>ตำบล</th>
                      <th className="text-right px-2 py-2 font-medium" rowSpan={2}>ผู้สูงอายุ</th>
                      {ROUNDS.map((rd) => (
                        <th key={rd.key} className="text-center px-2 py-2 font-medium border-l whitespace-nowrap" colSpan={5}>
                          {rd.label} <span className="font-normal text-gray-400">({rd.period})</span>
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {ROUNDS.map((rd) => (
                        <Fragment key={rd.key}>
                          <th className="text-right px-2 py-1 font-normal border-l">คัดกรอง</th>
                          <th className="text-right px-2 py-1 font-normal">ติดสังคม</th>
                          <th className="text-right px-2 py-1 font-normal">ติดบ้าน</th>
                          <th className="text-right px-2 py-1 font-normal">ติดเตียง</th>
                          <th className="text-right px-2 py-1 font-medium">%</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tambons.map((t) => (
                      <tr key={t.code} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 font-medium text-gray-900 sticky left-0 bg-white">{t.name}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">{t.elderly.toLocaleString()}</td>
                        {ROUNDS.map((rd) => {
                          const r = t[rd.key]
                          return (
                            <Fragment key={rd.key}>
                              <td className="px-2 py-2.5 text-right tabular-nums border-l text-gray-600">{r.screen.toLocaleString()}</td>
                              <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">{r.social.toLocaleString()}</td>
                              <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">{r.home.toLocaleString()}</td>
                              <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">{r.bed.toLocaleString()}</td>
                              <td className="px-2 py-2.5 text-right tabular-nums font-semibold" style={{ color: socialColor(r.pct) }}>{r.pct ?? '—'}</td>
                            </Fragment>
                          )
                        })}
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-semibold">
                      <td className="px-3 py-2.5 sticky left-0 bg-gray-100">{data.total.name}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{data.total.elderly.toLocaleString()}</td>
                      {ROUNDS.map((rd) => {
                        const r = data.total[rd.key]
                        return (
                          <Fragment key={rd.key}>
                            <td className="px-2 py-2.5 text-right tabular-nums border-l">{r.screen.toLocaleString()}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums">{r.social.toLocaleString()}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums">{r.home.toLocaleString()}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums">{r.bed.toLocaleString()}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: socialColor(r.pct) }}>{r.pct ?? '—'}</td>
                          </Fragment>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              <b>ติดสังคม</b> = ADL 12-20 (ช่วยเหลือตัวเองได้) · <b>ติดบ้าน</b> = ADL 5-11 · <b>ติดเตียง</b> = ADL 0-4 ·
              คอลัมน์ % = ติดสังคม÷คัดกรอง (สีเขียว ≥95% · ส้ม 90–95% · แดง &lt;90%) ·
              ⚠️ <b>ห้ามรวม 2 รอบ</b> เพราะผู้สูงอายุคนเดียวอาจถูกประเมินทั้งสองรอบ (ตามนิยาม HDC) ·
              ข้อมูลจาก MOPH (s_kpi_ageing) {DISTRICT_NAME} · แหล่ง/เดือนดูที่ป้ายมุมขวาบน
            </p>
          </>
        )}
      </div>
    </div>
  )
}
