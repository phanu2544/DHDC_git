import { NextRequest, NextResponse } from 'next/server'
import { PoolConnection } from 'mysql2/promise'
import pool from '@/lib/db'
import { isValidDirection, VALID_DIRECTIONS } from '@/lib/kpiStatus'

/** เติม workGroups: string[] ให้แต่ละแถว KPI — 1 query รวด กัน N+1 (docs/kpi-work-groups-plan.md) */
async function attachWorkGroups(conn: PoolConnection, rows: Record<string, unknown>[]) {
  const [wgRows] = await conn.execute('SELECT kpi_id, work_group FROM kpi_work_groups')
  const map = new Map<string, string[]>()
  for (const r of wgRows as { kpi_id: string; work_group: string }[]) {
    if (!map.has(r.kpi_id)) map.set(r.kpi_id, [])
    map.get(r.kpi_id)!.push(r.work_group)
  }
  return rows.map((row) => ({ ...row, workGroups: map.get(row.id as string) ?? [] }))
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
                owner,
                DATE_FORMAT(deadline,'%Y-%m-%d') as deadline,
                status, target, unit, description
         FROM kpi_reports ORDER BY category, name`,
      )
      return NextResponse.json(await attachWorkGroups(conn, rows as Record<string, unknown>[]))
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
      return NextResponse.json(await attachWorkGroups(conn, rows as Record<string, unknown>[]))
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
          direction, owner, deadline, status, target, unit, description, manualEntry } = body

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
         evaluation_direction, manual_entry, owner, deadline, status, target, unit, description)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, name, category,
       mophUrl ?? null, mophTable ?? null, mophValueField ?? null, mophTargetField ?? null, mophCalcMode ?? 'percent',
       evalDirection, manualEntry ? 1 : 0, owner, deadline, status ?? 'in_progress', target ?? 0, unit ?? '%', description ?? null],
    )
    return NextResponse.json({ id, message: 'เพิ่ม KPI สำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
