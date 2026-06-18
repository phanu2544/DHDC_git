import { NextRequest, NextResponse } from 'next/server'
import { groupByTambon } from '@/lib/areaRef'
import { getMonthlyRows } from '@/lib/monthlyView'

/**
 * GET /api/anemia?table=s_child_hct&month=2026-06&areacode=6611
 * ภาวะโลหิตจางในเด็กอายุครบ 12 เดือน — group รายตำบล (โครงสร้างหัวคอลัมน์แบบ HDC)
 * แหล่งข้อมูลรายเดือน/สด จัดการโดย lib/monthlyView (snapshot → fallback live, DB ล่มไม่พัง)
 *
 * field (ยืนยันกับ HDC: result/target = ความชุก 33.33%):
 *   total=เด็กครบ 12 เดือน [C] · target=ตรวจทั้งหมด [B1] · result=พบ (ทั้งหมด) [A1]
 *   target1=ตรวจ (ไม่พบ ICD10 TP) [B] · result1=พบ (TP) [A]
 */
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
// ตัวหาร <= 0 → 0 (ตรง HDC: ตำบลที่ยังไม่ตรวจ เช่น ห้วยร่วม แสดง 0.00 ไม่เว้นว่าง)
const pct = (a: number, b: number) => (b > 0 ? +((a / b) * 100).toFixed(2) : 0)

function buildGroup(rows: Record<string, unknown>[], code: string, name: string) {
  const S = (f: string) => rows.reduce((s, r) => s + num(r[f]), 0)
  const total = S('total')        // C
  const screened = S('target')    // B1 ตรวจทั้งหมด
  const found = S('result')       // A1 พบ (ทั้งหมด)
  const screenedTp = S('target1') // B  ตรวจ (TP)
  const foundTp = S('result1')    // A  พบ (TP)
  return {
    code, name, total, screened, found, screenedTp, foundTp,
    coveragePct: pct(screened, total),
    prevalencePct: pct(found, screened),
    prevalenceTpPct: pct(foundTp, screenedTp),
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const table = searchParams.get('table') || 's_child_hct'
  const year = searchParams.get('year') || '2569'
  const province = searchParams.get('province') || '66'
  const areacode = searchParams.get('areacode') || '6611'
  const reqMonth = searchParams.get('month') || ''
  if (table !== 's_child_hct') {
    return NextResponse.json({ ok: false, message: 'table ไม่รองรับ' }, { status: 400 })
  }

  try {
    const { rows, source, month, availableMonths } = await getMonthlyRows({ table, month: reqMonth, year, province, areacode })
    const { tambons, total } = groupByTambon(rows, buildGroup)
    return NextResponse.json({
      ok: true, table, year, province, areacode,
      source, month, availableMonths,
      tambons, total, rows: rows.length,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  }
}
