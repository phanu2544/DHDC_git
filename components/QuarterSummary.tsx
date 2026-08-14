'use client'

import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts'
import { quartersOfFiscalYear, monthsOfFiscalYear, currentQuarter } from '@/lib/fiscalQuarter'
import { formatThaiMonth } from '@/lib/formatMonth'
import { evaluateKpiStatus, STATUS_META } from '@/lib/kpiStatus'
import type { EvalDirection, KpiEvalStatus } from '@/lib/types'

const BADGE: Record<KpiEvalStatus, string> = {
  fail: 'bg-red-100 text-red-700',
  needs_review: 'bg-orange-100 text-orange-700',
  invalid: 'bg-purple-100 text-purple-700',
  watch: 'bg-amber-100 text-amber-700',
  no_data: 'bg-gray-100 text-gray-600',
  pass: 'bg-green-100 text-green-700',
  no_target: 'bg-slate-100 text-slate-700',
  narrative: 'bg-slate-100 text-slate-700',
}
const BAR_COLOR: Record<string, string> = {
  pass: '#16a34a', watch: '#f59e0b', fail: '#dc2626',
  needs_review: '#f97316', invalid: '#9333ea', no_data: '#9ca3af', no_target: '#64748b',
}

export interface MonthValue {
  month: string
  value: number | null
  valueText?: string | null
}

interface Row {
  key: string
  month: string
  label: string
  sub: string
  value: number | null
  text: string | null
  status: KpiEvalStatus | null
  isFuture: boolean
  filled: boolean
  isQuarterEnd: boolean
}

/**
 * L4 — สรุปผลงานทั้งปีงบ: สลับดู "รายไตรมาส" ↔ "รายเดือน" ได้ (owner ขอ 30 ก.ค.)
 *
 * ข้อมูลชุดเดียวกันทั้ง 2 มุม — เก็บรายเดือนใน monthly_data ตามปกติ
 * มุมไตรมาสหยิบเฉพาะ "เดือนปิดไตรมาส" (ธ.ค./มี.ค./มิ.ย./ก.ย.) มาแสดง
 * ใช้ได้เพราะตัวเลขเป็น "ยอดสะสมปีงบ" → ค่าไตรมาส = ค่า ณ เดือนปิด ไม่ต้องบวก/เฉลี่ย
 */
export default function QuarterSummary({
  fiscalYear, values, target, direction, unit, isText,
}: {
  fiscalYear: number
  values: MonthValue[]
  target: number
  direction: EvalDirection
  unit: string
  isText: boolean
}) {
  const [view, setView] = useState<'quarter' | 'month'>('quarter')
  const byMonth = new Map(values.map((v) => [v.month, v]))
  const cur = currentQuarter()

  const build = (month: string, label: string, sub: string, isQuarterEnd: boolean): Row => {
    const v = byMonth.get(month)
    const hasNum = !isText && v?.value !== null && v?.value !== undefined
    return {
      key: month, month, label, sub,
      value: hasNum ? Number(v!.value) : null,
      text: v?.valueText ?? null,
      status: hasNum ? evaluateKpiStatus(Number(v!.value), target, direction).status : null,
      isFuture: month > cur.month,
      filled: !!v && (hasNum || !!v.valueText),
      isQuarterEnd,
    }
  }

  const rows: Row[] = view === 'quarter'
    ? quartersOfFiscalYear(fiscalYear).map((q) => build(q.month, `ไตรมาส ${q.q}`, q.range, true))
    : monthsOfFiscalYear(fiscalYear).map((m) =>
        build(m.month, formatThaiMonth(m.month), m.isQuarterEnd ? `ปิดไตรมาส ${m.q}` : '', m.isQuarterEnd))

  const chartData = rows.map((r) => ({
    name: view === 'quarter' ? r.label : r.label.replace(/\s*25\d\d$/, ''),
    value: r.value ?? 0,
    status: r.status ?? 'no_data',
  }))
  const showChart = !isText && rows.some((r) => r.value !== null)
  const viewLabel = view === 'quarter' ? 'รายไตรมาส' : 'รายเดือน'

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2 className="font-semibold text-gray-800 text-sm">สรุปผลงาน{viewLabel} — ปีงบ {fiscalYear}</h2>
        <div className="inline-flex rounded-lg border overflow-hidden text-sm">
          <button onClick={() => setView('quarter')}
            className={`px-3 py-1.5 ${view === 'quarter' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            รายไตรมาส
          </button>
          <button onClick={() => setView('month')}
            className={`px-3 py-1.5 border-l ${view === 'month' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            รายเดือน
          </button>
        </div>
      </div>

      {showChart && (
        <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: view === 'quarter' ? 12 : 10 }}
                interval={0} angle={view === 'quarter' ? 0 : -35} textAnchor={view === 'quarter' ? 'middle' : 'end'}
                height={view === 'quarter' ? 30 : 56} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => [`${v} ${unit}`]} />
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

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium">{view === 'quarter' ? 'ไตรมาส' : 'เดือน'}</th>
                <th className="text-left px-4 py-2 font-medium">{view === 'quarter' ? 'ช่วงเวลา' : ''}</th>
                {!isText && <th className="text-right px-4 py-2 font-medium">เป้าหมาย</th>}
                <th className="text-right px-4 py-2 font-medium">ผลงาน</th>
                <th className="text-center px-4 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.key} className={r.month === cur.month ? 'bg-blue-50' : ''}>
                  <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{r.label}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{r.sub}</td>
                  {!isText && (
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                      {target > 0 && direction !== 'none' ? target : '—'}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                    {r.value !== null ? r.value : (r.text || <span className="text-gray-300">—</span>)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {r.status ? (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[r.status]}`}>
                        {STATUS_META[r.status].label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">
                        {r.isFuture ? 'ยังไม่ถึงรอบ' : r.filled ? 'เชิงคุณภาพ' : 'ยังไม่กรอก'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2.5 border-t bg-gray-50 text-xs text-gray-500">
          ส่งเขตรอบ 1 ใช้ผลไตรมาส 2 · รอบ 2 ใช้ผลไตรมาส 4 · กรอกรายเดือนได้ ไม่บังคับ (ระบบเตือนเฉพาะเดือนปิดไตรมาส)
        </div>
      </div>
    </>
  )
}
