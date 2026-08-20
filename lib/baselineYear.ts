import type { PoolConnection } from 'mysql2/promise'
import pool from '@/lib/db'
import type { MophMapping } from './types'

/**
 * ปีฐาน (baseline) ของตัวชี้วัดแบบ "เพิ่มขึ้นเทียบปีก่อนหน้า" (calcMode='percentIncrease')
 *
 * เก็บ **ยอดรวมทั้งปีงบ ราย hospcode** ของปีที่ปิดไปแล้วในตาราง `kpi_baseline_year`
 * (ชื่อ field ใน data = ชุดเดียวกับ moph_monthly_detail → จัดกลุ่มตำบล/หน่วยบริการด้วยโค้ดเดิมได้เลย)
 *
 * ทำไมไม่ดึงปีฐานสดจาก MOPH: บางปี Open Data หยุด sync ค้างไว้กลางปี (2568 แช่แข็ง 2 ก.ค. 68
 * ขาดทั้งหน่วยบริการและยอด — ดู kpi-hdc-api-checklist.md §46) ค่าที่ดึงได้จึงต่ำกว่าความจริง
 * ปีที่ปิดแล้วตัวเลขนิ่งถาวร → เก็บไว้ครั้งเดียวปลอดภัยกว่าและถูกต้องกว่าดึงสด
 *
 * engine (computeMoph) ยังคง pure เหมือนเดิม — ตัวที่แตะ DB คือไฟล์นี้ แล้วส่งตัวเลขเข้า mapping
 * ผ่าน applyBaselineToMapping() ก่อนเรียก engine
 */

export interface BaselineRow {
  hospcode: string
  areacode: string
  data: Record<string, number>
}

/** ปีงบประมาณ (พ.ศ.) ของเดือน 'YYYY-MM' (ค.ศ.) — ต.ค. ขึ้นปีงบใหม่ (สูตรเดียวกับ currentMophFiscalYear) */
export function fiscalYearOfMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return 0
  return m >= 10 ? y + 543 + 1 : y + 543
}

/** ปีงบก่อนหน้า (รับได้ทั้ง '2569' และ 2569) */
export function previousFiscalYear(fiscalYear: string | number): number {
  return Number(fiscalYear) - 1
}

/** แถวปีฐานทั้งหมดของ KPI+ปีงบ (ว่าง = ยังไม่เคยเก็บ) */
export async function loadBaselineRows(
  conn: PoolConnection,
  kpiId: string,
  fiscalYear: number,
): Promise<BaselineRow[]> {
  try {
    const [rows] = await conn.execute(
      'SELECT hospcode, areacode, data FROM kpi_baseline_year WHERE kpi_id = ? AND fiscal_year = ?',
      [kpiId, fiscalYear],
    )
    const out: BaselineRow[] = []
    for (const r of rows as { hospcode: string; areacode: string; data: string }[]) {
      try {
        out.push({ hospcode: r.hospcode, areacode: r.areacode ?? '', data: JSON.parse(r.data) })
      } catch { /* แถวเสีย = ข้าม ไม่ล้มทั้งหน้า */ }
    }
    return out
  } catch {
    // ตารางยังไม่มี (DB เก่าที่ยังไม่ได้รัน /api/init) → ถือว่ายังไม่มีปีฐาน ให้ fallback ค่าคงที่ใน config
    return []
  }
}

/** รวม A (valueFields) / B (targetFields) ของปีฐานตาม mapping ตัวเดียวกับปีปัจจุบัน */
export function sumBaseline(
  rows: BaselineRow[],
  mapping: MophMapping,
): { numerator: number; denominator: number } | null {
  if (rows.length === 0) return null
  const valueFields  = mapping.valueFields ?? []
  const targetFields = mapping.targetFields ?? []
  if (valueFields.length === 0 || targetFields.length === 0) return null
  const sum = (fields: string[]) =>
    rows.reduce((s, r) => s + fields.reduce((v, f) => v + (Number(r.data[f]) || 0), 0), 0)
  const denominator = sum(targetFields)
  if (denominator === 0) return null
  return { numerator: sum(valueFields), denominator }
}

/** snapshot เดือนสุดท้ายของปีงบที่ระบุ (ถ้ามี) — ใช้เป็นปีฐานสำรองเมื่อยังไม่ได้เก็บลง kpi_baseline_year */
export async function loadLastSnapshotOfFiscalYear(
  conn: PoolConnection,
  kpiId: string,
  fiscalYear: number,
): Promise<{ month: string; rows: BaselineRow[] } | null> {
  try {
    const [mRows] = await conn.execute(
      'SELECT DISTINCT month FROM moph_monthly_detail WHERE kpi_id = ? ORDER BY month DESC', [kpiId])
    const month = (mRows as { month: string }[])
      .map((r) => r.month)
      .find((m) => fiscalYearOfMonth(m) === fiscalYear)
    if (!month) return null
    const [dRows] = await conn.execute(
      'SELECT hospcode, areacode, data FROM moph_monthly_detail WHERE kpi_id = ? AND month = ?', [kpiId, month])
    const rows: BaselineRow[] = []
    for (const r of dRows as { hospcode: string; areacode: string; data: string }[]) {
      try { rows.push({ hospcode: r.hospcode, areacode: r.areacode ?? '', data: JSON.parse(r.data) }) }
      catch { /* แถวเสีย = ข้าม */ }
    }
    return rows.length > 0 ? { month, rows } : null
  } catch {
    return null
  }
}

/**
 * หาปีฐานให้ mapping ก่อนส่งให้ computeMoph — ลองตามลำดับความน่าเชื่อถือ
 *
 *   1. `kpi_baseline_year` ของปีงบก่อนหน้า  → ดีสุด (คีย์เองหรือระบบเก็บอัตโนมัติก็ได้)
 *   2. snapshot เดือนสุดท้ายของปีงบก่อนหน้าใน `moph_monthly_detail` → ข้อมูลจริงของปีที่ถูกต้อง
 *   3. ค่าคงที่ใน moph_config — **เฉพาะเมื่อ `baseFiscalYear` ตรงกับปีที่ต้องการ**
 *   4. ไม่เจอเลย → ตั้ง `baseYearError` ให้ engine ไม่คำนวณ + เตือนชัดๆ
 *
 * ⚠️ ข้อ 3 คือจุดที่เคยพลาด: ค่าคงที่ไม่มีป้ายปีกำกับ พอขึ้นปีงบใหม่ระบบจะหยิบเลขปีเก่ามาใช้ต่อเงียบๆ
 * ได้ตัวเลขที่ "ดูปกติ" แต่เทียบผิดปี — ยอมไม่คำนวณแล้วเตือน ดีกว่าคำนวณผิดโดยไม่มีใครรู้
 */
export async function applyBaselineToMapping(
  conn: PoolConnection,
  kpiId: string,
  mapping: MophMapping,
  currentFiscalYear: string | number,
): Promise<MophMapping> {
  if (mapping.calcMode !== 'percentIncrease') return mapping
  const baseFY = previousFiscalYear(currentFiscalYear)

  // 1) ตารางปีฐาน
  const stored = sumBaseline(await loadBaselineRows(conn, kpiId, baseFY), mapping)
  if (stored) {
    return { ...mapping, baseNumerator: stored.numerator, baseDenominator: stored.denominator, baseFiscalYear: baseFY }
  }

  // 2) snapshot เดือนสุดท้ายของปีงบก่อนหน้า
  const snap = await loadLastSnapshotOfFiscalYear(conn, kpiId, baseFY)
  const fromSnap = snap ? sumBaseline(snap.rows, mapping) : null
  if (fromSnap) {
    return { ...mapping, baseNumerator: fromSnap.numerator, baseDenominator: fromSnap.denominator, baseFiscalYear: baseFY }
  }

  // 3) ค่าคงที่ใน config — ใช้ได้เฉพาะเมื่อมีป้ายปีกำกับและตรงปี
  if (
    mapping.baseFiscalYear === baseFY &&
    mapping.baseNumerator !== undefined && mapping.baseDenominator !== undefined
  ) {
    return mapping
  }

  // 4) ไม่มีปีฐานที่เชื่อถือได้ → ไม่คำนวณ
  const had = mapping.baseNumerator !== undefined && mapping.baseDenominator !== undefined
  return {
    ...mapping,
    baseNumerator: undefined,
    baseDenominator: undefined,
    baseFiscalYear: undefined,   // ล้างป้ายปีของค่าคงที่ด้วย กันคนอ่านต่อแล้วเข้าใจผิดว่ากำลังใช้ปีนั้นอยู่
    baseYearError:
      `ไม่มีข้อมูลปีฐาน ${baseFY} — คำนวณ %เพิ่มขึ้นไม่ได้` +
      (had
        ? ` (ค่าคงที่ที่ตั้งไว้เป็นของปีงบ ${mapping.baseFiscalYear ?? 'ไม่ระบุ'} ใช้แทนกันไม่ได้)`
        : '') +
      ` · วิธีแก้: สั่งดึงข้อมูลปีงบ ${baseFY} หนึ่งครั้ง หรือคีย์ยอดปี ${baseFY} ลงตารางปีฐาน`,
  }
}

/** เวอร์ชันที่ยืมคอนเนกชันเอง (ใช้กับที่เรียกที่ไม่มี conn อยู่ในมือ เช่น lib/mophBatch.ts) */
export async function applyBaselineToMappingPooled(
  kpiId: string,
  mapping: MophMapping,
  currentFiscalYear: string | number,
): Promise<MophMapping> {
  if (mapping.calcMode !== 'percentIncrease') return mapping
  const conn = await pool.getConnection()
  try {
    return await applyBaselineToMapping(conn, kpiId, mapping, currentFiscalYear)
  } finally {
    conn.release()
  }
}

/**
 * เก็บ "ยอดล่าสุดของปีงบ" ของ KPI ลง kpi_baseline_year โดยคัดลอกจาก snapshot รายเดือนที่เพิ่งบันทึก
 *
 * เรียกทุกครั้งที่ batch เซฟเดือนหนึ่งสำเร็จ (เฉพาะ KPI ที่ใช้ calcMode='percentIncrease')
 * — field ของตารางพวกนี้เป็น "ยอดสะสมทั้งปีงบ" อยู่แล้ว ค่าจึงทับกันไปเรื่อยๆ ทุกเดือน
 * พอสิ้นปีงบ MOPH หยุดอัปเดตปีนั้น ค่าที่ค้างไว้ = **ยอดสิ้นปีจริง** กลายเป็นปีฐานของปีถัดไปเอง
 * (ไม่ต้องรอกดปุ่มปิดปี · ไม่ต้องแก้ค่าคงที่ในโค้ดทุกปีแบบเดิม)
 *
 * ป้องกันข้อมูลที่คนคีย์เอง: แถว source='manual' (เช่นปีฐาน 2568 ที่คีย์จากภาพ HDC) จะไม่ถูกทับ
 * additive อย่างเดียว — พลาดแล้วคืน error ให้ caller ทำเป็น warning ห้ามล้มการบันทึกหลัก
 */
export async function captureBaselineFromDetail(
  kpiId: string,
  month: string,
  fiscalYearOpt?: string | number,
): Promise<{ saved: number; error?: string }> {
  // ⚠️ ปีงบต้องมาจาก "ปีของข้อมูลที่ดึง" ไม่ใช่เดือนที่บันทึก — สั่งดึงย้อนปีได้ (opts.year ของ runBatchSave)
  // เช่น พ.ย. 69 (ปีงบ 2570) สั่งดึงข้อมูลปีงบ 2569 → ต้องเก็บเข้าช่อง 2569 ไม่ใช่ 2570
  // ไม่ระบุมา → เดาจากเดือน (เคสปกติ: ดึงปีปัจจุบัน เดือนกับปีงบตรงกันอยู่แล้ว)
  const fiscalYear = fiscalYearOpt !== undefined ? Number(fiscalYearOpt) : fiscalYearOfMonth(month)
  if (!fiscalYear) return { saved: 0, error: `เดือนไม่ถูกต้อง: ${month}` }
  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.execute(
      'SELECT hospcode, areacode, data FROM moph_monthly_detail WHERE kpi_id = ? AND month = ?',
      [kpiId, month],
    )
    const detail = rows as { hospcode: string; areacode: string; data: string }[]
    if (detail.length === 0) return { saved: 0 }
    let saved = 0
    for (const r of detail) {
      await conn.execute(
        `INSERT INTO kpi_baseline_year (kpi_id, fiscal_year, hospcode, areacode, data, source, note)
         VALUES (?, ?, ?, ?, ?, 'auto', ?)
         ON DUPLICATE KEY UPDATE
           data = IF(source='manual', data, VALUES(data)),
           note = IF(source='manual', note, VALUES(note))`,
        [kpiId, fiscalYear, r.hospcode, r.areacode ?? '', r.data, `ยอดสะสมล่าสุดปีงบ ${fiscalYear} (snapshot ${month})`],
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
