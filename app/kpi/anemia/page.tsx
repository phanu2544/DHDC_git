'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import Navbar from '@/components/Navbar'
import MonthPicker from '@/components/MonthPicker'
import { DISTRICT_NAME } from '@/lib/areaRef'
import { useMonthlyData } from '@/lib/useMonthlyData'

type View = 'area' | 'unit'

interface TambonRow {
  code: string; name: string; total: number; screened: number; found: number
  screenedTp: number; foundTp: number
  coveragePct: number; prevalencePct: number; prevalenceTpPct: number
}
interface Resp {
  ok: boolean; message?: string; table: string; year: string
  source: 'snapshot' | 'live'; month: string | null; availableMonths: string[]
  view: View; tambons: TambonRow[]; total: TambonRow
}

const C_COVER = '#3b82f6'
const C_PREV = '#dc2626'
const fmtPct = (v: number) => v.toFixed(2)

export default function AnemiaPage() {
  const [view, setView] = useState<View>('area')
  const { user, data, month, loading, error, requireSession, loadUrl } = useMonthlyData<Resp>()

  const load = useCallback((m: string, v: View) => {
    loadUrl(`/api/anemia?view=${v}${m ? `&month=${m}` : ''}`)
  }, [loadUrl])

  useEffect(() => { if (requireSession()) load('', 'area') }, [requireSession, load])

  if (!user) return null

  const toggleView = (v: View) => { setView(v); load(month || '', v) }
  const groupLabel = view === 'unit' ? 'หน่วยบริการ' : 'ตำบล'

  const chartData = (data?.tambons ?? []).map((t) => ({
    name: t.name,
    'ร้อยละการตรวจ': t.coveragePct,
    'ร้อยละโลหิตจาง': t.prevalencePct,
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-1 text-sm">
          <Link href="/dashboard" className="text-blue-600 hover:underline">← กลับ Scorecard</Link>
        </div>
        <div className="mb-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">เด็กอายุครบ 12 เดือนที่มีภาวะโลหิตจาง — ราย{groupLabel}</h1>
              <p className="text-gray-500 text-sm mt-1">
                {DISTRICT_NAME} • ตรวจภาวะโลหิตจางในช่วงอายุ 6-12 เดือน • ปีงบ {data?.year ?? ''}
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
          <div className="text-xs text-gray-500 mt-2 leading-relaxed bg-white border rounded-lg px-3 py-2">
            <div><b>B</b> = จำนวนเด็กอายุครบ 12 เดือน ในเขตรับผิดชอบทั้งหมด ได้รับการตรวจภาวะโลหิตจางในช่วงอายุ 6-12 เดือน</div>
            <div><b>A</b> = จำนวนเด็กอายุครบ 12 เดือน ในเขตรับผิดชอบทั้งหมด ได้รับการตรวจภาวะโลหิตจางในช่วงอายุ 6-12 เดือน <b>พบภาวะโลหิตจาง</b></div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">กำลังโหลดข้อมูลจาก MOPH...</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">⚠️ {error}</div>
        ) : !data ? null : (
          <>
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm mb-6">
              ⚠️ <b>ข้อมูลจำนวนน้อย</b> — เด็กที่ได้รับการตรวจในแต่ละ{groupLabel}มีเพียงหลักหน่วย ค่า "ความชุก" จึงอ่อนไหวมาก
              (พบ 1 ใน 2 = 50%) ใช้ดูแนวโน้ม/ความครอบคลุมเป็นหลัก ไม่ควรตีความความชุกราย{groupLabel}เป็นตัวเลขแม่นยำ
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
              <h2 className="font-semibold text-gray-800 mb-3 text-sm">ร้อยละการตรวจ vs ร้อยละโลหิตจาง ราย{groupLabel} (%)</h2>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => [`${v}%`]} />
                  <Legend />
                  <Bar dataKey="ร้อยละการตรวจ" fill={C_COVER} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="ร้อยละโลหิตจาง" fill={C_PREV} radius={[3, 3, 0, 0]} />
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
                      <th className="text-left px-4 py-2 font-medium" rowSpan={2}>{groupLabel}</th>
                      <th className="text-right px-3 py-2 font-medium border-l" rowSpan={2}>เด็กอายุครบ<br />12 เดือน (C)</th>
                      <th className="text-center px-3 py-2 font-medium border-l" colSpan={4}>จำนวนตรวจภาวะโลหิตจางทั้งหมด</th>
                      <th className="text-center px-3 py-2 font-medium border-l" colSpan={3}>ไม่พบรหัส ICD10 ตามรายการแนบท้าย TP</th>
                    </tr>
                    <tr>
                      <th className="text-right px-2 py-1 font-normal border-l">ตรวจ (B1)</th>
                      <th className="text-right px-2 py-1 font-normal" style={{ color: C_COVER }}>ร้อยละการตรวจ</th>
                      <th className="text-right px-2 py-1 font-normal">พบ (A1)</th>
                      <th className="text-right px-2 py-1 font-normal" style={{ color: C_PREV }}>ร้อยละโลหิตจาง</th>
                      <th className="text-right px-2 py-1 font-normal border-l">ตรวจ (B)</th>
                      <th className="text-right px-2 py-1 font-normal">พบ (A)</th>
                      <th className="text-right px-2 py-1 font-normal" style={{ color: C_PREV }}>ร้อยละโลหิตจาง</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.tambons.map((t) => (
                      <tr key={t.code} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{t.name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-600 border-l">{t.total.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums border-l">{t.screened.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums font-semibold" style={{ color: C_COVER }}>{fmtPct(t.coveragePct)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{t.found.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums font-semibold" style={{ color: C_PREV }}>{fmtPct(t.prevalencePct)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums border-l">{t.screenedTp.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{t.foundTp.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums font-semibold" style={{ color: C_PREV }}>{fmtPct(t.prevalenceTpPct)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-semibold">
                      <td className="px-4 py-2.5">{data.total.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums border-l">{data.total.total.toLocaleString()}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums border-l">{data.total.screened.toLocaleString()}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: C_COVER }}>{fmtPct(data.total.coveragePct)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{data.total.found.toLocaleString()}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: C_PREV }}>{fmtPct(data.total.prevalencePct)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums border-l">{data.total.screenedTp.toLocaleString()}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{data.total.foundTp.toLocaleString()}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: C_PREV }}>{fmtPct(data.total.prevalenceTpPct)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              ร้อยละการตรวจ = ตรวจ÷เด็กทั้งหมด · ร้อยละโลหิตจาง = พบโลหิตจาง÷ตรวจ (ยิ่งต่ำยิ่งดี)
              · ข้อมูลจาก MOPH ({data.table}) {DISTRICT_NAME} · แหล่ง/เดือนดูที่ป้ายมุมขวาบน · นิยาม field ยืนยันโดย owner (packet ข้อ 9, 29 มิ.ย.)
            </p>
          </>
        )}
      </div>
    </div>
  )
}
