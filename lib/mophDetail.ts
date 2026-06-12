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

export function isSummaryField(name: string): boolean {
  if (META_FIELDS.has(name.toLowerCase())) return false
  if (QUARTER_RE.test(name)) return false
  if (MONTH_SUFFIX_RE.test(name)) return false
  return true
}

/** กรองเหลือเฉพาะ field ยอดรวม — คืน {} ถ้าตารางนั้นมีแต่คอลัมน์ไตรมาส/รายเดือน (เช่น s_epi2) */
export function filterSummaryFields(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (isSummaryField(k)) out[k] = v
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
): Promise<DetailSaveResult> {
  if (rows.length === 0) return { saved: 0 }
  const conn = await pool.getConnection()
  try {
    let saved = 0
    for (const r of rows) {
      const data = filterSummaryFields(r)
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
