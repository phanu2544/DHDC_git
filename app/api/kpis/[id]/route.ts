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
              moph_report_id, evaluation_direction, manual_entry, manual_scope, data_source, measure_type, text_options, owner, deadline, status, target, unit, description,
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
      manualEntry:     Number(row.manual_entry) === 1,
      manualScope:     row.manual_scope === 'single' ? 'single' : 'unit',
      dataSource:      (row.data_source as string) ?? 'HDC',
      measureType:     row.measure_type === 'text' || row.measure_type === 'level' ? row.measure_type : 'numeric',
      textOptions:     (row.text_options as string | null) ?? null,
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
          direction, owner, deadline, status, target, unit, description, manualEntry, manualScope, dataSource, measureType, textOptions, workGroups, sets } = body
  // ชนิด text/level = กรอกมือเสมอ + ค่าเดียว (single) — ดึง MOPH/แยกราย รพ.สต. ไม่ได้
  const measureVal = (measureType === 'text' || measureType === 'level') ? measureType : 'numeric'
  const isTextBased = measureVal === 'text' || measureVal === 'level'
  const manualVal = (isTextBased || manualEntry) ? 1 : 0
  const scopeVal = isTextBased ? 'single' : (manualScope === 'single' ? 'single' : 'unit')
  const sourceVal = (typeof dataSource === 'string' && dataSource.trim()) ? dataSource.trim() : 'HDC'
  // ตัวเลือก/ระดับ เก็บเฉพาะ text/level (numeric ล้างเป็น NULL) · ว่าง → NULL
  const textOptsVal = isTextBased && typeof textOptions === 'string' && textOptions.trim() ? textOptions.trim() : null

  if (!name || !category || !owner || !deadline) {
    return NextResponse.json({ message: 'กรุณากรอกข้อมูลที่จำเป็น' }, { status: 400 })
  }

  // Phase 4: validate direction เฉพาะกรณี "ส่งมา" — ถ้าไม่ส่งมาให้คงค่าเดิมใน DB
  // (ห้าม default 'gte' เงียบๆ เพราะจะลบทับ direction ที่ admin เคยตั้งไว้)
  const hasDirection = direction !== undefined
  if (hasDirection && !isValidDirection(direction)) {
    return NextResponse.json(
      { message: `direction ไม่ถูกต้อง: "${direction}" — รับเฉพาะ ${VALID_DIRECTIONS.join(' / ')}` },
      { status: 400 },
    )
  }

  // workGroups: ส่งมา = แทนที่ทั้งชุด (ไม่ส่งมา = คงเดิม เหมือน direction)
  const hasWorkGroups = Array.isArray(workGroups)
  // sets: ส่งมา = แทนที่ทั้งชุด · แต่ละตัว { setId:number, setCode?:string } (docs/kpi-sets-plan.md K3)
  const hasSets = Array.isArray(sets)

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    if (hasDirection) {
      // ส่ง direction มา → update รวมด้วย
      await conn.execute(
        `UPDATE kpi_reports SET
          name=?, category=?, moph_url=?, moph_table=?, moph_value_field=?, moph_target_field=?, moph_calc_mode=?,
          evaluation_direction=?, manual_entry=?, manual_scope=?, data_source=?, measure_type=?, text_options=?, owner=?, deadline=?, status=?, target=?, unit=?, description=?
         WHERE id=?`,
        [name, category,
         mophUrl ?? null, mophTable ?? null, mophValueField ?? null, mophTargetField ?? null, mophCalcMode ?? 'percent',
         direction, manualVal, scopeVal, sourceVal, measureVal, textOptsVal, owner, deadline, status, target, unit, description ?? null, params.id],
      )
    } else {
      // ไม่ส่ง direction → คงค่า evaluation_direction เดิมใน DB
      await conn.execute(
        `UPDATE kpi_reports SET
          name=?, category=?, moph_url=?, moph_table=?, moph_value_field=?, moph_target_field=?, moph_calc_mode=?,
          manual_entry=?, manual_scope=?, data_source=?, measure_type=?, text_options=?, owner=?, deadline=?, status=?, target=?, unit=?, description=?
         WHERE id=?`,
        [name, category,
         mophUrl ?? null, mophTable ?? null, mophValueField ?? null, mophTargetField ?? null, mophCalcMode ?? 'percent',
         manualVal, scopeVal, sourceVal, measureVal, textOptsVal, owner, deadline, status, target, unit, description ?? null, params.id],
      )
    }

    // defensive: sync กลุ่มงานแยก try ของตัวเอง — ถ้าพัง (ตาราง kpi_work_groups ยังไม่มี,
    // หรือกลุ่มงานที่เลือกถูกลบไปแล้วระหว่างเปิดฟอร์ม) ต้อง "ไม่พัง" การบันทึกฟิลด์หลักของ KPI
    // (เคยเกิดจริง — ไม่มี fallback แล้ว rollback ทั้งชื่อ/เจ้าของ/กำหนดเสร็จที่แก้ไปด้วย)
    let workGroupsWarning: string | null = null
    if (hasWorkGroups) {
      try {
        await conn.execute('DELETE FROM kpi_work_groups WHERE kpi_id=?', [params.id])
        const groups = (workGroups as string[]).filter((g) => g && g.trim())
        if (groups.length > 0) {
          const placeholders = groups.map(() => '(?,?)').join(',')
          const values = groups.flatMap((g) => [params.id, g])
          await conn.execute(`INSERT INTO kpi_work_groups (kpi_id, work_group) VALUES ${placeholders}`, values)
        }
      } catch (wgErr) {
        workGroupsWarning = `บันทึก KPI สำเร็จ แต่บันทึกกลุ่มงานไม่สำเร็จ: ${String(wgErr)}`
      }
    }

    // sync ชุด/ประเภท (kpi_set_items) — defensive แยก try เหมือน workGroups
    // แต่ละตัว { setId, setCode? } · กรอง setId ที่ไม่ใช่ number ทิ้ง · set_code ว่าง → NULL
    let setsWarning: string | null = null
    if (hasSets) {
      try {
        await conn.execute('DELETE FROM kpi_set_items WHERE kpi_id=?', [params.id])
        const items = (sets as { setId: number; setCode?: string }[])
          .filter((s) => s && Number.isInteger(Number(s.setId)))
          // กัน setId ซ้ำ (PK = kpi_id+set_id) — เก็บตัวสุดท้าย
          .reduce((acc, s) => { acc.set(Number(s.setId), s.setCode?.toString().trim() || null); return acc }, new Map<number, string | null>())
        if (items.size > 0) {
          const entries = [...items.entries()]
          const placeholders = entries.map(() => '(?,?,?)').join(',')
          const values = entries.flatMap(([setId, code]) => [params.id, setId, code])
          await conn.execute(`INSERT INTO kpi_set_items (kpi_id, set_id, set_code) VALUES ${placeholders}`, values)
        }
      } catch (sErr) {
        setsWarning = `บันทึก KPI สำเร็จ แต่บันทึกชุดตัวชี้วัดไม่สำเร็จ: ${String(sErr)}`
      }
    }

    await conn.commit()
    return NextResponse.json({ message: workGroupsWarning ?? setsWarning ?? 'แก้ไข KPI สำเร็จ' })
  } catch (err) {
    await conn.rollback()
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
