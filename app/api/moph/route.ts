import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

const MOPH_API = 'https://opendata.moph.go.th/api/report_data'

async function fetchMOPH(tableName: string, year: string, province: string) {
  const res = await fetch(MOPH_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableName, year, province, type: 'json' }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`MOPH ตอบ ${res.status}`)
  const raw = await res.json()
  return (Array.isArray(raw) ? raw : Object.values(raw)) as Record<string, unknown>[]
}

/** กรองแถวตาม hospcode และ/หรือ areacode prefix */
function applyFilters(
  rows: Record<string, unknown>[],
  hospcode: string,
  areacode: string,
): Record<string, unknown>[] {
  let out = rows
  if (hospcode) out = out.filter((r) => String(r.hospcode) === String(hospcode))
  if (areacode) out = out.filter((r) => String(r.areacode ?? '').startsWith(String(areacode)))
  return out
}

// POST /api/moph  → ดึงข้อมูล + บันทึกลง DB
export async function POST(req: NextRequest) {
  const {
    kpiId, tableName, year, province,
    hospcode = '', areacode = '',
    valueField, targetField, calcMode, month,
  } = await req.json()

  if (!tableName || !year || !province) {
    return NextResponse.json({ message: 'กรุณาระบุ tableName, year, province' }, { status: 400 })
  }

  let rows = await fetchMOPH(tableName, year, province).catch((e) => {
    throw new Error('เชื่อมต่อ MOPH ไม่ได้: ' + e.message)
  })

  rows = applyFilters(rows, hospcode, areacode)

  if (rows.length === 0) {
    const filterDesc = [hospcode && `hospcode ${hospcode}`, areacode && `areacode ${areacode}*`].filter(Boolean).join(', ')
    return NextResponse.json({ message: `ไม่พบข้อมูล${filterDesc ? ` (${filterDesc})` : ''}`, rows: 0 }, { status: 404 })
  }

  const vField = valueField || 'result'
  const tField = targetField || 'target'
  const sumValue  = rows.reduce((s, r) => s + (Number(r[vField]) || 0), 0)
  const sumTarget = rows.reduce((s, r) => s + (Number(r[tField]) || 0), 0)

  let calcValue: number
  if (calcMode === 'sum') {
    calcValue = +sumValue.toFixed(2)
  } else {
    calcValue = sumTarget > 0 ? +((sumValue / sumTarget) * 100).toFixed(2) : 0
  }

  const saveMonth = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  if (kpiId) {
    const conn = await pool.getConnection()
    try {
      const [kpiRows] = await conn.execute('SELECT target FROM kpi_reports WHERE id = ?', [kpiId])
      const kpiTarget = (kpiRows as { target: number }[])[0]?.target ?? sumTarget
      await conn.execute(
        `INSERT INTO monthly_data (kpi_id, month, value, target)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value), target = VALUES(target)`,
        [kpiId, saveMonth, calcValue, kpiTarget],
      )
    } finally {
      conn.release()
    }
  }

  return NextResponse.json({
    ok: true, tableName, year, province,
    hospcode: hospcode || null,
    areacode: areacode || null,
    rows: rows.length,
    sumValue: +sumValue.toFixed(2),
    sumTarget: +sumTarget.toFixed(2),
    calcValue,
    calcMode: calcMode || 'percent',
    savedMonth: kpiId ? saveMonth : null,
    sampleFields: rows[0] ? Object.keys(rows[0]) : [],
    sample: rows.slice(0, 3),
  })
}

// GET /api/moph?tableName=&year=&province=&hospcode=&areacode=&limit=  → preview
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tableName = searchParams.get('tableName')
  const year      = searchParams.get('year') || '2569'
  const province  = searchParams.get('province') || '66'
  const hospcode  = searchParams.get('hospcode') || ''
  const areacode  = searchParams.get('areacode') || ''
  // limit=0 = คืนทุก row, limit=N = คืน N rows แรก (default 3 ถ้าไม่มี filter, all ถ้ามี filter)
  const limitParam = searchParams.get('limit')
  const hasFilter  = !!(hospcode || areacode)

  if (!tableName) return NextResponse.json({ ok: false, message: 'ต้องระบุ tableName' }, { status: 400 })

  let rows: Record<string, unknown>[]
  try {
    rows = await fetchMOPH(tableName, year, province)
  } catch (e) {
    return NextResponse.json({ ok: false, message: String(e) }, { status: 502 })
  }

  rows = applyFilters(rows, hospcode, areacode)

  // ถ้ามี filter → คืนทุก row (ผ่าน filter แล้ว จำนวนน้อยแน่นอน)
  // ถ้าไม่มี filter → คืน 5 rows แรก (ป้องกัน payload ใหญ่เกิน)
  let limit: number
  if (limitParam !== null) {
    limit = parseInt(limitParam) || 0
  } else {
    limit = hasFilter ? 0 : 5
  }

  const sample = limit > 0 ? rows.slice(0, limit) : rows

  return NextResponse.json({
    ok: true, tableName, year, province,
    hospcode: hospcode || null,
    areacode: areacode || null,
    rows: rows.length,
    fields: rows[0] ? Object.keys(rows[0]) : [],
    sample,
  })
}
