import { NextRequest, NextResponse } from 'next/server'
import { tambonCodeOf, tambonNameOf } from '@/lib/areaRef'

/**
 * GET /api/vaccines?year=2569&province=66&areacode=6611
 * ดึง s_epi2 สดจาก MOPH → group รายตำบล → คำนวณความครอบคลุม 5 วัคซีน (รายไตรมาส รวมทั้งปีงบ)
 * แบบเดียวกับรายงาน HDC "ความครอบคลุมวัคซีนแต่ละชนิด" — % = ผลรวมโดสรายเดือน ÷ ผลรวมเป้ารายเดือน
 */
const MOPH_API = 'https://opendata.moph.go.th/api/report_data'
const MONTHS = ['10', '11', '12', '01', '02', '03', '04', '05', '06', '07', '08', '09']
const VACCINES = [
  { key: 'dtp4', label: 'DTP4' },
  { key: 'opv4', label: 'Polio4' },
  { key: 'je2',  label: 'LAJE/JE' },
  { key: 'mmr1', label: 'MMR1 เก็บตก' },
  { key: 'mmr2', label: 'MMR2' },
]
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = searchParams.get('year') || '2569'
  const province = searchParams.get('province') || '66'
  const areacode = searchParams.get('areacode') || '6611'

  try {
    const res = await fetch(MOPH_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableName: 's_epi2', year, province, type: 'json' }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`MOPH ตอบ ${res.status}`)
    const raw = await res.json()
    const rows = (Array.isArray(raw) ? raw : Object.values(raw))
      .filter((r: Record<string, unknown>) => String(r.areacode ?? '').startsWith(areacode)) as Record<string, unknown>[]

    const sumMonths = (rs: Record<string, unknown>[], prefix: string) =>
      rs.reduce((s, r) => s + MONTHS.reduce((a, m) => a + num(r[`${prefix}_${m}`]), 0), 0)
    const sumTarget = (rs: Record<string, unknown>[]) =>
      rs.reduce((s, r) => s + MONTHS.reduce((a, m) => a + num(r[`target${m}`]), 0), 0)

    const build = (rs: Record<string, unknown>[], code: string, name: string) => {
      const B = sumTarget(rs)
      const vaccines: Record<string, { A: number; pct: number | null }> = {}
      for (const v of VACCINES) {
        const A = sumMonths(rs, v.key)
        vaccines[v.key] = { A, pct: B > 0 ? +((A / B) * 100).toFixed(2) : null }
      }
      return { code, name, B, vaccines }
    }

    const groups = new Map<string, Record<string, unknown>[]>()
    for (const r of rows) {
      const t = tambonCodeOf(String(r.areacode))
      if (!groups.has(t)) groups.set(t, [])
      groups.get(t)!.push(r)
    }
    const tambons = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, rs]) => build(rs, code, tambonNameOf(code)))
    const total = build(rows, 'all', 'รวม')

    return NextResponse.json({ ok: true, year, province, areacode, vaccines: VACCINES, tambons, total, rows: rows.length })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  }
}
