import pool from '@/lib/db'
import { buildMappingFromLegacy, computeMoph } from './mophEngine'
import { applyBaselineToMappingPooled, captureBaselineFromDetail } from './baselineYear'
import { fetchMophRows } from './mophFetch'
import { saveMonthlyDetail, logAutoOverwriteIfManual } from './mophDetail'
import { getTargetsForYear } from './targets'
import { isManualEntry } from './manualKpi'
import type { MophMapping } from './types'

export interface BatchOptions {
  year?: string
  province?: string
  hospcode?: string
  areacode?: string
  /** เดือนที่บันทึก (YYYY-MM) ค่าว่าง = เดือนปัจจุบัน */
  month?: string
  /** จำกัดเฉพาะ KPI เดียว (re-snapshot ตัวเดียวหลังแก้ config โดยไม่กระทบตัวอื่น) — ว่าง = ทุกตัว */
  kpiId?: string
  /** ที่มาของการรัน — 'cron' (อัตโนมัติ) | 'manual' (กดเอง) · บันทึกลง cron_log เฉพาะ full-batch */
  trigger?: string
}

export interface BatchItemResult {
  kpiId: string
  kpiName: string
  status: 'ok' | 'error' | 'skipped'
  calcValue?: number
  rows?: number
  error?: string
  warnings?: string[]
  /** เหตุผลที่ skipped (noTarget / ไม่มี kpi.target / sumTarget=0 ฯลฯ) */
  skipReason?: string
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
  skipped: number
  failed: number
  results: BatchItemResult[]
}

/** best-effort: log 1 แถวลง cron_log — ล้มเหลวไม่ throw (เช่น ตารางยังไม่ถูก migrate) */
async function logCronRun(
  trigger: string, saveMonth: string,
  s: { total: number; saved: number; skipped: number; failed: number },
) {
  try {
    const c = await pool.getConnection()
    try {
      await c.execute(
        `INSERT INTO cron_log (trigger_by, saved_month, total, saved, skipped, failed)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [trigger, saveMonth, s.total, s.saved, s.skipped, s.failed],
      )
    } finally { c.release() }
  } catch { /* logging ล้มเหลว ไม่กระทบ batch */ }
}

/**
 * ดึงข้อมูล MOPH ของทุก KPI ที่ตั้งค่า moph_table ไว้ แล้ว upsert ลง monthly_data
 * ใช้ร่วมกันระหว่าง API route (/api/moph/batch) และ cron อัตโนมัติ
 *
 * Phase 3 — ใช้ moph_config (ถ้ามี) + computeMoph engine กลาง
 *   - errors  → status:'error'   ไม่บันทึก
 *   - skipped → status:'skipped' ไม่บันทึก (noTarget / sumTarget=0 / ไม่มี kpi.target)
 *   - ok      → INSERT monthly_data (target = kpi.target เท่านั้น)
 */
export async function runBatchSave(opts: BatchOptions = {}): Promise<BatchResult> {
  const { year = '2569', province = '66', hospcode = '', areacode = '', month, kpiId = '', trigger = 'manual' } = opts

  const saveMonth =
    month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  const conn = await pool.getConnection()
  let kpis: {
    id: string; name: string
    moph_table: string; moph_value_field: string
    moph_target_field: string; moph_calc_mode: string
    target: number | null
    moph_config: string | null
    manual_entry: number
  }[] = []
  // Phase 7A: เป้ารายปีงบ (kpi_targets) — fallback kpi_reports.target ถ้าไม่มี
  let targetMap = new Map<string, number>()
  try {
    const [rows] = await conn.execute(
      `SELECT id, name, moph_table, moph_value_field, moph_target_field, moph_calc_mode,
              target, moph_config, manual_entry
       FROM kpi_reports
       WHERE moph_table IS NOT NULL AND moph_table <> ''
         ${kpiId ? 'AND id = ?' : ''}
       ORDER BY id`,
      kpiId ? [kpiId] : [],
    )
    kpis = rows as typeof kpis
    targetMap = await getTargetsForYear(conn, year)
  } finally {
    conn.release()
  }

  if (kpis.length === 0) {
    // heartbeat: cron รันจริงแต่ไม่เจอ KPI (config หาย) — ยัง log ให้แผงเห็นว่า cron เดินอยู่
    if (!kpiId) await logCronRun(trigger, saveMonth, { total: 0, saved: 0, skipped: 0, failed: 0 })
    return {
      ok: false, message: 'ไม่มี KPI ที่ตั้งค่า MOPH Table ไว้',
      savedMonth: saveMonth, year, province,
      areacode: areacode || null, hospcode: hospcode || null,
      total: 0, saved: 0, skipped: 0, failed: 0, results: [],
    }
  }

  const results: BatchItemResult[] = []

  for (const kpi of kpis) {
    try {
      // KPI กรอกมือ (flag manual_entry) — ข้าม ไม่ทับค่าที่กรอก
      if (isManualEntry(kpi.manual_entry)) {
        results.push({
          kpiId: kpi.id, kpiName: kpi.name, status: 'skipped',
          skipReason: 'กรอกค่าเอง (manual) — ระบบไม่ดึง/ทับค่าอัตโนมัติ',
        })
        continue
      }

      let rows = await fetchMophRows(kpi.moph_table, year, province)

      if (hospcode) rows = rows.filter((r) => String(r.hospcode) === String(hospcode))
      if (areacode) rows = rows.filter((r) => String(r.areacode ?? '').startsWith(String(areacode)))

      if (rows.length === 0) {
        results.push({ kpiId: kpi.id, kpiName: kpi.name, status: 'error', error: 'ไม่พบข้อมูล' })
        continue
      }

      // ── โหลด mapping: moph_config (Phase 2) → fallback legacy ─────────────
      let mapping: MophMapping
      if (kpi.moph_config) {
        try {
          mapping = JSON.parse(kpi.moph_config) as MophMapping
        } catch {
          mapping = buildMappingFromLegacy(
            kpi.moph_value_field || 'result',
            kpi.moph_target_field,
            kpi.moph_calc_mode,
          )
        }
      } else {
        mapping = buildMappingFromLegacy(
          kpi.moph_value_field || 'result',
          kpi.moph_target_field,
          kpi.moph_calc_mode,
        )
      }

      // calcMode='percentIncrease' → เติมยอดปีฐาน (ปีงบก่อนหน้าปีที่กำลังดึง) จาก kpi_baseline_year
      // ยังไม่เก็บปีฐานไว้ → คืน mapping เดิม ใช้ค่าคงที่ใน moph_config เหมือนเดิมทุกประการ
      mapping = await applyBaselineToMappingPooled(kpi.id, mapping, year)

      // ── คำนวณผ่าน engine กลาง — preview/single/batch ใช้ตัวเดียวกัน ────────
      const r = computeMoph(rows, mapping)

      // engine errors (dimension/time/field ไม่มีจริง) → ไม่บันทึก
      if (r.errors.length > 0) {
        results.push({
          kpiId: kpi.id, kpiName: kpi.name, status: 'error',
          error: r.errors[0],
          rows: rows.length,
          warnings: r.warnings.length > 0 ? r.warnings : undefined,
        })
        continue
      }

      // audit ก่อนทับค่าที่คนกรอกมือไว้ — ต้องเรียกก่อน saveMonthlyDetail (ฟังก์ชันนั้นลบ detail เดิมทิ้ง)
      if (await logAutoOverwriteIfManual(kpi.id, saveMonth)) {
        r.warnings.push(`ทับค่าที่กรอกมือไว้ของเดือน ${saveMonth} — ค่าเดิมเก็บใน data_change_log แล้ว`)
      }

      // ── Phase 4.8: เก็บ detail ราย hospcode (เฉพาะ field ยอดรวม) ─────────
      // additive — ถ้าพลาดให้เป็นแค่ warning ไม่กระทบการบันทึก monthly_data
      const detail = await saveMonthlyDetail(kpi.id, saveMonth, rows, kpi.moph_table)
      if (detail.error) r.warnings.push(`เก็บ detail ไม่สำเร็จ: ${detail.error}`)

      // ── ปีฐานอัตโนมัติ (เฉพาะ KPI แบบ "เพิ่มขึ้นเทียบปีก่อนหน้า") ─────────
      // เก็บยอดสะสมล่าสุดของปีงบนี้ไว้ พอปีงบปิด ค่าที่ค้างอยู่ = ยอดสิ้นปี → เป็นปีฐานของปีถัดไปเอง
      if (mapping.calcMode === 'percentIncrease') {
        const base = await captureBaselineFromDetail(kpi.id, saveMonth, year)
        if (base.error) r.warnings.push(`เก็บปีฐานไม่สำเร็จ: ${base.error}`)
      }

      // noTarget → skipped (ไม่ใช่ error) — ตามดีไซน์
      if (mapping.calcMode === 'noTarget') {
        results.push({
          kpiId: kpi.id, kpiName: kpi.name, status: 'skipped',
          skipReason: 'noTarget — ติดตามอย่างเดียว ไม่ประเมินผ่าน/ไม่ผ่าน',
          rows: rows.length,
          warnings: r.warnings.length > 0 ? r.warnings : undefined,
        })
        continue
      }

      // calcValue=null (sumTarget=0 หรือข้อมูลว่าง) → skipped
      if (r.calcValue === null) {
        results.push({
          kpiId: kpi.id, kpiName: kpi.name, status: 'skipped',
          // ปีฐานหาย/ผิดปี → บอกสาเหตุจริงตรงหัวข้อเลย (ไม่งั้นขึ้นว่า "sumTarget=0" ซึ่งไม่ใช่เรื่องเดียวกัน)
          skipReason: mapping.baseYearError ?? 'คำนวณไม่ได้ (sumTarget=0 หรือข้อมูล target ว่าง)',
          rows: rows.length,
          warnings: r.warnings.length > 0 ? r.warnings : undefined,
        })
        continue
      }

      // ── ตรวจ target ก่อนบันทึก ─────────────────────────────────────────
      // Phase 7A: เป้ารายปีงบ (kpi_targets) ก่อน → fallback kpi_reports.target
      // - null / undefined  → skipped (ยังไม่ได้ตั้ง target)
      // - 0                 → ok (เป็นเป้าหมายที่ถูกต้อง เช่น เสียชีวิต 0, ร้องเรียน 0, infection 0%)
      // - > 0               → ok (ปกติ)
      // - < 0               → error (ค่าติดลบ ไม่ใช่เป้าหมาย KPI ที่ถูกต้อง)
      const effTarget = targetMap.get(kpi.id) ?? kpi.target
      if (effTarget === null || effTarget === undefined) {
        results.push({
          kpiId: kpi.id, kpiName: kpi.name, status: 'skipped',
          skipReason: `KPI นี้ยังไม่ได้ตั้ง target ปีงบ ${year} — โปรดตั้งในหน้าจัดการเป้าหมาย`,
          calcValue: r.calcValue,
          rows: rows.length,
          warnings: r.warnings.length > 0 ? r.warnings : undefined,
        })
        continue
      }
      if (effTarget < 0) {
        results.push({
          kpiId: kpi.id, kpiName: kpi.name, status: 'error',
          error: `ค่า target ติดลบ (${effTarget}) ไม่ถูกต้อง — โปรดแก้เป้าหมายก่อน`,
          calcValue: r.calcValue,
          rows: rows.length,
          warnings: r.warnings.length > 0 ? r.warnings : undefined,
        })
        continue
      }

      // ── บันทึก: monthly_data.target = effTarget (เป้ารายปีงบ หรือ fallback) ──
      const c2 = await pool.getConnection()
      try {
        await c2.execute(
          `INSERT INTO monthly_data (kpi_id, month, value, target)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value), target = VALUES(target)`,
          [kpi.id, saveMonth, r.calcValue, effTarget],
        )
      } finally {
        c2.release()
      }

      results.push({
        kpiId: kpi.id, kpiName: kpi.name, status: 'ok',
        calcValue: r.calcValue, rows: rows.length,
        warnings: r.warnings.length > 0 ? r.warnings : undefined,
      })
    } catch (e) {
      results.push({ kpiId: kpi.id, kpiName: kpi.name, status: 'error', error: String(e) })
    }
  }

  const summary: BatchResult = {
    ok: true,
    savedMonth: saveMonth, year, province,
    areacode: areacode || null, hospcode: hospcode || null,
    total:   kpis.length,
    saved:   results.filter((r) => r.status === 'ok').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed:  results.filter((r) => r.status === 'error').length,
    results,
  }

  // บันทึก cron_log เฉพาะการรัน full-batch (ไม่รวมดึงทีละ KPI) — best-effort ไม่ให้ล้มกระทบผลลัพธ์
  // trigger='cron' (อัตโนมัติจาก scheduler) / 'manual' (ปุ่มดึงทั้งหมด) → แยกได้ในแผงสถานะ
  if (!kpiId) await logCronRun(trigger, saveMonth, summary)

  return summary
}

/** ปีงบประมาณ พ.ศ. ปัจจุบัน (เริ่ม 1 ต.ค.) เช่น พ.ค. 2026 → 2569, พ.ย. 2025 → 2569 */
export function currentMophFiscalYear(now: Date = new Date()): string {
  const greg = now.getFullYear()
  const month = now.getMonth() + 1
  const buddhist = greg + 543
  return String(month >= 10 ? buddhist + 1 : buddhist)
}
