import { NextRequest, NextResponse } from 'next/server'
import { groupByTambon, groupByHospcode } from '@/lib/areaRef'
import { getMonthlyRows } from '@/lib/monthlyView'

/**
 * GET /api/vaccines?month=2026-06&year=2569&province=66&areacode=6611
 * s_epi2 → group รายตำบล → คำนวณความครอบคลุม 5 วัคซีน (รายไตรมาส รวมทั้งปีงบ)
 * แบบเดียวกับรายงาน HDC "ความครอบคลุมวัคซีนแต่ละชนิด" — % = ผลรวมโดสรายเดือน ÷ ผลรวมเป้ารายเดือน
 * แหล่งข้อมูลรายเดือน/สด จัดการโดย lib/monthlyView (snapshot → fallback live, DB ล่มไม่พัง)
 */
const MONTHS = ['10', '11', '12', '01', '02', '03', '04', '05', '06', '07', '08', '09']
const VACCINES = [
  { key: 'dtp4', label: 'DTP4' },
  { key: 'opv4', label: 'Polio4' },
  { key: 'je2',  label: 'LAJE/JE' },
  { key: 'mmr1', label: 'MMR1 เก็บตก' },
  { key: 'mmr2', label: 'MMR2' },
]
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

const sumMonths = (rs: Record<string, unknown>[], prefix: string) =>
  rs.reduce((s, r) => s + MONTHS.reduce((a, m) => a + num(r[`${prefix}_${m}`]), 0), 0)
const sumTarget = (rs: Record<string, unknown>[]) =>
  rs.reduce((s, r) => s + MONTHS.reduce((a, m) => a + num(r[`target${m}`]), 0), 0)

function build(rs: Record<string, unknown>[], code: string, name: string) {
  const B = sumTarget(rs)
  const vaccines: Record<string, { A: number; pct: number | null }> = {}
  for (const v of VACCINES) {
    const A = sumMonths(rs, v.key)
    vaccines[v.key] = { A, pct: B > 0 ? +((A / B) * 100).toFixed(2) : null }
  }
  return { code, name, B, vaccines }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = searchParams.get('year') || '2569'
  const province = searchParams.get('province') || '66'
  const areacode = searchParams.get('areacode') || '6611'
  const reqMonth = searchParams.get('month') || ''
  const view = searchParams.get('view') === 'unit' ? 'unit' : 'area'

  try {
    const { rows, source, month, availableMonths } = await getMonthlyRows({ table: 's_epi2', month: reqMonth, year, province, areacode })
    const group = view === 'unit' ? groupByHospcode : groupByTambon
    const { tambons, total } = group(rows, build)
    return NextResponse.json({
      ok: true, year, province, areacode, view,
      source, month, availableMonths,
      vaccines: VACCINES, tambons, total, rows: rows.length,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  }
}
