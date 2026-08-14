'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import Navbar from '@/components/Navbar'
import { buildScorecard } from '@/lib/scorecard'
import { summarizeSets, setCodeFor, type KpiSetInfo } from '@/lib/setsSummary'
import { exportInspectionXlsx, isInspectionSet, type InspectionNote } from '@/lib/exportInspection'
import { STATUS_META } from '@/lib/kpiStatus'
import { detailViewHref } from '@/lib/detailView'
import { formatThaiMonth } from '@/lib/formatMonth'
import { quarterInfoOfMonth } from '@/lib/fiscalQuarter'
import type { KPIReport, KpiEvalStatus, MonthlyData } from '@/lib/types'

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
                  {summary.evaluated > 0 && <> · <b className="text-gray-700">ผ่าน {summary.pass}/{summary.evaluated} ที่ประเมิน</b></>}
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
