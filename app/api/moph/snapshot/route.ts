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
  if (!res.ok) throw new Error(`MOPH ตอบ ${res.status} (${tableName})`)
  const raw = await res.json()
  return (Array.isArray(raw) ? raw : Object.values(raw)) as Record<string, unknown>[]
}

/**
 * GET /api/moph/snapshot?reportId=&year=&province=  → ดูข้อมูลใน snapshot
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const reportId = searchParams.get('reportId') || ''
  const year     = searchParams.get('year') || '2569'
  const province = searchParams.get('province') || '66'

  const conn = await pool.getConnection()
  try {
    let rows
    if (reportId) {
      const [r] = await conn.execute(
        `SELECT s.*, c.name as report_name, c.moph_table
         FROM moph_snapshot s
         JOIN moph_report_catalog c ON c.id = s.report_id
         WHERE s.report_id = ? AND s.year = ? AND s.province = ?
         ORDER BY s.month DESC`,
        [reportId, year, province],
      )
      rows = r
    } else {
      const [r] = await conn.execute(
        `SELECT s.*, c.name as report_name, c.moph_table, c.category
         FROM moph_snapshot s
         JOIN moph_report_catalog c ON c.id = s.report_id
         WHERE s.year = ? AND s.province = ?
         ORDER BY c.category, c.name, s.month DESC`,
        [year, province],
      )
      rows = r
    }
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

/**
 * POST /api/moph/snapshot
 * Body: { year?, province?, month?, reportIds? }
 * ดึงข้อมูลจาก catalog (ใช้ hospcode + areacode จากแต่ละ catalog entry) แล้วเก็บใน moph_snapshot
 */
export async function POST(req: NextRequest) {
  const {
    year = '2569',
    province = '66',
    month,
    reportIds,
  }: { year?: string; province?: string; month?: string; reportIds?: string[] } = await req.json()

  const saveMonth =
    month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  const conn = await pool.getConnection()
  let catalog: {
    id: string; name: string; moph_table: string
    value_field: string; target_field: string; calc_mode: string
    hospcode: string; areacode: string; category: string
  }[] = []

  try {
    if (reportIds && reportIds.length > 0) {
      const ph = reportIds.map(() => '?').join(',')
      const [rows] = await conn.execute(
        `SELECT id, name, moph_table, value_field, target_field, calc_mode,
                hospcode, areacode, category
         FROM moph_report_catalog WHERE id IN (${ph}) AND active = 1`,
        reportIds,
      )
      catalog = rows as typeof catalog
    } else {
      const [rows] = await conn.execute(
        `SELECT id, name, moph_table, value_field, target_field, calc_mode,
                hospcode, areacode, category
         FROM moph_report_catalog WHERE active = 1 ORDER BY category, name`,
      )
      catalog = rows as typeof catalog
    }
  } finally {
    conn.release()
  }

  if (catalog.length === 0) {
    return NextResponse.json({ ok: false, message: 'ไม่มีรายการใน catalog' }, { status: 404 })
  }

  const results: {
    reportId: string; name: string; status: 'ok' | 'error'
    calcValue?: number; rows?: number; error?: string
  }[] = []

  for (const r of catalog) {
    try {
      let rows = await fetchMOPH(r.moph_table, year, province)

      // กรอง hospcode (ตรงกัน) และ areacode (ขึ้นต้นด้วย)
      if (r.hospcode) rows = rows.filter((row) => String(row.hospcode) === String(r.hospcode))
      if (r.areacode) rows = rows.filter((row) => String(row.areacode ?? '').startsWith(String(r.areacode)))

      if (rows.length === 0) {
        results.push({ reportId: r.id, name: r.name, status: 'error', error: 'ไม่พบข้อมูล' })
        continue
      }

      const vField    = r.value_field || 'result'
      const tField    = r.target_field || 'target'
      const sumValue  = rows.reduce((s, row) => s + (Number(row[vField]) || 0), 0)
      const sumTarget = rows.reduce((s, row) => s + (Number(row[tField]) || 0), 0)

      let calcValue: number
      if (r.calc_mode === 'sum') {
        calcValue = +sumValue.toFixed(2)
      } else {
        calcValue = sumTarget > 0 ? +((sumValue / sumTarget) * 100).toFixed(2) : 0
      }

      // เก็บ filter identifier ใน snapshot (areacode มีความสำคัญกว่า hospcode)
      const filterKey = r.areacode || r.hospcode || ''

      const c2 = await pool.getConnection()
      try {
        await c2.execute(
          `INSERT INTO moph_snapshot
             (report_id, year, month, province, hospcode, rows_count, sum_value, sum_target, calc_value)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             rows_count = VALUES(rows_count),
             sum_value  = VALUES(sum_value),
             sum_target = VALUES(sum_target),
             calc_value = VALUES(calc_value),
             fetched_at = CURRENT_TIMESTAMP`,
          [r.id, year, saveMonth, province, filterKey, rows.length,
           +sumValue.toFixed(2), +sumTarget.toFixed(2), calcValue],
        )
      } finally {
        c2.release()
      }

      results.push({ reportId: r.id, name: r.name, status: 'ok', calcValue, rows: rows.length })
    } catch (e) {
      results.push({ reportId: r.id, name: r.name, status: 'error', error: String(e) })
    }
  }

  return NextResponse.json({
    ok: true, savedMonth: saveMonth, year, province,
    total: catalog.length,
    saved:  results.filter((r) => r.status === 'ok').length,
    failed: results.filter((r) => r.status === 'error').length,
    results,
  })
}
