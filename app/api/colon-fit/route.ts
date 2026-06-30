import { NextRequest, NextResponse } from 'next/server'
import { groupByTambon, groupByHospcode } from '@/lib/areaRef'
import { getMonthlyRows } from '@/lib/monthlyView'

/**
 * GET /api/colon-fit?month=2026-06&view=area|unit
 * คัดกรองมะเร็งลำไส้ใหญ่ด้วย FIT test — group รายตำบล หรือ รายหน่วยบริการ
 * fields: fitposq1-q4 (ผลบวก) · fitnegq1-q4 (ผลลบ)
 * ค่าที่ส่งกลับ: pos (FIT+), neg (FIT−), total (=B), posPct, negPct
 */
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const pct = (a: number, b: number): number | null => (b > 0 ? +((a / b) * 100).toFixed(2) : null)

function buildGroup(rows: Record<string, unknown>[], code: string, name: string) {
  let pos = 0, neg = 0
  for (const r of rows) {
    pos += num(r.fitposq1) + num(r.fitposq2) + num(r.fitposq3) + num(r.fitposq4)
    neg += num(r.fitnegq1) + num(r.fitnegq2) + num(r.fitnegq3) + num(r.fitnegq4)
  }
  const total = pos + neg
  return { code, name, pos, neg, total, posPct: pct(pos, total), negPct: pct(neg, total) }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = searchParams.get('year') || '2569'
  const province = searchParams.get('province') || '66'
  const areacode = searchParams.get('areacode') || '6611'
  const reqMonth = searchParams.get('month') || ''
  const view = searchParams.get('view') === 'unit' ? 'unit' : 'area'

  try {
    const { rows, source, month, availableMonths } = await getMonthlyRows({
      table: 's_colon_screen_w', month: reqMonth, year, province, areacode,
    })
    const group = view === 'unit' ? groupByHospcode : groupByTambon
    const { tambons, total } = group(rows, buildGroup)
    return NextResponse.json({
      ok: true, year, province, areacode, view,
      source, month, availableMonths,
      tambons, total, rows: rows.length,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  }
}
