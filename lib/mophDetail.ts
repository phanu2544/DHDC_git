import pool from '@/lib/db'

/**
 * Phase 4.8 — Monthly Detail Snapshot
 * เก็บแถวดิบราย hospcode/areacode จาก MOPH ลง moph_monthly_detail (JSON)
 * เฉพาะ field "ยอดรวม" — ตัดคอลัมน์ไตรมาส/รายเดือน/เวลา ออกตามนโยบาย
 *
 * additive อย่างเดียว: ถ้าเก็บ detail พลาด ห้ามกระทบการบันทึก monthly_data หลัก
 * (คืน error เป็น string ให้ caller แนบ warning — ไม่ throw)
 */

// field ระบุตัวแถว/เวลา — ไม่ใช่ค่ายอดรวม
const META_FIELDS = new Set(['id', 'hospcode', 'areacode', 'date_com', 'b_year', 'yymm', 'date_fz'])
// ไตรมาส: resultq1, targetq2, fitposq3, t_q1 ...
const QUARTER_RE = /q[1-4]/i
// รายเดือน: ลงท้ายเลขเดือน 2 หลัก 01-12 เช่น target10, result09, dtp4_05
// (เลขหลักเดียว/เลขช่วงอายุ เช่น result1, target_9, result_18, 1b262 ไม่โดนตัด)
const MONTH_SUFFIX_RE = /(0[1-9]|1[0-2])$/

/**
 * ตารางที่ "ค่าจริง" อยู่ในคอลัมน์รายเดือน/ไตรมาส — ห้ามตัด เก็บทุก field (ยกเว้น meta)
 *  - s_epi2       : ค่าจริงอยู่รายเดือน (dtp4_10, target09)
 *  - s_kpi_ageing : ค่าจริงอยู่รายไตรมาส (targetq1, result1q1 = คัดกรอง/ติดสังคม รอบ1-2)
 *                   ถ้าตัด q1-q4 จะเหลือแค่ target (จำนวนผู้สูงอายุ) คิด % ไม่ได้
 */
const KEEP_MONTHLY_TABLES = new Set(['s_epi2', 's_kpi_ageing', 's_colon_screen_w'])

export function isSummaryField(name: string): boolean {
  if (META_FIELDS.has(name.toLowerCase())) return false
  if (QUARTER_RE.test(name)) return false
  if (MONTH_SUFFIX_RE.test(name)) return false
  return true
}

/**
 * กรองเหลือเฉพาะ field ยอดรวม — คืน {} ถ้าตารางนั้นมีแต่คอลัมน์ไตรมาส/รายเดือน
 * tableName ที่อยู่ใน KEEP_MONTHLY_TABLES → เก็บทุก field (ยกเว้น meta) เพราะค่าจริงอยู่รายเดือน
 */
export function filterSummaryFields(row: Record<string, unknown>, tableName = ''): Record<string, unknown> {
  const keepMonthly = KEEP_MONTHLY_TABLES.has(tableName)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (META_FIELDS.has(k.toLowerCase())) continue
    if (!keepMonthly && (QUARTER_RE.test(k) || MONTH_SUFFIX_RE.test(k))) continue
    out[k] = v
  }
  return out
}

export interface DetailSaveResult {
  saved: number
  error?: string
}

/** upsert detail รายแถว (kpi_id, month, hospcode, areacode) — เดือนเดียวกันทับค่าเดิม (snapshot ล่าสุดของเดือน) */
export async function saveMonthlyDetail(
  kpiId: string,
  month: string,
  rows: Record<string, unknown>[],
  tableName = '',
): Promise<DetailSaveResult> {
  if (rows.length === 0) return { saved: 0 }
  const conn = await pool.getConnection()
  try {
    let saved = 0
    for (const r of rows) {
      const data = filterSummaryFields(r, tableName)
      if (Object.keys(data).length === 0) continue
      await conn.execute(
        `INSERT INTO moph_monthly_detail (kpi_id, month, hospcode, areacode, data)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE data = VALUES(data)`,
        [kpiId, month, String(r.hospcode ?? ''), String(r.areacode ?? ''), JSON.stringify(data)],
      )
      saved++
    }
    return { saved }
  } catch (e) {
    return { saved: 0, error: String(e) }
  } finally {
    conn.release()
  }
}
