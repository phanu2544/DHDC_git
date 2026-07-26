'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/useAuth'
import Link from 'next/link'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import Navbar from '@/components/Navbar'
import StatusBadge from '@/components/StatusBadge'
import { STATUS_META } from '@/lib/kpiStatus'
import { buildScorecard, EXECUTIVE_SEVERITY_ORDER, ATTENTION_STATUSES, DIRECTION_LABEL } from '@/lib/scorecard'
import { exportScorecardXlsx } from '@/lib/exportScorecard'
import { detailViewHref } from '@/lib/detailView'
import { formatThaiMonth } from '@/lib/formatMonth'
import type { KPIReport, KpiEvalStatus, MonthlyData } from '@/lib/types'

const PIE_COLORS = ['#22c55e', '#3b82f6', '#ef4444']

// Executive Scorecard core (eval/order/labels) ย้ายไป lib/scorecard.ts เพื่อ reuse กับ Export
// เหลือเฉพาะ STATUS_STYLE (สี) ที่เป็น presentation ของหน้านี้
/** สี presentation ของแต่ละสถานะ (kpiStatus.ts/scorecard.ts คง pure — สีอยู่ที่ UI) */
const STATUS_STYLE: Record<KpiEvalStatus, { card: string; badge: string }> = {
  fail:         { card: 'bg-red-600',    badge: 'bg-red-100 text-red-700' },
  needs_review: { card: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
  invalid:      { card: 'bg-purple-600', badge: 'bg-purple-100 text-purple-700' },
  watch:        { card: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700' },
  no_data:      { card: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-600' },
  pass:         { card: 'bg-green-600',  badge: 'bg-green-100 text-green-700' },
  no_target:    { card: 'bg-slate-500',  badge: 'bg-slate-100 text-slate-700' },
  narrative:    { card: 'bg-slate-500',  badge: 'bg-slate-100 text-slate-700' },
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [kpis, setKpis] = useState<KPIReport[]>([])
  const [monthly, setMonthly] = useState<MonthlyData[]>([])
  const [months, setMonths] = useState<string[]>([])
  const [latestMonth, setLatestMonth] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [onlyAttention, setOnlyAttention] = useState(false)
  const [onlyMyGroup, setOnlyMyGroup] = useState(false)
  const [sets, setSets] = useState<{ name: string }[]>([])
  const [setFilter, setSetFilter] = useState('ทุกประเภท')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    async function load() {
      try {
        const [kRes, mRes, sRes] = await Promise.all([
          fetch('/api/kpis'),
          fetch('/api/monthly'),
          fetch('/api/kpi-sets'),
        ])
        if (!kRes.ok) throw new Error('โหลด KPI ไม่สำเร็จ')
        const kData: KPIReport[] = await kRes.json()
        setKpis(kData)
        if (sRes.ok) setSets(await sRes.json())

        const mData: MonthlyData[] = await mRes.json()
        setMonthly(mData)
        const monthList = Array.from(new Set(mData.map((m) => m.month))).sort()
        setMonths(monthList)
        const latest = monthList[monthList.length - 1] || ''
        setLatestMonth(latest)
        setSelectedMonth(latest)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  // ── Executive Scorecard: ประเมินทุก KPI สำหรับเดือนที่เลือก (client-side, pure) ──
  const scorecard = useMemo(
    () => buildScorecard(kpis, monthly, selectedMonth),
    [kpis, monthly, selectedMonth],
  )

  // กรอง (toggle) + เรียงตาม EXECUTIVE_SEVERITY_ORDER (priority เฉพาะหน้านี้)
  const visibleRows = useMemo(() => {
    return scorecard.rows
      .filter((r) => !onlyAttention || ATTENTION_STATUSES.includes(r.status))
      .filter((r) => !onlyMyGroup || (user?.department && r.kpi.workGroups?.includes(user.department)))
      .filter((r) => setFilter === 'ทุกประเภท' || (r.kpi.sets?.some((s) => s.name === setFilter) ?? false))
      .slice()
      .sort((a, b) =>
        EXECUTIVE_SEVERITY_ORDER.indexOf(a.status) - EXECUTIVE_SEVERITY_ORDER.indexOf(b.status),
      )
  }, [scorecard.rows, onlyAttention, onlyMyGroup, setFilter, user])

  // H3: KPI กรอกมือของกลุ่มงานตัวเองที่ยังไม่ได้กรอกเดือนนี้ (ไม่ผูกกับ toggle ด้านบน — เตือนเสมอ)
  const myPendingManual = useMemo(
    () => scorecard.rows.filter(
      // ยังไม่กรอก: text/level ดูจาก valueText ว่าง (value เป็น null เสมอ) · numeric ดูจาก value===null
      (r) => user?.department && r.kpi.manualEntry && r.kpi.workGroups?.includes(user.department)
        && ((r.kpi.measureType === 'text' || r.kpi.measureType === 'level') ? !r.valueText : r.value === null),
    ),
    [scorecard.rows, user],
  )

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
            {latestMonth ? `ข้อมูล ณ เดือน ${formatThaiMonth(latestMonth)}` : 'กำลังโหลด...'}
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
            {/* ══════════ Executive Scorecard (Phase 4C) ══════════ */}
            <section className="mb-10">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Executive Scorecard</h2>
                  <p className="text-gray-500 text-xs mt-0.5">
                    ประเมินผล KPI ตามทิศทางและเป้าหมาย — ข้อมูลสะสมปีงบประมาณ ณ วันที่เก็บของแต่ละเดือน (เทียบรายเดือน = ความก้าวหน้าสะสม)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {months.length === 0 && <option value="">— ไม่มีข้อมูล —</option>}
                    {months.map((m) => (
                      <option key={m} value={m}>{formatThaiMonth(m)}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={onlyAttention}
                      onChange={(e) => setOnlyAttention(e.target.checked)}
                      className="rounded"
                    />
                    เฉพาะที่ต้องติดตาม
                  </label>
                  {sets.length > 0 && (
                    <select value={setFilter} onChange={(e) => setSetFilter(e.target.value)}
                      title="กรองตามชุด/ประเภทตัวชี้วัด (ตรวจราชการ / HA / Ranking ฯลฯ)"
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option>ทุกประเภท</option>
                      {sets.map((s) => <option key={s.name}>{s.name}</option>)}
                    </select>
                  )}
                  {user.department && (
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none" title={`กรองเฉพาะ KPI ของกลุ่มงาน "${user.department}"`}>
                      <input
                        type="checkbox"
                        checked={onlyMyGroup}
                        onChange={(e) => setOnlyMyGroup(e.target.checked)}
                        className="rounded"
                      />
                      เฉพาะกลุ่มงานของฉัน
                    </label>
                  )}
                  <button
                    onClick={() => exportScorecardXlsx(scorecard.rows, scorecard.summary, selectedMonth)}
                    disabled={!selectedMonth || scorecard.rows.length === 0}
                    title="ดาวน์โหลด Scorecard ทั้งหมดเป็น Excel (.xlsx)"
                    className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-3 py-2 rounded-lg"
                  >
                    📥 Export Excel
                  </button>
                </div>
              </div>

              {myPendingManual.length > 0 && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm">
                  <p className="mb-2">✍️ มี <b>{myPendingManual.length}</b> ตัวชี้วัดกลุ่ม &quot;{user.department}&quot; ที่ยังไม่ได้กรอกผลงานเดือนนี้</p>
                  <div className="flex flex-wrap gap-2">
                    {myPendingManual.map((r) => (
                      <Link key={r.kpi.id} href={detailViewHref(r.kpi)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-blue-300 hover:bg-blue-100 text-xs font-medium text-blue-800">
                        {r.kpi.name} →
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {scorecard.summary.needs_review > 0 && (
                <Link href="/admin/targets"
                  className="flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm hover:bg-amber-100 transition-colors">
                  <span>⚠️ มี <b>{scorecard.summary.needs_review}</b> ตัวชี้วัดที่ยังไม่ได้ตั้งเป้าหมาย (แสดงเป็น "ต้องตรวจสอบ")</span>
                  <span className="font-medium whitespace-nowrap">ไปตั้งเป้าหมาย →</span>
                </Link>
              )}

              {/* passRate = pass / (pass + watch + fail) */}
              <div className="bg-white rounded-xl shadow-sm border p-5 mb-4 flex flex-wrap items-center gap-6">
                <div className="text-center">
                  <div className="text-4xl font-bold text-blue-700">
                    {scorecard.summary.passRate === null ? '—' : scorecard.summary.passRate}
                    {scorecard.summary.passRate !== null && <span className="text-xl text-gray-400">%</span>}
                  </div>
                  <p className="text-gray-500 text-xs mt-1">อัตราผ่าน (passRate)</p>
                </div>
                <div className="text-sm text-gray-600">
                  <p>ผ่าน <b className="text-green-700">{scorecard.summary.pass}</b> จาก <b>{scorecard.summary.evaluable}</b> ตัวที่ประเมินได้</p>
                  <p className="text-xs text-gray-400 mt-1">ตัวหาร = pass + watch + fail (ไม่รวม no_data / no_target / invalid / needs_review)</p>
                </div>
              </div>

              {/* การ์ด 7 สถานะ */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
                <StatusCard status="pass"         count={scorecard.summary.pass} />
                <StatusCard status="watch"        count={scorecard.summary.watch} />
                <StatusCard status="fail"         count={scorecard.summary.fail} />
                <StatusCard status="no_data"      count={scorecard.summary.no_data} />
                <StatusCard status="no_target"    count={scorecard.summary.no_target} />
                <StatusCard status="invalid"      count={scorecard.summary.invalid} />
                <StatusCard status="needs_review" count={scorecard.summary.needs_review} />
                {scorecard.summary.narrative > 0 && <StatusCard status="narrative" count={scorecard.summary.narrative} />}
              </div>

              {/* ตาราง KPI (เรียงตาม EXECUTIVE_SEVERITY_ORDER) */}
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="px-5 py-3 border-b flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800 text-sm">รายการ KPI ({visibleRows.length})</h3>
                  {onlyAttention && <span className="text-xs text-amber-600">กรอง: เฉพาะที่ต้องติดตาม</span>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">KPI</th>
                        <th className="text-right px-4 py-2 font-medium">ค่าจริง</th>
                        <th className="text-right px-4 py-2 font-medium">เป้า</th>
                        <th className="text-center px-4 py-2 font-medium">ทิศทาง</th>
                        <th className="text-center px-4 py-2 font-medium">สถานะ</th>
                        <th className="text-left px-4 py-2 font-medium">หมายเหตุ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {visibleRows.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-8 text-gray-400">ไม่มีรายการ</td></tr>
                      ) : (
                        visibleRows.map((r) => (
                          <tr key={r.kpi.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5">
                              <Link href={detailViewHref(r.kpi)} className="font-medium text-gray-900 hover:text-blue-700 hover:underline" title="ดูรายละเอียด">
                                {r.kpi.name}
                              </Link>
                              {r.kpi.manualEntry ? (
                                <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 align-middle">✍️ กรอกมือ</span>
                              ) : null}
                              <div className="text-xs text-gray-400">{r.kpi.category} • {r.kpi.owner}</div>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {r.valueText != null
                                ? <span className="text-gray-700">{r.valueText || '—'}</span>
                                : <span className="tabular-nums">{r.value === null ? '—' : `${r.value.toLocaleString()}${r.kpi.unit ? ' ' + r.kpi.unit : ''}`}</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                              {r.kpi.measureType === 'text' || r.kpi.measureType === 'level' ? '—' : r.target.toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-center text-xs text-gray-600">{DIRECTION_LABEL[r.direction]}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[r.status].badge}`}>
                                {STATUS_META[r.status].label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">
                              {r.kpi.manualEntry && ((r.kpi.measureType === 'text' || r.kpi.measureType === 'level') ? !r.valueText : r.value === null)
                                ? <span className="text-amber-700">✍️ ยังไม่กรอกเดือนนี้</span>
                                : (r.message ?? '')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* ══════════ ภาพรวมสถานะงาน (workflow) — ของเดิม ไม่เปลี่ยนความหมาย ══════════ */}
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

/** การ์ดสถานะ Executive Scorecard (Phase 4C) — สีจาก STATUS_STYLE, label จาก STATUS_META */
function StatusCard({ status, count }: { status: KpiEvalStatus; count: number }) {
  return (
    <div className={`${STATUS_STYLE[status].card} text-white rounded-lg p-3 shadow-sm`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-xs opacity-90 mt-0.5 leading-tight">{STATUS_META[status].label}</div>
    </div>
  )
}
