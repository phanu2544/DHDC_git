import { NextRequest, NextResponse } from 'next/server'
import { groupByTambon } from '@/lib/areaRef'
import { getMonthlyRows } from '@/lib/monthlyView'

/**
 * GET /api/screen-risk?disease=dm|ht&month=2026-06&areacode=6611
 * คัดกรองเบาหวาน/ความดัน ประชากร 35 ปีขึ้นไป — group รายตำบล (แบบ HDC)
 * แหล่งข้อมูลรายเดือน/สด จัดการโดย lib/monthlyView (snapshot → fallback live, DB ล่มไม่พัง)
 * field (ชื่อ field ตรงตัวจาก MOPH s_dm_screen_risk / s_ht_screen_risk):
 *   target=ประชากรเป้าหมาย · result=คัดกรองแล้ว
 *   normal=ปกติ · risk=เสี่ยง · high_risk=เสี่ยงสูง · ill=สงสัยป่วย
 */
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

const DISEASES: Record<string, { table: string; label: string }> = {
  dm: { table: 's_dm_screen_risk', label: 'เบาหวาน' },
  ht: { table: 's_ht_screen_risk', label: 'ความดันโลหิตสูง' },
}
const CATS = [
  { key: 'normal', label: 'ปกติ' },
  { key: 'risk', label: 'เสี่ยง' },
  { key: 'high_risk', label: 'เสี่ยงสูง' },
  { key: 'ill', label: 'สงสัยป่วย' },
]

function buildGroup(rows: Record<string, unknown>[], code: string, name: string) {
  const S = (f: string) => rows.reduce((s, r) => s + num(r[f]), 0)
  const target = S('target')
  const result = S('result')
  const cats: Record<string, { count: number; pct: number | null }> = {}
  for (const c of CATS) {
    const count = S(c.key)
    cats[c.key] = { count, pct: result > 0 ? +((count / result) * 100).toFixed(2) : null }
  }
  return { code, name, target, result, coverPct: target > 0 ? +((result / target) * 100).toFixed(2) : null, cats }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const disease = (searchParams.get('disease') || 'dm').toLowerCase()
  const year = searchParams.get('year') || '2569'
  const province = searchParams.get('province') || '66'
  const areacode = searchParams.get('areacode') || '6611'
  const reqMonth = searchParams.get('month') || ''
  const def = DISEASES[disease]
  if (!def) {
    return NextResponse.json({ ok: false, message: 'disease ไม่รองรับ (dm|ht)' }, { status: 400 })
  }

  try {
    const { rows, source, month, availableMonths } = await getMonthlyRows({ table: def.table, month: reqMonth, year, province, areacode })
    const { tambons, total } = groupByTambon(rows, buildGroup)
    return NextResponse.json({
      ok: true, disease, table: def.table, diseaseLabel: def.label, year, province, areacode,
      source, month, availableMonths,
      cats: CATS, tambons, total, rows: rows.length,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  }
}
