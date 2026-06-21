import { NextRequest, NextResponse } from 'next/server'
import { groupByTambon } from '@/lib/areaRef'
import { getMonthlyRows } from '@/lib/monthlyView'

/**
 * GET /api/ageing?month=2026-06&areacode=6611
 * Healthy Ageing (s_kpi_ageing) — group รายตำบลแบบ HDC: แยก 2 รอบประเมิน (ไตรมาส 1-2 / 3-4)
 * แต่ละรอบ: คัดกรอง(B) · ติดสังคม(A,ADL12-20) · ติดบ้าน(ADL5-11) · ติดเตียง(ADL0-4) · ร้อยละ=A/B
 * ⚠️ ห้ามรวม 2 รอบ (คนเดียวอาจถูกประเมินทั้งคู่) — แสดงแยกตามนิยาม HDC
 * field map ยืนยันตรง HDC: targetq{n}=คัดกรอง · result1q{n}=ติดสังคม · result2q{n}=ติดบ้าน · result3q{n}=ติดเตียง · target=ผู้สูงอายุ
 */
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const pct = (a: number, b: number) => (b > 0 ? +((a / b) * 100).toFixed(2) : null)

function buildRound(rows: Record<string, unknown>[], q: 1 | 2) {
  const S = (f: string) => rows.reduce((s, r) => s + num(r[f]), 0)
  const screen = S(`targetq${q}`)
  const social = S(`result1q${q}`)
  const home = S(`result2q${q}`)
  const bed = S(`result3q${q}`)
  return { screen, social, home, bed, pct: pct(social, screen) }
}

function buildGroup(rows: Record<string, unknown>[], code: string, name: string) {
  const elderly = rows.reduce((s, r) => s + num(r.target), 0)
  return { code, name, elderly, r1: buildRound(rows, 1), r2: buildRound(rows, 2) }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = searchParams.get('year') || '2569'
  const province = searchParams.get('province') || '66'
  const areacode = searchParams.get('areacode') || '6611'
  const reqMonth = searchParams.get('month') || ''

  try {
    const { rows, source, month, availableMonths } = await getMonthlyRows({
      table: 's_kpi_ageing', month: reqMonth, year, province, areacode,
    })
    const { tambons, total } = groupByTambon(rows, buildGroup)
    return NextResponse.json({
      ok: true, table: 's_kpi_ageing', year, province, areacode,
      source, month, availableMonths,
      tambons, total, rows: rows.length,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  }
}
