import { NextRequest, NextResponse } from 'next/server'
import { tambonCodeOf, tambonNameOf } from '@/lib/areaRef'

/**
 * GET /api/aged9?table=s_aged9&year=2569&province=66&areacode=6611
 * คัดกรองผู้สูงอายุ 9 ด้าน — group รายตำบล (แบบ HDC): คัดกรองครบ 9 ด้าน % + ราย 9 ด้าน (ปกติ/เสี่ยง)
 * field map (อ้างอิงลำดับคอลัมน์ HDC + anchor ด้าน 6 ซึมเศร้ามี _3):
 *   target=ผู้สูงอายุคัดกรอง · result=คัดกรองครบ 9 ด้าน
 *   result{N}=คัดกรองด้าน N · result{N}_1=ปกติ · result{N}_2=เสี่ยง (+_3 ด้าน 6)
 */
const MOPH_API = 'https://opendata.moph.go.th/api/report_data'
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
  if (!['s_aged9', 's_aged9_app'].includes(table)) {
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

    return NextResponse.json({
      ok: true, table, year, province, areacode,
      domainNames: DOMAINS.map((d) => ({ n: d.n, name: d.name })),
      tambons, total, rows: rows.length,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  }
}
