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

export interface BatchOptions {
  year?: string
  province?: string
  hospcode?: string
  areacode?: string
  /** เดือนที่บันทึก (YYYY-MM) ค่าว่าง = เดือนปัจจุบัน */
  month?: string
}

export interface BatchItemResult {
  kpiId: string
  kpiName: string
  status: 'ok' | 'error'
  calcValue?: number
  rows?: number
  error?: string
}

export interface BatchResult {
  ok: boolean
  message?: string
  savedMonth: string
  year: string
  province: string
  areacode: string | null
  hospcode: string | null
  total: number
  saved: number
  failed: number
  results: BatchItemResult[]
}

/**
 * ดึงข้อมูล MOPH ของทุก KPI ที่ตั้งค่า moph_table ไว้ แล้ว upsert ลง monthly_data
 * ใช้ร่วมกันระหว่าง API route (/api/moph/batch) และ cron อัตโนมัติ
 */
export async function runBatchSave(opts: BatchOptions = {}): Promise<BatchResult> {
  const { year = '2569', province = '66', hospcode = '', areacode = '', month } = opts

  const saveMonth =
    month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  const conn = await pool.getConnection()
  let kpis: {
    id: string; name: string
    moph_table: string; moph_value_field: string
    moph_target_field: string; moph_calc_mode: string; target: number
  }[] = []
  try {
    const [rows] = await conn.execute(
      `SELECT id, name, moph_table, moph_value_field, moph_target_field, moph_calc_mode, target
       FROM kpi_reports
       WHERE moph_table IS NOT NULL AND moph_table <> ''
       ORDER BY id`,
    )
    kpis = rows as typeof kpis
  } finally {
    conn.release()
  }

  if (kpis.length === 0) {
    return {
      ok: false, message: 'ไม่มี KPI ที่ตั้งค่า MOPH Table ไว้',
      savedMonth: saveMonth, year, province,
      areacode: areacode || null, hospcode: hospcode || null,
      total: 0, saved: 0, failed: 0, results: [],
    }
  }

  const results: BatchItemResult[] = []

  for (const kpi of kpis) {
    try {
      let rows = await fetchMOPH(kpi.moph_table, year, province)

      if (hospcode) rows = rows.filter((r) => String(r.hospcode) === String(hospcode))
      if (areacode) rows = rows.filter((r) => String(r.areacode ?? '').startsWith(String(areacode)))

      if (rows.length === 0) {
        results.push({ kpiId: kpi.id, kpiName: kpi.name, status: 'error', error: 'ไม่พบข้อมูล' })
        continue
      }

      const vField    = kpi.moph_value_field || 'result'
      const tField    = kpi.moph_target_field || 'target'
      const sumValue  = rows.reduce((s, r) => s + (Number(r[vField]) || 0), 0)
      const sumTarget = rows.reduce((s, r) => s + (Number(r[tField]) || 0), 0)

      let calcValue: number
      if (kpi.moph_calc_mode === 'sum') {
        calcValue = +sumValue.toFixed(2)
      } else {
        calcValue = sumTarget > 0 ? +((sumValue / sumTarget) * 100).toFixed(2) : 0
      }

      const kpiTarget = kpi.target ?? sumTarget
      const c2 = await pool.getConnection()
      try {
        await c2.execute(
          `INSERT INTO monthly_data (kpi_id, month, value, target)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value), target = VALUES(target)`,
          [kpi.id, saveMonth, calcValue, kpiTarget],
        )
      } finally {
        c2.release()
      }

      results.push({ kpiId: kpi.id, kpiName: kpi.name, status: 'ok', calcValue, rows: rows.length })
    } catch (e) {
      results.push({ kpiId: kpi.id, kpiName: kpi.name, status: 'error', error: String(e) })
    }
  }

  return {
    ok: true,
    savedMonth: saveMonth, year, province,
    areacode: areacode || null, hospcode: hospcode || null,
    total: kpis.length,
    saved:  results.filter((r) => r.status === 'ok').length,
    failed: results.filter((r) => r.status === 'error').length,
    results,
  }
}

/** ปีงบประมาณ พ.ศ. ปัจจุบัน (เริ่ม 1 ต.ค.) เช่น พ.ค. 2026 → 2569, พ.ย. 2025 → 2569 */
export function currentMophFiscalYear(now: Date = new Date()): string {
  const greg = now.getFullYear()
  const month = now.getMonth() + 1
  const buddhist = greg + 543
  return String(month >= 10 ? buddhist + 1 : buddhist)
}
