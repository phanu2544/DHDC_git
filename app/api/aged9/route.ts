import { NextRequest, NextResponse } from 'next/server'
import { groupByTambon, groupByHospcode } from '@/lib/areaRef'
import { getMonthlyRows } from '@/lib/monthlyView'

/**
 * GET /api/aged9?table=s_aged9&month=2026-06&areacode=6611
 * คัดกรองผู้สูงอายุ 9 ด้าน — group รายตำบล (แบบ HDC): คัดกรองครบ 9 ด้าน % + ราย 9 ด้าน (ปกติ/เสี่ยง)
 * แหล่งข้อมูลรายเดือน/สด จัดการโดย lib/monthlyView (snapshot → fallback live, DB ล่มไม่พัง)
 * field map (อ้างอิงลำดับคอลัมน์ HDC + anchor ด้าน 6 ซึมเศร้ามี _3):
 *   target=ผู้สูงอายุคัดกรอง · result=คัดกรองครบ 9 ด้าน
 *   result{N}=คัดกรองด้าน N · result{N}_1=ปกติ · result{N}_2=เสี่ยง (+_3 ด้าน 6)
 */
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

const DOMAINS = [
  { n: 1, name: 'การมองเห็น' },
  { n: 2, name: 'การกลั้นปัสสาวะ' },
  { n: 3, name: 'การได้ยิน' },
  { n: 4, name: 'กิจวัตรประจำวัน (ADL)' },
  { n: 5, name: 'ความคิดความจำ' },
  { n: 6, name: 'ภาวะซึมเศร้า (2Q)' },
  { n: 7, name: 'การเคลื่อนไหว' },
  { n: 8, name: 'สุขภาพช่องปาก' },
  { n: 9, name: 'ภาวะขาดสารอาหาร' },
]

function buildGroup(rows: Record<string, unknown>[], code: string, name: string) {
  const S = (f: string) => rows.reduce((s, r) => s + num(r[f]), 0)
  const total = S('target')
  const screened9 = S('result')
  const domains = DOMAINS.map((d) => {
    const screened = S(`result${d.n}`)
    const normal = S(`result${d.n}_1`)
    const risk = S(`result${d.n}_2`) + (d.n === 6 ? S(`result${d.n}_3`) : 0)
    return { n: d.n, name: d.name, screened, normal, risk, riskPct: screened > 0 ? +((risk / screened) * 100).toFixed(2) : null }
  })
  return { code, name, total, screened9, coverPct: total > 0 ? +((screened9 / total) * 100).toFixed(2) : null, domains }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const table = searchParams.get('table') || 's_aged9'
  const year = searchParams.get('year') || '2569'
  const province = searchParams.get('province') || '66'
  const areacode = searchParams.get('areacode') || '6611'
  const reqMonth = searchParams.get('month') || ''
  const view = searchParams.get('view') === 'unit' ? 'unit' : 'area'
  if (!['s_aged9', 's_aged9_app'].includes(table)) {
    return NextResponse.json({ ok: false, message: 'table ไม่รองรับ' }, { status: 400 })
  }

  try {
    const { rows, source, month, availableMonths } = await getMonthlyRows({ table, month: reqMonth, year, province, areacode })
    const group = view === 'unit' ? groupByHospcode : groupByTambon
    const { tambons, total } = group(rows, buildGroup)
    return NextResponse.json({
      ok: true, table, year, province, areacode, view,
      source, month, availableMonths,
      domainNames: DOMAINS.map((d) => ({ n: d.n, name: d.name })),
      tambons, total, rows: rows.length,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  }
}
