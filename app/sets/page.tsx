'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/useAuth'
import Navbar from '@/components/Navbar'
import { buildScorecard } from '@/lib/scorecard'
import { summarizeSets, type KpiSetInfo } from '@/lib/setsSummary'
import { formatThaiMonth } from '@/lib/formatMonth'
import type { KPIReport, MonthlyData } from '@/lib/types'

/**
 * /sets — หน้ารวมชุด/ประเภทตัวชี้วัด (docs/kpi-sets-plan.md K6)
 * การ์ดต่อชุด: ผ่าน x/y ที่ประเมิน + จำนวนตัวชี้วัด → คลิกเข้า /sets/[slug]
 */
export default function SetsPage() {
  const { user } = useAuth()
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

  const summaries = useMemo(() => {
    const { rows } = buildScorecard(kpis, monthly, latestMonth)
    return summarizeSets(rows, sets)
  }, [kpis, monthly, latestMonth, sets])

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">ชุด/ประเภทตัวชี้วัด</h1>
          <p className="text-gray-500 text-sm mt-1">
            จัดตามพันธะ/ปลายทางที่ต้องส่ง (ตรวจราชการ · งานคุณภาพ · ร่วม อบจ. · Ranking · Smart Hospital)
            {latestMonth && <> · ประเมินเดือน {formatThaiMonth(latestMonth)}</>}
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">กำลังโหลด...</div>
        ) : summaries.length === 0 ? (
          <div className="text-center py-16 text-gray-400">ยังไม่มีชุดตัวชี้วัด — เพิ่มได้ที่ /admin แท็บ KPI</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {summaries.map(({ set, total, pass, evaluated, statusCounts }) => {
              const pct = evaluated > 0 ? Math.round((pass / evaluated) * 100) : null
              return (
                <Link key={set.id} href={`/sets/${set.slug}`}
                  className="block bg-white rounded-xl shadow-sm border p-5 hover:shadow-md hover:border-indigo-300 transition">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h2 className="font-semibold text-gray-900 leading-snug">{set.name}</h2>
                    {set.fiscalYear && (
                      <span className="shrink-0 bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-medium">ปีงบ {set.fiscalYear}</span>
                    )}
                  </div>

                  {total === 0 ? (
                    <p className="text-sm text-gray-400 italic">ยังไม่มีตัวชี้วัดในชุดนี้</p>
                  ) : (
                    <>
                      <div className="flex items-end gap-2 mb-2">
                        <span className="text-3xl font-bold text-gray-900">{pct === null ? '—' : `${pct}%`}</span>
                        <span className="text-sm text-gray-500 mb-1">
                          {evaluated > 0 ? <>ผ่าน {pass}/{evaluated} ที่ประเมิน</> : 'ไม่มีตัวที่ประเมิน'}
                        </span>
                      </div>
                      {/* แถบสัดส่วน ผ่าน(เขียว) / ไม่ผ่าน+เฝ้าระวัง(แดง) / อื่นๆ(เทา) */}
                      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 mb-3">
                        <div className="bg-green-500" style={{ width: `${(statusCounts.pass / total) * 100}%` }} />
                        <div className="bg-red-500" style={{ width: `${((statusCounts.fail + statusCounts.watch) / total) * 100}%` }} />
                        <div className="bg-gray-300" style={{ width: `${((statusCounts.no_data + statusCounts.needs_review + statusCounts.invalid + statusCounts.no_target) / total) * 100}%` }} />
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        <span>ทั้งหมด {total}</span>
                        {statusCounts.pass > 0 && <span className="text-green-600">ผ่าน {statusCounts.pass}</span>}
                        {statusCounts.fail > 0 && <span className="text-red-600">ไม่ผ่าน {statusCounts.fail}</span>}
                        {statusCounts.watch > 0 && <span className="text-amber-600">เฝ้าระวัง {statusCounts.watch}</span>}
                        {statusCounts.no_data > 0 && <span>ยังไม่มีข้อมูล {statusCounts.no_data}</span>}
                        {statusCounts.no_target > 0 && <span>ติดตาม {statusCounts.no_target}</span>}
                      </div>
                    </>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
