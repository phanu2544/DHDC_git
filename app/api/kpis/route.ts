import { NextRequest, NextResponse } from 'next/server'
import { PoolConnection } from 'mysql2/promise'
import pool from '@/lib/db'
import { isValidDirection, VALID_DIRECTIONS } from '@/lib/kpiStatus'
import { reportFreqOf } from '@/lib/fiscalQuarter'

/**
 * เติม workGroups: string[] ให้แต่ละแถว KPI — 1 query รวด กัน N+1 (docs/kpi-work-groups-plan.md)
 * defensive: ถ้าตาราง kpi_work_groups ยังไม่มี (เช่น production ยังไม่ได้รัน /api/init รอบใหม่)
 * ต้อง fallback เป็น workGroups: [] แทนที่จะโยน error ทำให้ GET /api/kpis ทั้งเส้นพัง
 * (เคยเกิดจริง — verify ใน docs/kpi-work-groups-plan.md)
 */
async function attachWorkGroups(conn: PoolConnection, rows: Record<string, unknown>[]) {
  try {
    const [wgRows] = await conn.execute('SELECT kpi_id, work_group FROM kpi_work_groups')
    const map = new Map<string, string[]>()
    for (const r of wgRows as { kpi_id: string; work_group: string }[]) {
      if (!map.has(r.kpi_id)) map.set(r.kpi_id, [])
      map.get(r.kpi_id)!.push(r.work_group)
    }
    return rows.map((row) => ({ ...row, workGroups: map.get(row.id as string) ?? [] }))
  } catch {
    return rows.map((row) => ({ ...row, workGroups: [] }))
  }
}

/**
 * เติม sets: KpiSetTag[] ให้แต่ละแถว — 1 query รวด (JOIN kpi_set_items × kpi_sets) กัน N+1
 * defensive เหมือน attachWorkGroups: ถ้าตาราง kpi_set_items/kpi_sets ยังไม่มี (production ยังไม่รัน
 * /api/init รอบ K1) → fallback sets: [] แทน throw — ไม่งั้น GET /api/kpis ทั้งเส้นพัง (บทเรียน work-groups §14)
 */
async function attachSets(conn: PoolConnection, rows: Record<string, unknown>[]) {
  try {
    const [siRows] = await conn.execute(
      `SELECT i.kpi_id, i.set_code, i.target_region, i.target_province, i.target_hospital, s.id, s.name, s.slug
         FROM kpi_set_items i JOIN kpi_sets s ON s.id = i.set_id
         ORDER BY s.sort_order ASC, s.id ASC`,
    )
    type SiRow = { kpi_id: string; set_code: string | null; target_region: string | null; target_province: string | null; target_hospital: string | null; id: number; name: string; slug: string }
    type Tag = { id: number; name: string; slug: string; setCode: string | null; targetRegion: string | null; targetProvince: string | null; targetHospital: string | null }
    const map = new Map<string, Tag[]>()
    for (const r of siRows as SiRow[]) {
      if (!map.has(r.kpi_id)) map.set(r.kpi_id, [])
      map.get(r.kpi_id)!.push({ id: r.id, name: r.name, slug: r.slug, setCode: r.set_code,
        targetRegion: r.target_region, targetProvince: r.target_province, targetHospital: r.target_hospital })
    }
    return rows.map((row) => ({ ...row, sets: map.get(row.id as string) ?? [] }))
  } catch {
    return rows.map((row) => ({ ...row, sets: [] }))
  }
}

export async function GET() {
  const conn = await pool.getConnection()
  try {
    // Phase 4: เพิ่ม evaluation_direction — defensive: ถ้า column ยังไม่ ALTER ให้ fallback
    try {
      const [rows] = await conn.execute(
        `SELECT id, name, category,
                moph_url        as mophUrl,
                moph_table      as mophTable,
                moph_value_field as mophValueField,
                moph_target_field as mophTargetField,
                moph_calc_mode  as mophCalcMode,
                evaluation_direction as direction,
                manual_entry    as manualEntry,
                manual_scope    as manualScope,
                data_source     as dataSource,
                measure_type    as measureType,
                text_options    as textOptions,
                report_freq     as reportFreq,
                rate_per        as ratePer,
                owner,
                DATE_FORMAT(deadline,'%Y-%m-%d') as deadline,
                status, target, unit, description
         FROM kpi_reports ORDER BY category, name`,
      )
      return NextResponse.json(await attachSets(conn, await attachWorkGroups(conn, rows as Record<string, unknown>[])))
    } catch {
      // column ยังไม่มี → query เดิม (direction = undefined ฝั่ง client จะ default 'gte')
      const [rows] = await conn.execute(
        `SELECT id, name, category,
                moph_url        as mophUrl,
                moph_table      as mophTable,
                moph_value_field as mophValueField,
                moph_target_field as mophTargetField,
                moph_calc_mode  as mophCalcMode,
                owner,
                DATE_FORMAT(deadline,'%Y-%m-%d') as deadline,
                status, target, unit, description
         FROM kpi_reports ORDER BY category, name`,
      )
      return NextResponse.json(await attachSets(conn, await attachWorkGroups(conn, rows as Record<string, unknown>[])))
    }
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, category, mophUrl, mophTable, mophValueField, mophTargetField, mophCalcMode,
          direction, owner, deadline, status, target, unit, description, manualEntry, manualScope, dataSource, measureType, textOptions, reportFreq } = body
  // ชนิด text/level = กรอกมือเสมอ + ค่าเดียว (single) — ดึง MOPH/แยกราย รพ.สต. ไม่ได้
  const measureVal = (measureType === 'text' || measureType === 'level') ? measureType : 'numeric'
  const isTextBased = measureVal === 'text' || measureVal === 'level'
  const manualVal = (isTextBased || manualEntry) ? 1 : 0
  const scopeVal = isTextBased ? 'single' : (manualScope === 'single' ? 'single' : 'unit')
  const sourceVal = (typeof dataSource === 'string' && dataSource.trim()) ? dataSource.trim() : 'HDC'
  // ตัวเลือก/ระดับ เก็บเฉพาะ text/level (numeric ไม่ใช้) · ว่าง → NULL
  const textOptsVal = isTextBased && typeof textOptions === 'string' && textOptions.trim() ? textOptions.trim() : null
  // L4: ความถี่รายงาน — 'quarterly' = กรอก 4 ครั้ง/ปี (ตรวจราชการ) · อื่นๆ = รายเดือนตามเดิม
  const freqVal = reportFreqOf(reportFreq)

  if (!name || !category || !owner || !deadline) {
    return NextResponse.json({ message: 'กรุณากรอกข้อมูลที่จำเป็น' }, { status: 400 })
  }

  // Phase 4: validate direction — ถ้าส่งมาต้องเป็น gte/lte/eq/none เท่านั้น (ห้าม default เงียบ)
  if (direction !== undefined && !isValidDirection(direction)) {
    return NextResponse.json(
      { message: `direction ไม่ถูกต้อง: "${direction}" — รับเฉพาะ ${VALID_DIRECTIONS.join(' / ')}` },
      { status: 400 },
    )
  }
  const evalDirection = direction ?? 'gte'   // ไม่ส่งมา = ใช้ default; ส่งมาผิด = 400 ไปแล้ว

  const id = `kpi-${Date.now()}`
  const conn = await pool.getConnection()
  try {
    await conn.execute(
      `INSERT INTO kpi_reports
        (id, name, category, moph_url, moph_table, moph_value_field, moph_target_field, moph_calc_mode,
         evaluation_direction, manual_entry, manual_scope, data_source, measure_type, text_options, report_freq, owner, deadline, status, target, unit, description)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, name, category,
       mophUrl ?? null, mophTable ?? null, mophValueField ?? null, mophTargetField ?? null, mophCalcMode ?? 'percent',
       evalDirection, manualVal, scopeVal, sourceVal, measureVal, textOptsVal, freqVal, owner, deadline, status ?? 'in_progress', target ?? 0, unit ?? '%', description ?? null],
    )
    return NextResponse.json({ id, message: 'เพิ่ม KPI สำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
