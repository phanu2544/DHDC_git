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
 *  - s_ttm35      : #45 ปชช.ปฐมภูมิรักษาด้วยแพทย์แผนไทย — A/B (tm_service_qN/op_service_qN) อยู่รายไตรมาสล้วน
 *                   ไม่มี field ยอดรวมแยกต่างหาก ถ้าตัด q1-q4 จะเหลือแค่ flag_sent/ip คิด % ไม่ได้เลย
 */
const KEEP_MONTHLY_TABLES = new Set(['s_epi2', 's_kpi_ageing', 's_colon_screen_w', 's_kpi_sepsis_septic', 's_ttm35'])

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

/**
 * เก็บ audit ก่อน "ดึงอัตโนมัติ" ทับค่าที่ **คนกรอกมือ** ไว้ (source='manual')
 *
 * ทำไมต้องมี: เส้นกรอกมือ (`/api/monthly/single`, `/detail`) เขียน `data_change_log` ก่อนทับเสมอ
 * แต่เส้น auto (`/api/moph`, `lib/mophBatch`) เดิม**ไม่เขียนเลย** → เคสจริงที่เจอได้คือ
 * MOPH API ล่ม → เจ้าหน้าที่ติ๊ก "กรอกค่าเอง" แล้วคีย์มือ → พอ API กลับมาแล้วปลดติ๊ก/กดดึงซ้ำ
 * ค่าที่คนพิมพ์หายถาวรโดยไม่มีร่องรอย
 *
 * - log **เฉพาะ** เมื่อค่าเดิมเป็น manual (auto ทับ auto = ข้อมูลชุดเดียวกัน ไม่ต้องเก็บ)
 * - เก็บทั้ง monthly_data และ moph_monthly_detail (รูปแบบเดียวกับเส้น manual → กู้คืนวิธีเดียวกัน)
 * - **ต้องเรียกก่อน `saveMonthlyDetail`** เพราะฟังก์ชันนั้น DELETE detail เดิมทิ้งก่อน insert
 * - additive: พังแล้วห้ามกระทบการบันทึกหลัก (คืน false เงียบๆ เหมือน saveMonthlyDetail)
 */
export async function logAutoOverwriteIfManual(kpiId: string, month: string): Promise<boolean> {
  const conn = await pool.getConnection()
  try {
    const [mRows] = await conn.execute(
      'SELECT value, target, value_text, source, raw_target, raw_result FROM monthly_data WHERE kpi_id=? AND month=?',
      [kpiId, month],
    )
    const prev = (mRows as { source: string | null }[])[0]
    if (!prev || prev.source !== 'manual') return false

    const [dRows] = await conn.execute(
      'SELECT hospcode, data FROM moph_monthly_detail WHERE kpi_id=? AND month=?', [kpiId, month],
    )
    await conn.execute(
      `INSERT INTO data_change_log (kpi_id, month, action, old_data, changed_by)
       VALUES (?, ?, 'overwrite', ?, ?)`,
      [kpiId, month, JSON.stringify({ monthly: prev, detail: dRows }), 'ระบบ (ดึงอัตโนมัติจาก MOPH)'],
    )
    return true
  } catch {
    return false // audit พลาด ห้ามบล็อกการดึงข้อมูลหลัก
  } finally {
    conn.release()
  }
}

/**
 * upsert detail 1 แถวต่อ (kpi_id, month, hospcode, areacode) — เดือนเดียวกันทับค่าเดิม
 *
 * ⚠️ KPI บางตัว (เช่น s_childdev_specialpp) MOPH คืน **หลายแถวต่อพื้นที่** (1 แถว/เดือน) →
 * ต้อง **รวม (sum) field ตัวเลขของแถว key ซ้ำก่อนเก็บ** เพื่อให้ detail = ผลรวมที่ computeMoph ใช้
 * (engine sum ทุกแถว) → drilldown รวม = Scorecard เสมอ · field ที่ไม่ใช่ตัวเลขใช้ค่าแถวหลังสุด
 * · KPI ปกติ (1 แถว/พื้นที่) = no-op
 */
export async function saveMonthlyDetail(
  kpiId: string,
  month: string,
  rows: Record<string, unknown>[],
  tableName = '',
): Promise<DetailSaveResult> {
  if (rows.length === 0) return { saved: 0 }

  // รวมแถวที่ (hospcode, areacode) ซ้ำกัน — sum field ตัวเลข, non-numeric เก็บค่าแถวหลังสุด
  const groups = new Map<string, { hospcode: string; areacode: string; data: Record<string, unknown> }>()
  for (const r of rows) {
    const data = filterSummaryFields(r, tableName)
    if (Object.keys(data).length === 0) continue
    const hospcode = String(r.hospcode ?? '')
    const areacode = String(r.areacode ?? '')
    const key = `${hospcode}|${areacode}`
    let g = groups.get(key)
    if (!g) { g = { hospcode, areacode, data: {} }; groups.set(key, g) }
    for (const [k, v] of Object.entries(data)) {
      const nv = Number(v)
      if (Number.isFinite(nv)) {
        const pv = Number(g.data[k])
        g.data[k] = (Number.isFinite(pv) ? pv : 0) + nv
      } else {
        g.data[k] = v
      }
    }
  }
  if (groups.size === 0) return { saved: 0 }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    // ล้าง snapshot เดิมของ (kpi, month) ทั้งหมดก่อน insert ใหม่ — กัน orphan row จาก batch ก่อน
    // (พื้นที่ที่ MOPH เลิกคืน/เปลี่ยน key จะค้างถ้าใช้ upsert อย่างเดียว → detail รวม ≠ Scorecard)
    await conn.execute('DELETE FROM moph_monthly_detail WHERE kpi_id=? AND month=?', [kpiId, month])
    let saved = 0
    for (const g of groups.values()) {
      await conn.execute(
        `INSERT INTO moph_monthly_detail (kpi_id, month, hospcode, areacode, data)
         VALUES (?, ?, ?, ?, ?)`,
        [kpiId, month, g.hospcode, g.areacode, JSON.stringify(g.data)],
      )
      saved++
    }
    await conn.commit()
    return { saved }
  } catch (e) {
    try { await conn.rollback() } catch { /* rollback best-effort */ }
    return { saved: 0, error: String(e) }
  } finally {
    conn.release()
  }
}
