import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { currentFiscalYear } from '@/lib/targets'

/** ช่วงเดือนปฏิทิน (YYYY-MM) ของปีงบ พ.ศ. — เริ่ม 1 ต.ค. เช่น 2569 → 2025-10 ถึง 2026-09 */
function fiscalYearMonthRange(fy: string): { start: string; end: string } {
  const endGreg = Number(fy) - 543
  const startGreg = endGreg - 1
  return { start: `${startGreg}-10`, end: `${endGreg}-09` }
}

/**
 * Phase 7A — Target Management API (เป้าหมายรายปีงบประมาณ)
 * GET  /api/targets?year=2569  → ทุก KPI + เป้าปีนั้น (จาก kpi_targets) + audit
 * PUT  /api/targets            → upsert เป้า 1 ตัว (+ sync kpi_reports.target ถ้าเป็นปีงบปัจจุบัน)
 */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = searchParams.get('year') || currentFiscalYear()
  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.execute(
      `SELECT k.id, k.name, k.category, k.unit,
              COALESCE(k.evaluation_direction,'gte') AS direction,
              k.target AS reports_target,
              t.target AS year_target, t.source, t.confirmed_by, t.confirmed_at, t.note, t.updated_at,
              (SELECT m.value FROM monthly_data m WHERE m.kpi_id = k.id ORDER BY m.month DESC LIMIT 1) AS current_value,
              (SELECT m.month FROM monthly_data m WHERE m.kpi_id = k.id ORDER BY m.month DESC LIMIT 1) AS current_month
       FROM kpi_reports k
       LEFT JOIN kpi_targets t ON t.kpi_id = k.id AND t.fiscal_year = ?
       ORDER BY k.category, k.name`,
      [year],
    )
    return NextResponse.json({ ok: true, year, currentFiscalYear: currentFiscalYear(), rows })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { kpiId, fiscalYear, target, source, confirmedBy, confirmedAt, note } = body

  if (!kpiId || !fiscalYear) {
    return NextResponse.json({ ok: false, message: 'ต้องระบุ kpiId และ fiscalYear' }, { status: 400 })
  }
  const t = Number(target)
  if (!Number.isFinite(t)) {
    return NextResponse.json({ ok: false, message: 'target ต้องเป็นตัวเลข' }, { status: 400 })
  }
  if (t < 0) {
    return NextResponse.json({ ok: false, message: 'target ติดลบไม่ได้' }, { status: 400 })
  }

  const conn = await pool.getConnection()
  try {
    await conn.execute(
      `INSERT INTO kpi_targets (kpi_id, fiscal_year, target, source, confirmed_by, confirmed_at, note)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         target = VALUES(target), source = VALUES(source),
         confirmed_by = VALUES(confirmed_by), confirmed_at = VALUES(confirmed_at), note = VALUES(note)`,
      [kpiId, String(fiscalYear), t, source ?? null, confirmedBy ?? null, confirmedAt ?? null, note ?? null],
    )

    // sync kpi_reports.target เป็น cache ของปีงบปัจจุบัน (ให้โค้ดที่อ่าน kpi.target ตรงทันที)
    let syncedReports = false
    if (String(fiscalYear) === currentFiscalYear()) {
      await conn.execute('UPDATE kpi_reports SET target = ? WHERE id = ?', [t, kpiId])
      syncedReports = true
    }

    // propagate ลง monthly_data ของเดือนในปีงบนั้น → Scorecard สะท้อนทันที (ไม่ต้องรอ batch)
    const { start, end } = fiscalYearMonthRange(String(fiscalYear))
    const [mdRes] = await conn.execute(
      'UPDATE monthly_data SET target = ? WHERE kpi_id = ? AND month >= ? AND month <= ?',
      [t, kpiId, start, end],
    )
    const monthsUpdated = (mdRes as { affectedRows: number }).affectedRows

    return NextResponse.json({ ok: true, message: 'บันทึกเป้าหมายสำเร็จ', syncedReports, monthsUpdated })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
