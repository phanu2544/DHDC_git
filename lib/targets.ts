import type { Pool, PoolConnection } from 'mysql2/promise'

/**
 * Phase 7A — Target resolver (เป้าหมายรายปีงบประมาณ)
 * แหล่งความจริง: ตาราง kpi_targets (1 เป้า/KPI/ปีงบ) · fallback → kpi_reports.target
 * defensive: ถ้าตาราง kpi_targets ยังไม่ถูกสร้าง (DB เก่า) → คืนค่าว่าง/null แล้วให้ caller fallback
 */
type Conn = Pool | PoolConnection

/** ปีงบประมาณ พ.ศ. ปัจจุบัน (เริ่ม 1 ต.ค.) เช่น มิ.ย. 2026 → 2569 */
export function currentFiscalYear(now: Date = new Date()): string {
  const greg = now.getFullYear()
  const month = now.getMonth() + 1
  const buddhist = greg + 543
  return String(month >= 10 ? buddhist + 1 : buddhist)
}

/** โหลดเป้าทุก KPI ของปีงบในรอบเดียว (กัน N+1) — Map<kpi_id, target> */
export async function getTargetsForYear(conn: Conn, fiscalYear: string): Promise<Map<string, number>> {
  const m = new Map<string, number>()
  try {
    const [rows] = await conn.execute(
      'SELECT kpi_id, target FROM kpi_targets WHERE fiscal_year = ?', [fiscalYear],
    )
    for (const r of rows as { kpi_id: string; target: number }[]) m.set(r.kpi_id, Number(r.target))
  } catch {
    /* ตาราง kpi_targets ยังไม่มี → คืน map ว่าง ให้ caller fallback kpi_reports.target */
  }
  return m
}

/** เป้าของ KPI หนึ่งตัวสำหรับปีงบ — คืน null ถ้ายังไม่ตั้งใน kpi_targets (ให้ caller fallback) */
export async function getTargetFor(conn: Conn, kpiId: string, fiscalYear: string): Promise<number | null> {
  try {
    const [rows] = await conn.execute(
      'SELECT target FROM kpi_targets WHERE kpi_id = ? AND fiscal_year = ?', [kpiId, fiscalYear],
    )
    const row = (rows as { target: number }[])[0]
    return row ? Number(row.target) : null
  } catch {
    return null
  }
}
