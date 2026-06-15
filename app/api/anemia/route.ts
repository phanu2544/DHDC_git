import { NextRequest, NextResponse } from 'next/server'
import { tambonCodeOf, tambonNameOf } from '@/lib/areaRef'

/**
 * GET /api/anemia?table=s_child_hct&year=2569&province=66&areacode=6611
 * ภาวะโลหิตจางในเด็กอายุครบ 12 เดือน — group รายตำบล (โครงสร้างหัวคอลัมน์แบบ HDC)
 * field (ยืนยันกับ HDC: result/target = ความชุก 33.33%):
 *   total=จำนวนเด็กอายุครบ 12 เดือน [C]
 *   target=ตรวจทั้งหมด [B1]  · result=พบโลหิตจาง (ทั้งหมด) [A1]
 *   target1=ตรวจ (ไม่พบรหัส ICD10 ตาม TP) [B] · result1=พบโลหิตจาง (TP) [A]
 *   coverage = B1/C · ความชุก(ทั้งหมด) = A1/B1 · ความชุก(TP) = A/B
 */
const MOPH_API = 'https://opendata.moph.go.th/api/report_data'
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const pct = (a: number, b: number) => (b > 0 ? +((a / b) * 100).toFixed(2) : null)

function buildGroup(rows: Record<string, unknown>[], code: string, name: string) {
  const S = (f: string) => rows.reduce((s, r) => s + num(r[f]), 0)
  const total = S('total')        // C
  const screened = S('target')    // B1 ตรวจทั้งหมด
  const found = S('result')       // A1 พบ (ทั้งหมด)
  const screenedTp = S('target1') // B  ตรวจ (TP)
  const foundTp = S('result1')    // A  พบ (TP)
  return {
    code, name, total, screened, found, screenedTp, foundTp,
    coveragePct: pct(screened, total),       // ร้อยละการตรวจ
    prevalencePct: pct(found, screened),      // ร้อยละโลหิตจาง (ทั้งหมด)
    prevalenceTpPct: pct(foundTp, screenedTp),// ร้อยละโลหิตจาง (TP)
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const table = searchParams.get('table') || 's_child_hct'
  const year = searchParams.get('year') || '2569'
  const province = searchParams.get('province') || '66'
  const areacode = searchParams.get('areacode') || '6611'
  if (table !== 's_child_hct') {
    return NextResponse.json({ ok: false, message: 'table ไม่รองรับ' }, { status: 400 })
  }

  try {
    const res = await fetch(MOPH_API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableName: table, year, province, type: 'json' }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`MOPH ตอบ ${res.status}`)
    const raw = await res.json()
    const rows = (Array.isArray(raw) ? raw : Object.values(raw))
      .filter((r: Record<string, unknown>) => String(r.areacode ?? '').startsWith(areacode)) as Record<string, unknown>[]

    const groups = new Map<string, Record<string, unknown>[]>()
    for (const r of rows) {
      const t = tambonCodeOf(String(r.areacode))
      if (!groups.has(t)) groups.set(t, [])
      groups.get(t)!.push(r)
    }
    const tambons = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, rs]) => buildGroup(rs, code, tambonNameOf(code)))
    const total = buildGroup(rows, 'all', 'รวมอำเภอ')

    return NextResponse.json({ ok: true, table, year, province, areacode, tambons, total, rows: rows.length })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  }
}
