import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { classifyField } from '@/lib/mophEngine'
import { isValidDirection, VALID_DIRECTIONS } from '@/lib/kpiStatus'
import type { MophMapping } from '@/lib/types'

const VALID_CALC_MODES = new Set(['percent', 'sum', 'raw', 'noTarget'])

/** Validate MophMapping ก่อน persist — คืน error message หรือ null ถ้า OK */
function validateMophConfig(cfg: MophMapping): string | null {
  if (!VALID_CALC_MODES.has(cfg.calcMode)) {
    return 'calcMode ต้องเป็น percent / sum / raw / noTarget'
  }
  if (!Array.isArray(cfg.valueFields) || cfg.valueFields.length === 0) {
    return 'valueFields ต้องเป็น array ที่ไม่ว่าง'
  }
  for (const f of cfg.valueFields) {
    if (!f || typeof f !== 'string' || !f.trim()) return 'valueFields มี field ว่าง'
    const ftype = classifyField(f)
    if (ftype === 'dimension') return `"${f}" เป็น dimension field (hospcode/areacode/ฯลฯ) — ใช้เป็น value field ไม่ได้`
    if (ftype === 'time')      return `"${f}" เป็น time field (month/b_year/ฯลฯ) — ใช้เป็น value field ไม่ได้`
  }
  if (cfg.targetMode === 'field') {
    if (!Array.isArray(cfg.targetFields) || cfg.targetFields.length === 0) {
      return 'targetMode=field ต้องระบุ targetFields ที่ไม่ว่าง'
    }
    for (const f of cfg.targetFields) {
      if (!f || typeof f !== 'string' || !f.trim()) return 'targetFields มี field ว่าง'
      const ftype = classifyField(f)
      if (ftype === 'dimension') return `"${f}" เป็น dimension field — ใช้เป็น target field ไม่ได้`
      if (ftype === 'time')      return `"${f}" เป็น time field — ใช้เป็น target field ไม่ได้`
    }
  }
  return null
}

/** GET /api/kpis/[id] → คืน KPI พร้อม mophConfig (parsed JSON, nullable) */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.execute(
      `SELECT id, name, category,
              moph_url, moph_table, moph_value_field, moph_target_field, moph_calc_mode,
              moph_report_id, evaluation_direction, owner, deadline, status, target, unit, description,
              moph_config
       FROM kpi_reports WHERE id = ?`,
      [params.id],
    )
    const row = (rows as Record<string, unknown>[])[0]
    if (!row) return NextResponse.json({ message: 'ไม่พบ KPI' }, { status: 404 })

    let mophConfig: MophMapping | null = null
    if (row.moph_config) {
      try { mophConfig = JSON.parse(row.moph_config as string) as MophMapping }
      catch { /* JSON ไม่ valid — fallback null */ }
    }

    return NextResponse.json({
      id: row.id, name: row.name, category: row.category,
      mophUrl:         row.moph_url,
      mophTable:       row.moph_table,
      mophValueField:  row.moph_value_field,
      mophTargetField: row.moph_target_field,
      mophCalcMode:    row.moph_calc_mode,
      mophReportId:    row.moph_report_id,
      direction:       row.evaluation_direction ?? 'gte',
      owner: row.owner, deadline: row.deadline, status: row.status,
      target: row.target, unit: row.unit, description: row.description,
      mophConfig,
    })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

/** PUT /api/kpis/[id] → แก้ไขข้อมูลทั่วไป — ห้ามแตะ moph_config */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { name, category, mophUrl, mophTable, mophValueField, mophTargetField, mophCalcMode,
          direction, owner, deadline, status, target, unit, description } = body

  // Phase 4: validate direction เฉพาะกรณี "ส่งมา" — ถ้าไม่ส่งมาให้คงค่าเดิมใน DB
  // (ห้าม default 'gte' เงียบๆ เพราะจะลบทับ direction ที่ admin เคยตั้งไว้)
  const hasDirection = direction !== undefined
  if (hasDirection && !isValidDirection(direction)) {
    return NextResponse.json(
      { message: `direction ไม่ถูกต้อง: "${direction}" — รับเฉพาะ ${VALID_DIRECTIONS.join(' / ')}` },
      { status: 400 },
    )
  }

  const conn = await pool.getConnection()
  try {
    if (hasDirection) {
      // ส่ง direction มา → update รวมด้วย
      await conn.execute(
        `UPDATE kpi_reports SET
          name=?, category=?, moph_url=?, moph_table=?, moph_value_field=?, moph_target_field=?, moph_calc_mode=?,
          evaluation_direction=?, owner=?, deadline=?, status=?, target=?, unit=?, description=?
         WHERE id=?`,
        [name, category,
         mophUrl ?? null, mophTable ?? null, mophValueField ?? null, mophTargetField ?? null, mophCalcMode ?? 'percent',
         direction, owner, deadline, status, target, unit, description ?? null, params.id],
      )
    } else {
      // ไม่ส่ง direction → คงค่า evaluation_direction เดิมใน DB
      await conn.execute(
        `UPDATE kpi_reports SET
          name=?, category=?, moph_url=?, moph_table=?, moph_value_field=?, moph_target_field=?, moph_calc_mode=?,
          owner=?, deadline=?, status=?, target=?, unit=?, description=?
         WHERE id=?`,
        [name, category,
         mophUrl ?? null, mophTable ?? null, mophValueField ?? null, mophTargetField ?? null, mophCalcMode ?? 'percent',
         owner, deadline, status, target, unit, description ?? null, params.id],
      )
    }
    return NextResponse.json({ message: 'แก้ไข KPI สำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const conn = await pool.getConnection()
  try {
    await conn.execute('DELETE FROM kpi_reports WHERE id = ?', [params.id])
    return NextResponse.json({ message: 'ลบ KPI สำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const conn = await pool.getConnection()
  try {
    // ── Branch 1: บันทึก MophMapping → moph_config (Phase 2) ────────────────
    if ('mophConfig' in body) {
      const cfg = body.mophConfig as MophMapping | null
      if (cfg !== null && cfg !== undefined) {
        const err = validateMophConfig(cfg)
        if (err) return NextResponse.json({ message: err }, { status: 400 })
        await conn.execute(
          'UPDATE kpi_reports SET moph_config=? WHERE id=?',
          [JSON.stringify(cfg), params.id],
        )
        return NextResponse.json({ ok: true, message: 'บันทึก Mapping สำเร็จ' })
      } else {
        // cfg = null → ล้าง mapping
        await conn.execute('UPDATE kpi_reports SET moph_config=NULL WHERE id=?', [params.id])
        return NextResponse.json({ ok: true, message: 'ล้าง Mapping สำเร็จ' })
      }
    }

    // ── Branch 2: อัปเดต legacy Field Config ───────────────────────────────
    if ('mophValueField' in body) {
      await conn.execute(
        'UPDATE kpi_reports SET moph_value_field=?, moph_target_field=?, moph_calc_mode=? WHERE id=?',
        [body.mophValueField ?? null, body.mophTargetField ?? null, body.mophCalcMode ?? 'percent', params.id],
      )
      return NextResponse.json({ ok: true, message: 'บันทึก Field Config สำเร็จ' })
    }

    // ── Branch 3: อัปเดตสถานะ (เดิม) ──────────────────────────────────────
    await conn.execute('UPDATE kpi_reports SET status=? WHERE id=?', [body.status, params.id])
    return NextResponse.json({ ok: true, message: 'อัปเดตสถานะสำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
