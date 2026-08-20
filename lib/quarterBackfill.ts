import pool from '@/lib/db'
import { computeMoph } from './mophEngine'
import { quartersOfFiscalYear } from './fiscalQuarter'
import { logAutoOverwriteIfManual } from './mophDetail'
import type { MophMapping } from './types'

/**
 * เขียนค่าลง "เดือนปิดไตรมาส" ให้ตารางที่ข้อมูลเป็นรายไตรมาสในตัว
 *
 * ปัญหาที่แก้: เส้น auto เขียน monthly_data ที่ "เดือนที่กดดึง" เท่านั้น → ถ้าไม่มีใครกด/cron ไม่ทำงาน
 * ในเดือน ธ.ค./มี.ค./มิ.ย./ก.ย. ช่องไตรมาสนั้นจะว่างถาวร ทั้งที่ MOPH มีข้อมูลครบอยู่แล้ว
 * (เครื่องที่ใช้งานจริง dev server + MariaDB หยุดเองบ่อย — ดู CLAUDE.md)
 *
 * หลักการเดียวกับ lib/fiscalQuarter.ts ที่ owner วางไว้ 30 ก.ค.:
 *   "ค่าไตรมาส = ค่า ณ เดือนปิดไตรมาส" = **ยอดสะสมปีงบถึงไตรมาสนั้น** (ไม่ใช่ค่าเฉพาะไตรมาสเดียว)
 * จึงคำนวณด้วย mapping ตัวเดิมแต่ตัด field เหลือ q1..qN แล้วส่งเข้า computeMoph ตัวเดียวกับเส้นหลัก
 * → เลขที่ได้ตรงกับที่ Scorecard ใช้เสมอ ไม่มีสูตรซ้อนสูตร
 *
 * idempotent: รันซ้ำกี่รอบก็เขียนทับด้วยค่าเดิม (ยกเว้นข้อมูล MOPH ขยับ ซึ่งก็ควรอัปเดตตาม)
 */

/**
 * ตารางที่เปิดใช้ — **opt-in เท่านั้น ห้าม auto-detect ล้วน**
 * เพราะการเปิดให้ตารางใหม่ = เขียนแถวย้อนหลังเข้า monthly_data ของ KPI นั้นทันที
 * ต้องให้ owner รับรองตัวเลขก่อนทีละตัว (กฎ CLAUDE.md — แก้ข้อมูลต้องมี gate + verify)
 *
 * ⏭️ ที่เข้าเกณฑ์แต่ยังไม่เปิด (รอ owner สั่ง): s_kpi_sepsis_septic (#6) · s_ttm35 (#45)
 */
export const QUARTER_BACKFILL_TABLES = new Set(['s_stroke_admit_death'])

/**
 * ตรวจว่า field 4 ตัวนี้คือชุดเดียวกันที่ต่างกันแค่ไตรมาส → คืนเรียงตาม q1..q4
 * คืน null ถ้าไม่เข้าแพทเทิร์น (กันจับผิดชุด เช่น s_colon_screen_w ที่มี fitpos+fitneg ปนกัน 8 ช่อง
 * หรือ s_kpi_ageing ที่ mapping มีไตรมาสเดียว)
 */
export function quarterOrder(fields: string[] | undefined): string[] | null {
  if (!fields || fields.length !== 4) return null
  const byQ = new Map<number, string>()
  for (const f of fields) {
    const m = f.match(/q([1-4])/i)
    if (!m) return null
    const q = Number(m[1])
    if (byQ.has(q)) return null           // ไตรมาสซ้ำ = คนละชุด
    byQ.set(q, f)
  }
  if (byQ.size !== 4) return null
  // ชื่อที่เหลือหลังแทนที่ qN ต้องเหมือนกันทุกตัว
  const stems = new Set([...byQ.values()].map((f) => f.replace(/q[1-4]/i, 'q#')))
  if (stems.size !== 1) return null
  return [1, 2, 3, 4].map((q) => byQ.get(q) as string)
}

export interface QuarterBackfillResult {
  written: { month: string; q: number; value: number }[]
  skipped: string[]
  error?: string
}

export async function backfillQuarterMonths(opts: {
  kpiId: string
  tableName: string
  mapping: MophMapping
  rows: Record<string, unknown>[]
  fiscalYear: string | number
  target: number
  now?: Date
}): Promise<QuarterBackfillResult> {
  const { kpiId, tableName, mapping, rows, fiscalYear, target, now = new Date() } = opts
  const out: QuarterBackfillResult = { written: [], skipped: [] }
  if (!QUARTER_BACKFILL_TABLES.has(tableName)) return out

  const vq = quarterOrder(mapping.valueFields)
  const tq = quarterOrder(mapping.targetFields)
  if (!vq || !tq || mapping.targetMode !== 'field' || mapping.calcMode !== 'percent') {
    out.error = 'mapping ไม่เข้าแพทเทิร์นไตรมาส (ต้องเป็น percent + value/target อย่างละ 4 field q1-q4)'
    return out
  }

  // เดือนปัจจุบัน — ไม่เขียนไตรมาสที่ยังมาไม่ถึง (เทียบสตริง YYYY-MM ได้ตรงๆ)
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const conn = await pool.getConnection()
  try {
    for (const qi of quartersOfFiscalYear(Number(fiscalYear))) {
      if (qi.month > thisMonth) { out.skipped.push(`${qi.month} (ยังไม่ถึงเดือนปิดไตรมาส)`); continue }

      // ยอดสะสมถึงไตรมาสนี้ = ตัด field เหลือ q1..qN แล้วใช้ engine ตัวเดียวกับเส้นหลัก
      const r = computeMoph(rows, { ...mapping, valueFields: vq.slice(0, qi.q), targetFields: tq.slice(0, qi.q) })
      if (r.errors.length > 0) { out.skipped.push(`${qi.month} (${r.errors[0]})`); continue }
      if (r.calcValue === null) { out.skipped.push(`${qi.month} (ยังไม่มีข้อมูลถึงไตรมาสนี้)`); continue }

      // ทับค่าที่คนกรอกมือไว้ → เก็บของเดิมลง data_change_log ก่อนเสมอ (เส้น auto ต้อง audit เท่าเส้น manual)
      await logAutoOverwriteIfManual(kpiId, qi.month)

      // source='auto' + ล้าง entered_by/at — ค่านี้เครื่องคำนวณ ไม่ใช่คนกรอกอีกต่อไป
      await conn.execute(
        `INSERT INTO monthly_data (kpi_id, month, value, target, source)
         VALUES (?, ?, ?, ?, 'auto')
         ON DUPLICATE KEY UPDATE value = VALUES(value), target = VALUES(target),
                                 source = 'auto', entered_by = NULL, entered_at = NULL`,
        [kpiId, qi.month, r.calcValue, target],
      )
      out.written.push({ month: qi.month, q: qi.q, value: r.calcValue })
    }
  } catch (e) {
    out.error = String(e)
  } finally {
    conn.release()
  }
  return out
}
