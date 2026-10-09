'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import Navbar from '@/components/Navbar'
import { buildScorecard } from '@/lib/scorecard'
import { summarizeSets, setCodeFor, type KpiSetInfo, type SetSummary } from '@/lib/setsSummary'
import { exportInspectionXlsx, isInspectionSet, type InspectionNote } from '@/lib/exportInspection'
import { STATUS_META } from '@/lib/kpiStatus'
import { detailViewHref } from '@/lib/detailView'
import { formatThaiMonth } from '@/lib/formatMonth'
import { quarterInfoOfMonth } from '@/lib/fiscalQuarter'
import { scoreFor, rankingTotal, type ScoreBands, type RankingTotal } from '@/lib/rankingScore'
import type { KPIReport, KpiEvalStatus, MonthlyData } from '@/lib/types'

type RankingItemView = { id: string; weight: number | null; score: number | null; reason?: string }
type RankingData = { byId: Map<string, RankingItemView>; total: RankingTotal }

const STATUS_BADGE: Record<KpiEvalStatus, string> = {
  fail: 'bg-red-100 text-red-700', watch: 'bg-amber-100 text-amber-700',
  no_data: 'bg-gray-100 text-gray-600', needs_review: 'bg-orange-100 text-orange-700',
  invalid: 'bg-purple-100 text-purple-700', pass: 'bg-green-100 text-green-700',
  no_target: 'bg-slate-100 text-slate-700', narrative: 'bg-slate-100 text-slate-700',
}

/**
 * /sets/[slug] — รายชุดตัวชี้วัด (docs/kpi-sets-plan.md K6) · dynamic ตาม slug ไม่ต้องเขียนหน้าใหม่ต่อชุด
 */
export default function SetDetailPage() {
  const { user } = useAuth()
  const slug = String(useParams().slug ?? '')
  const [kpis, setKpis] = useState<KPIReport[]>([])
  const [sets, setSets] = useState<KpiSetInfo[]>([])
  const [monthly, setMonthly] = useState<MonthlyData[]>([])
  const [latestMonth, setLatestMonth] = useState('')
  const [months, setMonths] = useState<string[]>([])   // ทุกเดือนที่มีข้อมูล (ให้เลือกดูย้อนหลังได้)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!user) return
    Promise.all([fetch('/api/kpis'), fetch('/api/kpi-sets'), fetch('/api/monthly')])
      .then(async ([kRes, sRes, mRes]) => {
        if (kRes.ok) setKpis(await kRes.json())
        if (sRes.ok) setSets(await sRes.json())
        if (mRes.ok) {
          const mData: MonthlyData[] = await mRes.json()
          setMonthly(mData)
          const monthList = Array.from(new Set(mData.map((m) => m.month))).sort()
          setMonths(monthList)
          setLatestMonth(monthList[monthList.length - 1] || '')
        }
      })
      .finally(() => setLoading(false))
  }, [user])

  // ตัวชี้วัดที่รายงานเป็นรอบ (เช่น ตรวจราชการ รอบ 1 = ปิดที่ มี.ค.) เก็บค่าไว้คนละเดือนกับ KPI รายเดือน
  // → ให้เลือกเดือนได้ ไม่งั้นค่าที่กรอกไว้เดือนอื่นจะไม่โผล่เลย (default ยังเป็นเดือนล่าสุดเหมือนเดิม)
  const summary = useMemo(() => {
    const { rows } = buildScorecard(kpis, monthly, latestMonth)
    return summarizeSets(rows, sets).find((s) => s.set.slug === slug) ?? null
  }, [kpis, monthly, latestMonth, sets, slug])

  // L7 — ชุดที่มีน้ำหนัก (Ranking) แสดงคะแนน 1-5 × น้ำหนัก แทนผ่าน/ไม่ผ่าน · ชุดอื่นไม่มีน้ำหนัก = หน้าเดิม
  const ranking = useMemo(() => {
    if (!summary) return null
    const items = summary.rows.map((r) => {
      const tag = r.kpi.sets?.find((s) => s.id === summary.set.id)
      const res = scoreFor(tag?.scoreBands ?? null, r.value, r.valueText ?? null)
      return { id: r.kpi.id, weight: tag?.weight ?? null, ...res }
    })
    if (!items.some((it) => it.weight != null)) return null
    return { byId: new Map(items.map((it) => [it.id, it])), total: rankingTotal(items) }
  }, [summary])

  // L6 — ส่งออกกลับเป็นฟอร์มตรวจราชการ (แทนการกรอก Excel ซ้ำ)
  // หมายเหตุเชิงคุณภาพอยู่คนละตาราง (kpi_period_notes) → ดึงทั้งรอบทีเดียวตอนกด ไม่ถ่วงตอนเปิดหน้า
  async function handleExport() {
    if (!summary || !latestMonth) return
    setExporting(true)
    try {
      const res = await fetch(`/api/kpi-notes?period=${latestMonth}`)
      const notes: InspectionNote[] = res.ok ? ((await res.json()).notes ?? []) : []
      await exportInspectionXlsx(summary, notes, latestMonth)
    } catch (err) {
      console.error('export ฟอร์มตรวจราชการล้มเหลว:', err)
      alert('ส่งออกไม่สำเร็จ — ลองใหม่อีกครั้ง')
    } finally {
      setExporting(false)
    }
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link href="/sets" className="text-sm text-indigo-600 hover:text-indigo-800">← ทุกชุดตัวชี้วัด</Link>

        {loading ? (
          <div className="text-center py-16 text-gray-400">กำลังโหลด...</div>
        ) : !summary ? (
          <div className="text-center py-16 text-gray-400">ไม่พบชุด &quot;{slug}&quot;</div>
        ) : (
          <>
            <div className="mt-3 mb-6">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{summary.set.name}</h1>
                {summary.set.fiscalYear && <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-xs font-medium">ปีงบ {summary.set.fiscalYear}</span>}
              </div>
              {summary.set.description && <p className="text-gray-500 text-sm mt-1">{summary.set.description}</p>}
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <p className="text-gray-500 text-sm">
                  {summary.total} ตัวชี้วัด
                  {/* ชุด Ranking ประเมินด้วยคะแนน 1-5 (การ์ดด้านล่าง) — จำนวนผ่าน/ไม่ผ่านไม่มีความหมาย */}
                  {!ranking && summary.evaluated > 0 && <> · <b className="text-gray-700">ผ่าน {summary.pass}/{summary.evaluated} ที่ประเมิน</b></>}
                </p>
                {months.length > 0 && (
                  <label className="flex items-center gap-1.5 text-sm text-gray-500">
                    · เดือน
                    <select
                      value={latestMonth}
                      onChange={(e) => setLatestMonth(e.target.value)}
                      className="border rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      {[...months].reverse().map((m) => (
                        <option key={m} value={m}>{quarterInfoOfMonth(m) ? `${formatThaiMonth(m)} (${quarterInfoOfMonth(m)!.label})` : formatThaiMonth(m)}</option>
                      ))}
                    </select>
                  </label>
                )}
                {isInspectionSet(summary.set.slug) && summary.total > 0 && (
                  <button
                    onClick={handleExport}
                    disabled={exporting || !latestMonth}
                    title="ดาวน์โหลดเป็นไฟล์ Excel เลย์เอาต์เดียวกับฟอร์มตรวจราชการ — ส่งเขตได้เลย"
                    className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-3 py-1.5 rounded-lg"
                  >
                    📥 {exporting ? 'กำลังสร้างไฟล์...' : 'ส่งออกฟอร์มตรวจราชการ'}
                  </button>
                )}
              </div>
            </div>

            {summary.total === 0 ? (
              <div className="bg-white rounded-xl border p-10 text-center text-gray-400">
                ยังไม่มีตัวชี้วัดในชุดนี้ — ผูกได้ที่ /admin แท็บ KPI → แก้ไข KPI → ช่อง &quot;ชุด/ประเภทตัวชี้วัด&quot;
              </div>
            ) : ranking ? (
              <RankingView summary={summary} ranking={ranking} />
            ) : (
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-gray-600 w-16">ข้อ</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">ตัวชี้วัด</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-600">ผล</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-600">เป้า</th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {summary.rows.map((r) => {
                        const code = setCodeFor(r, summary.set.id)
                        const tag = r.kpi.sets?.find((s) => s.id === summary.set.id)
                        const refTargets = [tag?.targetRegion && `เขต ${tag.targetRegion}`, tag?.targetProvince && `จังหวัด ${tag.targetProvince}`].filter(Boolean).join(' · ')
                        return (
                          <tr key={r.kpi.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-500 tabular-nums">{code ?? '—'}</td>
                            <td className="px-4 py-3">
                              <Link href={detailViewHref(r.kpi)} className="font-medium text-gray-900 hover:text-indigo-700 hover:underline">{r.kpi.name}</Link>
                              <div className="text-xs text-gray-400">{r.kpi.category} • {r.kpi.owner}</div>
                              {/* ที่มาของตัวเลข — กันสับสนเวลาตัวชี้วัดเดียวกันเลือกได้หลายรายงาน HDC */}
                              <div className="text-[11px] text-gray-400 mt-0.5">
                                ที่มา:{' '}
                                {r.kpi.manualEntry
                                  ? <span className="text-blue-600">✍️ กรอกมือ</span>
                                  : <span className="font-mono text-gray-500">{r.kpi.mophTable ?? '—'}</span>}
                                {r.kpi.dataSource && <span className="text-gray-400"> ({r.kpi.dataSource})</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {r.valueText != null
                                ? <span className="text-gray-700">{r.valueText || '—'}</span>
                                : <span className="tabular-nums">{r.value === null ? '—' : `${r.value.toLocaleString()}${r.kpi.unit ? ' ' + r.kpi.unit : ''}`}</span>}
                              {/* ค่ายกมาจากเดือนก่อน (ยอดสะสม) — บอกอายุข้อมูลเสมอ */}
                              {r.isCarriedForward && r.dataMonth && (
                                <div className="text-[10px] text-amber-700">ณ {formatThaiMonth(r.dataMonth)}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              <div className="tabular-nums">{tag?.targetHospital
                                ? tag.targetHospital
                                : (r.direction === 'none' || r.kpi.measureType === 'level') ? '—' : r.target.toLocaleString()}</div>
                              {refTargets && <div className="text-[10px] text-gray-400 mt-0.5">{refTargets}</div>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[r.status]}`}>{STATUS_META[r.status].label}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// L7 — มุมมอง Ranking: การ์ดสรุป + ตัวกรอง + แถวย่อ (กดขยายดูเกณฑ์ 1-5)
// ---------------------------------------------------------------------------

/** สีคะแนน 0-5 (0 = ต่ำกว่าเกณฑ์คะแนน 1) */
const scoreColor = (s: number) => (s >= 4 ? 'bg-green-500' : s === 3 ? 'bg-amber-400' : 'bg-red-500')

/** ข้อความเกณฑ์ของคะแนน 1-5 (ช่องที่ไม่ใช้ = null) — label ตามไฟล์ต้นฉบับก่อน ไม่มีค่อยใช้ขั้นตัวเลข */
function bandCells(b: ScoreBands | null | undefined): (string | null)[] {
  const cells: (string | null)[] = [null, null, null, null, null]
  if (!b) return cells
  if (b.kind === 'level') {
    for (const band of b.bands) if (band.score >= 1 && band.score <= 5) cells[band.score - 1] = band.label
    return cells
  }
  for (const band of b.bands) {
    if (band.score < 1 || band.score > 5) continue
    cells[band.score - 1] = band.label
      || (b.better === 'higher' ? (band.min != null ? `≥ ${band.min}` : 'ต่ำกว่า') : (band.max != null ? `≤ ${band.max}` : 'สูงกว่า'))
  }
  return cells
}

/** หมวดชั่วคราวตอนนำเข้า — ไม่มีความหมายกับผู้อ่าน ไม่ต้องโชว์ */
const isPlaceholderCategory = (c?: string | null) => !c || c.startsWith('ยังไม่จัดหมวด')

type RankFilter = 'all' | 'wait' | 'low' | 'good'

function RankingView({ summary, ranking }: { summary: SetSummary; ranking: RankingData }) {
  const [filter, setFilter] = useState<RankFilter>('all')
  const [group, setGroup] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())

  const rows = useMemo(() => summary.rows
    .map((r) => ({ r, it: ranking.byId.get(r.kpi.id)!, tag: r.kpi.sets?.find((s) => s.id === summary.set.id) }))
    .filter((x) => x.it && x.it.weight != null), [summary, ranking])

  const stats = useMemo(() => {
    const wait = rows.filter((x) => x.it.score == null)
    return {
      wait: wait.length,
      waitWeight: +wait.reduce((a, x) => a + (x.it.weight ?? 0), 0).toFixed(1),
      low: rows.filter((x) => x.it.score != null && x.it.score <= 2).length,
      good: rows.filter((x) => (x.it.score ?? 0) >= 4).length,
    }
  }, [rows])
  const groups = useMemo(() => Array.from(new Set(rows.flatMap((x) => x.r.kpi.workGroups ?? []))).sort((a, b) => a.localeCompare(b, 'th')), [rows])

  const shown = rows.filter(({ r, it }) => {
    const s = it.score
    if (filter === 'wait' && s != null) return false
    if (filter === 'low' && !(s != null && s <= 2)) return false
    if (filter === 'good' && !(s != null && s >= 4)) return false
    return !group || (r.kpi.workGroups ?? []).includes(group)
  })

  const t = ranking.total
  const pct = (n: number) => (t.fullWeight > 0 ? Math.max(0, (n / t.fullWeight) * 100) : 0)
  const lost = t.maxPossible - t.total          // ข้อที่มีผลแล้วแต่ไม่ได้เต็ม
  const toggle = (id: string) => setOpen((prev) => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const chips: { key: RankFilter; label: string; n: number }[] = [
    { key: 'all', label: 'ทั้งหมด', n: rows.length },
    { key: 'wait', label: 'รอกรอก', n: stats.wait },
    { key: 'low', label: 'คะแนนต่ำ 0-2', n: stats.low },
    { key: 'good', label: 'ได้ 4-5', n: stats.good },
  ]
  const grid = 'grid grid-cols-[2.25rem_minmax(0,1fr)_5.5rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_6.5rem_5.5rem_5.5rem_1rem] gap-x-3 items-center'

  return (
    <>
      {/* การ์ดสรุป */}
      <div className="bg-white rounded-xl shadow-sm border p-5 mb-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm text-gray-500">คะแนน Ranking</span>
          <span className="text-3xl font-bold text-indigo-700 tabular-nums">{t.total.toFixed(2)}</span>
          <span className="text-gray-400">/ {t.fullWeight}</span>
          <span className="sm:ml-auto text-sm text-gray-500">คิดเป็นเต็ม 100 = <b className="text-gray-800 tabular-nums">{t.fullWeight > 0 ? ((t.total / t.fullWeight) * 100).toFixed(2) : '—'}</b></span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full my-3 overflow-hidden flex" title="เขียว = ได้แล้ว · แดงอ่อน = เสียไปจากข้อที่มีผลแล้ว · เหลือง = ข้อที่ยังรอกรอก">
          <div className="bg-green-500" style={{ width: `${pct(t.total)}%` }} />
          <div className="bg-red-200" style={{ width: `${pct(lost)}%` }} />
          <div className="bg-amber-200" style={{ width: `${pct(stats.waitWeight)}%` }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500">มีผลงานแล้ว</div>
            <div className="text-lg font-semibold tabular-nums">{t.scored} <span className="text-xs font-normal text-gray-500">/ {t.items} ข้อ</span></div>
          </div>
          <div className="bg-amber-50 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500">รอกรอก</div>
            <div className="text-lg font-semibold text-amber-700 tabular-nums">{stats.wait} <span className="text-xs font-normal text-gray-500">ข้อ · ยังเก็บได้อีก {stats.waitWeight} คะแนน</span></div>
          </div>
          <div className="bg-red-50 rounded-lg px-3 py-2">
            <div className="text-xs text-gray-500">คะแนนต่ำ (0-2)</div>
            <div className="text-lg font-semibold text-red-700 tabular-nums">{stats.low} <span className="text-xs font-normal text-gray-500">ข้อ</span></div>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">คะแนนแต่ละข้อ 1-5 ตามเกณฑ์ × น้ำหนัก ÷ 5 · ข้อที่ยังไม่มีผลงานยังไม่ถูกนับ · กดแถวเพื่อดูเกณฑ์</p>
      </div>

      {/* ตัวกรอง */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {chips.map((c) => (
          <button key={c.key} onClick={() => setFilter(c.key)}
            className={`text-xs px-3 py-1.5 rounded-full border ${filter === c.key ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            {c.label} ({c.n})
          </button>
        ))}
        {groups.length > 0 && (
          <select value={group} onChange={(e) => setGroup(e.target.value)}
            className="sm:ml-auto border rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">ทุกกลุ่มงาน</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className={`${grid} px-4 py-2.5 bg-gray-50 border-b text-xs font-medium text-gray-500`}>
          <span>ข้อ</span><span>ตัวชี้วัด</span>
          <span className="hidden sm:block text-right">ผล</span>
          <span className="hidden sm:block text-center">คะแนน</span>
          <span className="text-right">ได้ / เต็ม</span>
          <span className="hidden sm:block" />
        </div>
        {shown.length === 0 && <div className="px-4 py-10 text-center text-sm text-gray-400">ไม่มีข้อที่ตรงกับตัวกรอง</div>}
        {shown.map(({ r, it, tag }) => {
          const id = r.kpi.id
          const isOpen = open.has(id)
          const score = it.score
          const weight = it.weight ?? 0
          const code = setCodeFor(r, summary.set.id)
          const valueStr = r.valueText != null
            ? (r.valueText || '—')
            : r.value === null ? '—' : `${r.value.toLocaleString()}${r.kpi.unit ? ' ' + r.kpi.unit : ''}`
          const cells = bandCells(tag?.scoreBands)
          const target = tag?.targetHospital || ((r.direction === 'none' || r.kpi.measureType === 'level') ? null : r.target.toLocaleString())
          const meta = [r.kpi.owner, (r.kpi.workGroups ?? []).join(', '), !isPlaceholderCategory(r.kpi.category) ? r.kpi.category : ''].filter(Boolean).join(' · ')
          const pending = score == null && it.reason === 'ยังไม่มีผลงาน'
          return (
            <div key={id} className="border-b last:border-b-0">
              <div role="button" tabIndex={0} aria-expanded={isOpen}
                onClick={() => toggle(id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(id) } }}
                className={`${grid} px-4 py-3 cursor-pointer hover:bg-gray-50 ${isOpen ? 'bg-indigo-50/40' : ''}`}>
                <span className="text-sm text-gray-500 tabular-nums">{code ?? '—'}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 line-clamp-2" title={r.kpi.name}>{r.kpi.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    {meta && <>{meta} · </>}
                    {r.kpi.manualEntry ? <span className="text-blue-600">✍️ กรอกมือ</span> : <span>📊 {r.kpi.dataSource || 'HDC'}</span>}
                  </div>
                  {/* จอเล็ก: ผล + คะแนนย้ายมาใต้ชื่อ */}
                  <div className="sm:hidden text-xs text-gray-600 mt-1">ผล {valueStr} · {score == null ? <span className="text-amber-700">{pending ? 'รอกรอก' : it.reason}</span> : `คะแนน ${score}`}</div>
                </div>
                <div className="hidden sm:block text-right text-sm">
                  <span className="tabular-nums">{valueStr}</span>
                  {r.isCarriedForward && r.dataMonth && <div className="text-[10px] text-amber-700">ณ {formatThaiMonth(r.dataMonth)}</div>}
                </div>
                <div className="hidden sm:flex justify-center gap-0.5" title={score == null ? it.reason : `${score} คะแนน`}>
                  {score == null
                    ? <span className={`text-xs ${pending ? 'text-amber-700' : 'text-red-600'}`}>{pending ? 'รอกรอก' : 'ตรวจเกณฑ์'}</span>
                    : Array.from({ length: 5 }, (_, i) => <span key={i} className={`w-2 h-2 rounded-full ${i < score ? scoreColor(score) : 'bg-gray-200'}`} />)}
                </div>
                <span className="text-right text-sm tabular-nums">
                  {score == null ? <span className="text-gray-400">—</span> : <b className="text-gray-800">{((score * weight) / 5).toFixed(2)}</b>}
                  <span className="text-xs text-gray-400"> / {weight}</span>
                </span>
                <span className={`hidden sm:block text-gray-400 text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
              </div>

              {isOpen && (
                <div className="px-4 pb-4 sm:pl-[3.75rem]">
                  {r.kpi.name.length > 80 && <p className="text-xs text-gray-600 leading-relaxed mb-2">{r.kpi.name}</p>}
                  <div className="text-xs text-gray-500 mb-1.5">
                    {target ? <>เป้า: <b className="text-gray-700">{target}</b> · </> : null}เกณฑ์คะแนน
                    {score === 0 && <span className="text-red-600"> · ต่ำกว่าเกณฑ์คะแนน 1 (ได้ 0)</span>}
                    {score == null && !pending && it.reason && <span className="text-red-600"> · {it.reason}</span>}
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {cells.map((c, i) => (
                      <div key={i} className={`rounded-md px-1.5 py-1.5 text-center text-[11px] leading-snug ${score === i + 1 ? 'border-2 border-indigo-500 bg-indigo-50 text-indigo-800' : 'border text-gray-500'}`}>
                        <div className="font-semibold">{i + 1}</div>
                        <div className="break-words">{c ?? '—'}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
                    <Link href={detailViewHref(r.kpi)} className="inline-flex items-center gap-1 border rounded-lg px-3 py-1.5 text-indigo-700 hover:bg-indigo-50">
                      {pending ? 'ไปกรอกผลงาน' : 'ดูรายละเอียด'} →
                    </Link>
                    <span className="text-gray-400">ที่มา: {r.kpi.manualEntry ? 'กรอกมือ' : <span className="font-mono">{r.kpi.mophTable ?? '—'}</span>}{r.kpi.dataSource ? ` (${r.kpi.dataSource})` : ''}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
