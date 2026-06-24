'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts'
import Navbar from '@/components/Navbar'
import { useAuth } from '@/lib/useAuth'
import { STATUS_META, evaluateKpiStatus } from '@/lib/kpiStatus'
import { DIRECTION_LABEL } from '@/lib/scorecard'
import { DISTRICT_NAME, TAMBON_NAMES } from '@/lib/areaRef'
import { formatThaiMonth } from '@/lib/formatMonth'
import type { KpiEvalStatus, EvalDirection } from '@/lib/types'

// สี badge สถานะ (presentation เฉพาะหน้านี้ — ชุดเดียวกับ Dashboard)
const BADGE: Record<KpiEvalStatus, string> = {
  fail:         'bg-red-100 text-red-700',
  needs_review: 'bg-orange-100 text-orange-700',
  invalid:      'bg-purple-100 text-purple-700',
  watch:        'bg-amber-100 text-amber-700',
  no_data:      'bg-gray-100 text-gray-600',
  pass:         'bg-green-100 text-green-700',
  no_target:    'bg-slate-100 text-slate-700',
}
const BAR_COLOR: Record<string, string> = {
  pass: '#16a34a', watch: '#f59e0b', fail: '#dc2626',
  needs_review: '#f97316', invalid: '#9333ea', no_data: '#9ca3af', no_target: '#64748b',
}

interface GroupRow {
  code: string
  name: string
  rows: number
  fields: Record<string, number>
  calcValue: number | null
  status: KpiEvalStatus | null
}
interface DetailResp {
  ok: boolean
  message?: string
  month?: string
  months: string[]
  kpi: {
    name: string; category: string; owner: string; unit: string
    direction: EvalDirection; description?: string | null; target?: number
  }
  savedMonthly?: { value: number; target: number; enteredBy?: string | null; enteredAt?: string | null } | null
  manual?: boolean
  stale?: boolean
  lastMonth?: string | null
  mappingOk?: boolean
  mappingErrors?: string[]
  fieldList?: string[]
  fieldLabels?: Record<string, string>
  groups?: GroupRow[]
  total?: GroupRow
}

export default function KpiDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth()
  const [data, setData] = useState<DetailResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // กรอกค่าเอง รายตำบล (manual KPI — admin เท่านั้น)
  const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const [entryMonth, setEntryMonth] = useState(thisMonth)
  const [tRows, setTRows] = useState<{ code: string; name: string; target: string; result: string }[]>([])
  const [mSaving, setMSaving] = useState(false)
  const [mMsg, setMMsg] = useState('')

  const load = useCallback(async (month?: string) => {
    setLoading(true)
    try {
      const q = month ? `&month=${month}` : ''
      const res = await fetch(`/api/detail?kpiId=${params.id}${q}`)
      const j: DetailResp = await res.json()
      if (!res.ok) throw new Error(j.message || 'โหลดข้อมูลไม่สำเร็จ')
      setData(j)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [params.id])

  // sync ตารางกรอก จากข้อมูลที่โหลด (เติม 5 ตำบลครบ — ตำบลที่ยังไม่มีข้อมูล = ว่าง)
  useEffect(() => {
    if (!data?.manual) return
    const byCode = new Map((data.groups ?? []).map((g) => [g.code, g.fields]))
    setTRows(Object.entries(TAMBON_NAMES).map(([code, name]) => {
      const f = byCode.get(code)
      return {
        code, name,
        target: f && f.target != null ? String(f.target) : '',
        result: f && f.result != null ? String(f.result) : '',
      }
    }))
    setEntryMonth(data.month ?? thisMonth)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  async function saveManualDetail() {
    for (const r of tRows) {
      const t = Number(r.target) || 0, a = Number(r.result) || 0
      if (a > t) { setMMsg(`⚠️ ${r.name}: ผลงาน (A) ต้องไม่เกินฐาน (B)`); return }
    }
    setMSaving(true); setMMsg('')
    try {
      const res = await fetch('/api/monthly/detail', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kpiId: params.id, month: entryMonth,
          rows: tRows.map((r) => ({ code: r.code, target: Number(r.target) || 0, result: Number(r.result) || 0 })),
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.message || 'บันทึกไม่สำเร็จ')
      setMMsg('✅ บันทึกสำเร็จ')
      load(entryMonth)
    } catch (e) {
      setMMsg(`⚠️ ${String(e)}`)
    } finally {
      setMSaving(false)
    }
  }

  useEffect(() => {
    if (!user) return
    load()
  }, [user, load])

  if (!user) return null

  const manual = data?.manual === true
  const groups = data?.groups ?? []
  const total = data?.total
  const fieldList = data?.fieldList ?? []
  const fieldLabels = data?.fieldLabels ?? {}
  const showPct = !manual && data?.mappingOk && groups.some((g) => g.calcValue !== null)
  const target = data?.kpi?.target ?? 0
  const direction = data?.kpi?.direction
  const manualSaved = data?.savedMonthly ?? null

  // manual: คำนวณสดจากตารางที่กรอก (อัปเดต % + กราฟ ทันทีที่พิมพ์)
  const liveRows = tRows.map((r) => {
    const t = Number(r.target) || 0, a = Number(r.result) || 0
    return { ...r, t, a, pct: t > 0 ? +((a / t) * 100).toFixed(2) : null }
  })
  const liveSumT = liveRows.reduce((s, r) => s + r.t, 0)
  const liveSumA = liveRows.reduce((s, r) => s + r.a, 0)
  const liveTotalPct = liveSumT > 0 ? +((liveSumA / liveSumT) * 100).toFixed(2) : 0
  const liveTotalStatus = manual ? evaluateKpiStatus(liveTotalPct, target, direction ?? 'none').status : null
  const manualStatus = liveTotalStatus

  const chartData = manual
    ? liveRows.map((r) => ({ name: r.name, value: r.pct ?? 0, status: evaluateKpiStatus(r.pct ?? 0, target, direction ?? 'none').status }))
    : groups.map((g) => ({ name: g.name, value: g.calcValue ?? 0, status: g.status ?? 'no_data' }))

  function setRow(code: string, field: 'target' | 'result', val: string) {
    setTRows((prev) => prev.map((r) => (r.code === code ? { ...r, [field]: val } : r)))
  }
  function onEntryMonthChange(m: string) {
    setEntryMonth(m)
    if (data?.months.includes(m)) load(m)
    else setTRows(Object.entries(TAMBON_NAMES).map(([code, name]) => ({ code, name, target: '', result: '' })))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-1 text-sm">
          <Link href="/dashboard" className="text-blue-600 hover:underline">← กลับ Scorecard</Link>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">กำลังโหลดข้อมูลรายตำบล...</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">⚠️ {error}</div>
        ) : !data ? null : (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{data.kpi.name}</h1>
                <p className="text-gray-500 text-sm mt-1">
                  {DISTRICT_NAME} • {data.kpi.category} • ผู้รับผิดชอบ: {data.kpi.owner} • {DIRECTION_LABEL[data.kpi.direction]}
                </p>
              </div>
              {manual ? (
                <input type="month" value={entryMonth} onChange={(e) => onEntryMonthChange(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm bg-white" />
              ) : data.months.length > 0 && (
                <select
                  value={data.month}
                  onChange={(e) => load(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {data.months.map((m) => <option key={m} value={m}>{formatThaiMonth(m)}</option>)}
                </select>
              )}
            </div>

            {manual ? (
              <>
                {/* การ์ดสรุป — รวมอำเภอ (คำนวณสดจากตารางที่กรอก ΣA/ΣB) */}
                <div className="bg-white rounded-xl shadow-sm border p-5 mb-6 flex flex-wrap items-center gap-8">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-blue-700">
                      {liveSumT > 0 ? liveTotalPct : '—'}
                      <span className="text-xl text-gray-400"> {data.kpi.unit}</span>
                    </div>
                    <p className="text-gray-500 text-xs mt-1">รวมอำเภอ ({liveSumA.toLocaleString()}/{liveSumT.toLocaleString()}) — {formatThaiMonth(entryMonth)}</p>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>เป้าหมาย: <b>{target}</b> {data.kpi.unit} ({direction && DIRECTION_LABEL[direction]})</p>
                    {liveSumT > 0 && manualStatus && (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[manualStatus]}`}>
                        {STATUS_META[manualStatus].label}
                      </span>
                    )}
                    {manualSaved?.enteredBy && (
                      <p className="text-xs text-gray-400">
                        อัปเดตล่าสุดโดย {manualSaved.enteredBy}
                        {manualSaved.enteredAt ? ` · ${new Date(manualSaved.enteredAt).toLocaleString('th-TH')}` : ''}
                      </p>
                    )}
                  </div>
                </div>

                {data.stale && (
                  <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
                    ⚠️ ยังไม่ได้กรอกข้อมูล<b>เดือนนี้</b>
                    {data.lastMonth ? ` — ค่าที่แสดงเป็นของเดือนล่าสุด (${formatThaiMonth(data.lastMonth)})` : ''} · กรุณากรอกรายตำบลด้านล่าง
                  </div>
                )}

                <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm leading-relaxed">
                  ℹ️ KPI นี้ <b>กรอกค่าเอง รายตำบล</b> — เปิด HDC แล้วกรอก <b>ฐาน (B)</b> และ <b>ผลงาน (A)</b> ของแต่ละตำบล · ระบบคำนวณ % = A/B ให้อัตโนมัติ · ไม่ดึง/ทับค่าจาก MOPH
                </div>

                {/* กราฟแท่ง %รายตำบล (สด) */}
                <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
                  <h2 className="font-semibold text-gray-800 mb-3 text-sm">แผนภูมิ %รายตำบล — เดือน{formatThaiMonth(entryMonth)}</h2>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v) => [`${v} ${data.kpi.unit}`]} />
                      {target > 0 && direction !== 'none' && (
                        <ReferenceLine y={target} stroke="#dc2626" strokeDasharray="6 4"
                          label={{ value: `เป้าหมาย ${target}`, fill: '#dc2626', fontSize: 12, position: 'insideTopRight' }} />
                      )}
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {chartData.map((d, i) => <Cell key={i} fill={BAR_COLOR[d.status] ?? '#3b82f6'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* ตารางกรอกรายตำบล */}
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-3">
                  <div className="px-5 py-3 border-b flex items-center justify-between">
                    <h2 className="font-semibold text-gray-800 text-sm">ตารางรายตำบล — เดือน{formatThaiMonth(entryMonth)} {user.role === 'admin' && <span className="text-xs font-normal text-blue-600">(แก้ไขได้)</span>}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">ตำบล</th>
                          <th className="text-right px-3 py-2 font-medium">ฐาน (B)</th>
                          <th className="text-right px-3 py-2 font-medium">ผลงาน (A)</th>
                          <th className="text-right px-4 py-2 font-medium">% (A/B)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {liveRows.map((r) => (
                          <tr key={r.code} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium text-gray-900">{r.name}</td>
                            <td className="px-3 py-2 text-right">
                              {user.role === 'admin'
                                ? <input type="number" min="0" value={r.target} onChange={(e) => setRow(r.code, 'target', e.target.value)}
                                    className="border rounded px-2 py-1 text-sm w-24 text-right" />
                                : <span className="tabular-nums text-gray-700">{r.t.toLocaleString()}</span>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {user.role === 'admin'
                                ? <input type="number" min="0" value={r.result} onChange={(e) => setRow(r.code, 'result', e.target.value)}
                                    className="border rounded px-2 py-1 text-sm w-24 text-right" />
                                : <span className="tabular-nums text-gray-700">{r.a.toLocaleString()}</span>}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums font-semibold">{r.pct ?? '—'}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-100 font-semibold">
                          <td className="px-4 py-2.5">รวมอำเภอ</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{liveSumT.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{liveSumA.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{liveSumT > 0 ? liveTotalPct : '—'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {user.role === 'admin' && (
                    <div className="px-5 py-4 border-t flex flex-wrap items-center gap-3">
                      <button onClick={saveManualDetail} disabled={mSaving}
                        className="bg-blue-800 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm px-5 py-2 rounded-lg font-medium">
                        {mSaving ? 'กำลังบันทึก...' : 'บันทึกรายตำบล'}
                      </button>
                      {mMsg && <span className="text-sm">{mMsg}</span>}
                      <span className="text-xs text-gray-400">เปิด HDC → คัดลอก B (เด็กในพื้นที่) / A (ได้ครบ) แต่ละตำบลมากรอก</span>
                    </div>
                  )}
                </div>
                {user.role !== 'admin' && <p className="text-xs text-gray-400 mb-6">* เฉพาะผู้ดูแลระบบ (admin) กรอก/แก้ค่าได้</p>}
              </>
            ) : data.months.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
                {data.message ?? 'ยังไม่มีข้อมูล detail'}
              </div>
            ) : (
              <>
                {/* สรุประดับอำเภอ */}
                <div className="bg-white rounded-xl shadow-sm border p-5 mb-6 flex flex-wrap items-center gap-8">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-blue-700">
                      {total?.calcValue ?? '—'}
                      {total?.calcValue !== null && <span className="text-xl text-gray-400"> {data.kpi.unit}</span>}
                    </div>
                    <p className="text-gray-500 text-xs mt-1">รวมอำเภอ (คำนวณจาก detail)</p>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>เป้าหมาย: <b>{target}</b> {data.kpi.unit} ({direction && DIRECTION_LABEL[direction]})</p>
                    {data.savedMonthly && (
                      <p className="text-xs text-gray-400">
                        ค่าที่บันทึกบน Scorecard เดือนนี้: {data.savedMonthly.value} {data.kpi.unit}
                      </p>
                    )}
                    {total?.status && (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[total.status]}`}>
                        {STATUS_META[total.status].label}
                      </span>
                    )}
                  </div>
                </div>

                {!data.mappingOk && (
                  <div className="mb-6 bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-lg text-sm">
                    ⚠️ สูตรคำนวณของ KPI นี้ยังไม่ได้รับการยืนยัน — แสดงเฉพาะยอดดิบรายตำบล ยังไม่คิด %
                  </div>
                )}

                {/* กราฟแท่งรายตำบล + เส้นเป้าหมาย (แบบ HDC) */}
                {showPct && (
                  <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
                    <h2 className="font-semibold text-gray-800 mb-3 text-sm">แผนภูมิรายตำบล — เดือน{formatThaiMonth(data.month!)}</h2>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v) => [`${v} ${data.kpi.unit}`]} />
                        {target > 0 && direction !== 'none' && (
                          <ReferenceLine y={target} stroke="#dc2626" strokeDasharray="6 4"
                            label={{ value: `เป้าหมาย ${target}`, fill: '#dc2626', fontSize: 12, position: 'insideTopRight' }} />
                        )}
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {chartData.map((d, i) => <Cell key={i} fill={BAR_COLOR[d.status] ?? '#3b82f6'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ตารางรายตำบล (HDC-style) */}
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-6">
                  <div className="px-5 py-3 border-b">
                    <h2 className="font-semibold text-gray-800 text-sm">ตารางรายตำบล — เดือน{formatThaiMonth(data.month!)}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">ตำบล</th>
                          {fieldList.map((f) => (
                            <th key={f} className="text-right px-3 py-2 font-medium whitespace-nowrap">{fieldLabels[f] ?? f}</th>
                          ))}
                          {showPct && <th className="text-right px-4 py-2 font-medium">ผลงาน ({data.kpi.unit})</th>}
                          {showPct && <th className="text-center px-4 py-2 font-medium">สถานะ</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {groups.map((g) => (
                          <tr key={g.code} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-900">{g.name}</td>
                            {fieldList.map((f) => (
                              <td key={f} className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                                {(g.fields[f] ?? 0).toLocaleString()}
                              </td>
                            ))}
                            {showPct && (
                              <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                                {g.calcValue ?? '—'}
                              </td>
                            )}
                            {showPct && (
                              <td className="px-4 py-2.5 text-center">
                                {g.status && (
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[g.status]}`}>
                                    {STATUS_META[g.status].label}
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                        {total && (
                          <tr className="bg-gray-100 font-semibold">
                            <td className="px-4 py-2.5">{total.name}</td>
                            {fieldList.map((f) => (
                              <td key={f} className="px-3 py-2.5 text-right tabular-nums">
                                {(total.fields[f] ?? 0).toLocaleString()}
                              </td>
                            ))}
                            {showPct && <td className="px-4 py-2.5 text-right tabular-nums">{total.calcValue ?? '—'}</td>}
                            {showPct && (
                              <td className="px-4 py-2.5 text-center">
                                {total.status && (
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[total.status]}`}>
                                    {STATUS_META[total.status].label}
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* นิยาม/หมายเหตุ (แบบใต้ตาราง HDC) */}
                {data.kpi.description && (
                  <div className="bg-white rounded-xl shadow-sm border p-5 text-sm text-gray-600">
                    <h3 className="font-semibold text-gray-800 mb-2 text-sm">นิยาม / หมายเหตุ</h3>
                    <p className="whitespace-pre-line">{data.kpi.description}</p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
