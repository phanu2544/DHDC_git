import pool from '@/lib/db'

/**
 * Phase 8 — แหล่งข้อมูลรายเดือนกลางสำหรับกราฟ detail
 *
 * เลือกแหล่งให้อัตโนมัติ:
 *   - month=YYYY-MM ที่มี snapshot → อ่านจาก moph_monthly_detail (ค่าประวัติเดือนนั้น)
 *   - ไม่ระบุ month → เดือน snapshot ล่าสุด
 *   - month=live / ไม่มี snapshot / DB ล่ม → ดึงสดจาก MOPH (ไม่พังถ้า DB มีปัญหา)
 *
 * สำคัญ: ความผิดพลาดฝั่ง DB ทั้งหมด degrade ไป live เสมอ — หน้า detail
 * เป็นเรื่องของข้อมูลสด MOPH เป็นหลัก ไม่ควรพังเพราะ DB
 */
const MOPH_API = 'https://opendata.moph.go.th/api/report_data'

export interface MonthlyRowsResult {
  rows: Record<string, unknown>[]
  source: 'snapshot' | 'live'
  month: string | null
  availableMonths: string[]
}

export interface MonthlyViewOpts {
  table: string
  /** '' = เดือนล่าสุด · 'live' = บังคับสด · 'YYYY-MM' = เดือนที่ระบุ */
  month?: string
  year?: string
  province?: string
  areacode?: string
  /** ระบุ kpiId ตรงๆ ได้ (ไม่งั้น resolve จาก moph_table — LIMIT 1) */
  kpiId?: string
}

async function fetchLive(table: string, year: string, province: string, areacode: string) {
  const res = await fetch(MOPH_API, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableName: table, year, province, type: 'json' }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`MOPH ตอบ ${res.status}`)
  const raw = await res.json()
  return (Array.isArray(raw) ? raw : Object.values(raw))
    .filter((r: Record<string, unknown>) => String(r.areacode ?? '').startsWith(areacode)) as Record<string, unknown>[]
}

/** resolve kpiId + เดือนที่มี snapshot — ล้มเหลว (DB ล่ม) → คืนค่าว่าง ไม่ throw */
async function resolveKpiAndMonths(table: string, kpiId?: string): Promise<{ kpiId: string; months: string[] }> {
  try {
    const conn = await pool.getConnection()
    try {
      let id = kpiId ?? ''
      if (!id) {
        const [kr] = await conn.execute('SELECT id FROM kpi_reports WHERE moph_table=? LIMIT 1', [table])
        id = ((kr as { id: string }[])[0]?.id) ?? ''
      }
      if (!id) return { kpiId: '', months: [] }
      const [ms] = await conn.execute(
        'SELECT DISTINCT month FROM moph_monthly_detail WHERE kpi_id=? ORDER BY month DESC', [id])
      return { kpiId: id, months: (ms as { month: string }[]).map((m) => m.month) }
    } finally {
      conn.release()
    }
  } catch {
    return { kpiId: '', months: [] }
  }
}

/** อ่านแถวจาก snapshot — ล้มเหลว → คืน null (ให้ caller ตกไป live) */
async function readSnapshot(kpiId: string, month: string, areacode: string): Promise<Record<string, unknown>[] | null> {
  try {
    const conn = await pool.getConnection()
    try {
      const [rows] = await conn.execute(
        'SELECT areacode, data FROM moph_monthly_detail WHERE kpi_id=? AND month=?', [kpiId, month])
      const list = rows as { areacode: string; data: unknown }[]
      if (list.length === 0) return null
      const out = list
        .map((r) => {
          const data = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data as Record<string, unknown>)
          return { areacode: r.areacode, ...data }
        })
        .filter((r) => String(r.areacode ?? '').startsWith(areacode))
      // hardening: ถ้าทุกแถวมีแต่ areacode (data ว่าง {} เช่นตารางที่ยังไม่อุด) → ถือว่าไม่มี snapshot
      if (out.every((r) => Object.keys(r).length <= 1)) return null
      return out
    } finally {
      conn.release()
    }
  } catch {
    return null
  }
}

export async function getMonthlyRows(opts: MonthlyViewOpts): Promise<MonthlyRowsResult> {
  const { table, month = '', year = '2569', province = '66', areacode = '6611', kpiId } = opts
  const { kpiId: resolvedId, months } = await resolveKpiAndMonths(table, kpiId)

  let rows: Record<string, unknown>[] | null = null
  let source: 'snapshot' | 'live' = 'live'
  let usedMonth: string | null = null

  if (month && month !== 'live' && resolvedId && months.includes(month)) {
    rows = await readSnapshot(resolvedId, month, areacode)
    if (rows && rows.length > 0) { source = 'snapshot'; usedMonth = month }
  } else if (!month && resolvedId && months.length > 0) {
    rows = await readSnapshot(resolvedId, months[0], areacode)
    if (rows && rows.length > 0) { source = 'snapshot'; usedMonth = months[0] }
  }

  // DB ว่าง/ล่ม/บังคับ live → ดึงสด (อันนี้ throw ได้จริงถ้า MOPH ล่ม = error จริง)
  if (!rows || rows.length === 0) {
    rows = await fetchLive(table, year, province, areacode)
    source = 'live'; usedMonth = null
  }

  return { rows, source, month: usedMonth, availableMonths: months }
}
