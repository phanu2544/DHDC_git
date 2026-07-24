'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import Navbar from '@/components/Navbar'
import { buildScorecard } from '@/lib/scorecard'
import { summarizeSets, setCodeFor, type KpiSetInfo } from '@/lib/setsSummary'
import { STATUS_META } from '@/lib/kpiStatus'
import { detailViewHref } from '@/lib/detailView'
import { formatThaiMonth } from '@/lib/formatMonth'
import type { KPIReport, KpiEvalStatus, MonthlyData } from '@/lib/types'

const STATUS_BADGE: Record<KpiEvalStatus, string> = {
  fail: 'bg-red-100 text-red-700', watch: 'bg-amber-100 text-amber-700',
  no_data: 'bg-gray-100 text-gray-600', needs_review: 'bg-orange-100 text-orange-700',
  invalid: 'bg-purple-100 text-purple-700', pass: 'bg-green-100 text-green-700',
  no_target: 'bg-slate-100 text-slate-700',
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
  const [loading, setLoading] = useState(true)

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
          setLatestMonth(monthList[monthList.length - 1] || '')
        }
      })
      .finally(() => setLoading(false))
  }, [user])

  const summary = useMemo(() => {
    const { rows } = buildScorecard(kpis, monthly, latestMonth)
    return summarizeSets(rows, sets).find((s) => s.set.slug === slug) ?? null
  }, [kpis, monthly, latestMonth, sets, slug])

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
              <p className="text-gray-500 text-sm mt-2">
                {summary.total} ตัวชี้วัด
                {summary.evaluated > 0 && <> · <b className="text-gray-700">ผ่าน {summary.pass}/{summary.evaluated} ที่ประเมิน</b></>}
                {latestMonth && <> · เดือน {formatThaiMonth(latestMonth)}</>}
              </p>
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
                        return (
                          <tr key={r.kpi.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-500 tabular-nums">{code ?? '—'}</td>
                            <td className="px-4 py-3">
                              <Link href={detailViewHref(r.kpi)} className="font-medium text-gray-900 hover:text-indigo-700 hover:underline">{r.kpi.name}</Link>
                              <div className="text-xs text-gray-400">{r.kpi.category} • {r.kpi.owner}</div>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">{r.value === null ? '—' : `${r.value.toLocaleString()}${r.kpi.unit ? ' ' + r.kpi.unit : ''}`}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-600">{r.direction === 'none' ? '—' : r.target.toLocaleString()}</td>
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
