import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { buildMappingFromLegacy, computeMoph } from '@/lib/mophEngine'
import { evaluateKpiStatus } from '@/lib/kpiStatus'
import { tambonCodeOf, tambonNameOf } from '@/lib/areaRef'
import { fieldLabelsFor } from '@/lib/detailLabels'
import { isManualEntry } from '@/lib/manualKpi'
import type { MophMapping, EvalDirection, KpiEvalStatus } from '@/lib/types'

/**
 * Phase 6A — Drilldown รายตำบลจาก moph_monthly_detail
 * GET /api/detail?kpiId=&month=   (month ว่าง = เดือนล่าสุดที่มี detail)
 *
 * หลักการ: คำนวณ % ต่อตำบลด้วย computeMoph + mapping ตัวเดียวกับค่ารวมระดับอำเภอ
 * → เลขรายตำบลกับเลขบน Scorecard สอดคล้องกันเสมอ
 * สถานะรายตำบลใช้ evaluateKpiStatus เทียบ target เดียวกับระดับอำเภอ (monthly_data.target)
 */

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

interface GroupOut {
  code: string
  name: string
  rows: number
  fields: Record<string, number>
  calcValue: number | null
  status: KpiEvalStatus | null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const kpiId = searchParams.get('kpiId')
  const monthParam = searchParams.get('month') || ''
  if (!kpiId) return NextResponse.json({ ok: false, message: 'ต้องระบุ kpiId' }, { status: 400 })

  const conn = await pool.getConnection()
  try {
    // ── KPI meta + mapping (ชุดเดียวกับ batch/scorecard) ──────────────────
    const [kpiRows] = await conn.execute(
      `SELECT id, name, category, owner, unit, target, description, moph_table, manual_entry,
              COALESCE(evaluation_direction,'gte') AS direction,
              moph_value_field, moph_target_field, moph_calc_mode, moph_config
       FROM kpi_reports WHERE id = ?`, [kpiId])
    const kpi = (kpiRows as Record<string, unknown>[])[0]
    if (!kpi) return NextResponse.json({ ok: false, message: 'ไม่พบ KPI' }, { status: 404 })
    const manual = isManualEntry(kpi.manual_entry) // KPI กรอกมือ → หน้า drilldown ทำตารางให้แก้ไขได้

    let mapping: MophMapping
    if (manual) {
      // manual เก็บข้อมูลเป็น {target,result} เสมอ (ผ่าน /api/monthly/detail)
      // → บังคับ result/target ไม่สน moph_config/field config เดิม (กันเพี้ยนตอน toggle auto→manual)
      mapping = buildMappingFromLegacy('result', 'target', 'percent')
    } else if (kpi.moph_config) {
      try { mapping = JSON.parse(kpi.moph_config as string) as MophMapping }
      catch {
        mapping = buildMappingFromLegacy(
          (kpi.moph_value_field as string) || 'result',
          kpi.moph_target_field as string, kpi.moph_calc_mode as string)
      }
    } else {
      mapping = buildMappingFromLegacy(
        (kpi.moph_value_field as string) || 'result',
        kpi.moph_target_field as string, kpi.moph_calc_mode as string)
    }

    // ── เดือนที่มี detail ──────────────────────────────────────────────────
    const [mRows] = await conn.execute(
      'SELECT DISTINCT month FROM moph_monthly_detail WHERE kpi_id = ? ORDER BY month', [kpiId])
    const months = (mRows as { month: string }[]).map((r) => r.month)
    if (months.length === 0) {
      return NextResponse.json({
        ok: true, kpiId, months: [], manual,
        kpi: { name: kpi.name, category: kpi.category, owner: kpi.owner, unit: kpi.unit,
               direction: kpi.direction, description: kpi.description, target: Number(kpi.target ?? 0) },
        savedMonthly: null, stale: manual, lastMonth: null,
        message: manual
          ? 'KPI นี้กรอกค่าเอง — ยังไม่มีข้อมูล (admin กรอกรายตำบลได้ด้านล่าง)'
          : 'ยังไม่มีข้อมูล detail (ระบบเริ่มเก็บอัตโนมัติ มิ.ย. 2569)',
      })
    }
    const month = monthParam && months.includes(monthParam) ? monthParam : months[months.length - 1]

    // ── target ของเดือนนั้นจาก monthly_data (เกณฑ์เดียวกับ Scorecard) + audit ──────
    const [mdRows] = await conn.execute(
      'SELECT value, target, source, entered_by, entered_at FROM monthly_data WHERE kpi_id = ? AND month = ?', [kpiId, month])
    const md = (mdRows as { value: number; target: number; source: string | null; entered_by: string | null; entered_at: string | null }[])[0] ?? null
    const evalTarget = md ? Number(md.target) : Number(kpi.target ?? 0)
    const direction = kpi.direction as EvalDirection

    // เตือน stale: ยังไม่ได้กรอก monthly_data ของเดือนปัจจุบัน (ใช้กับ manual)
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const [allMd] = await conn.execute(
      'SELECT MAX(month) AS lastMonth, MAX(CASE WHEN month=? THEN 1 ELSE 0 END) AS hasCur FROM monthly_data WHERE kpi_id = ?',
      [thisMonth, kpiId])
    const mdAgg = (allMd as { lastMonth: string | null; hasCur: number }[])[0]

    // ── detail rows → group ตามตำบล ───────────────────────────────────────
    const [dRows] = await conn.execute(
      'SELECT hospcode, areacode, data FROM moph_monthly_detail WHERE kpi_id = ? AND month = ?',
      [kpiId, month])
    const detail = dRows as { hospcode: string; areacode: string; data: string }[]

    const byTambon = new Map<string, Record<string, unknown>[]>()
    const allRows: Record<string, unknown>[] = []
    for (const r of detail) {
      let d: Record<string, unknown>
      try { d = JSON.parse(r.data) } catch { continue }
      const t = tambonCodeOf(r.areacode)
      if (!byTambon.has(t)) byTambon.set(t, [])
      byTambon.get(t)!.push(d)
      allRows.push(d)
    }

    const sumFields = (rows: Record<string, unknown>[]) => {
      const out: Record<string, number> = {}
      for (const r of rows) for (const [k, v] of Object.entries(r)) out[k] = (out[k] ?? 0) + num(v)
      return out
    }

    const evalGroup = (rows: Record<string, unknown>[]): { calcValue: number | null; status: KpiEvalStatus | null } => {
      const res = computeMoph(rows, mapping)
      if (res.errors.length > 0 || res.calcValue === null) return { calcValue: null, status: null }
      return { calcValue: res.calcValue, status: evaluateKpiStatus(res.calcValue, evalTarget, direction).status }
    }

    const groups: GroupOut[] = [...byTambon.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, rows]) => ({
        code, name: tambonNameOf(code), rows: rows.length,
        fields: sumFields(rows), ...evalGroup(rows),
      }))

    const totalEval = evalGroup(allRows)
    const total: GroupOut = {
      code: 'all', name: 'รวมอำเภอ', rows: allRows.length,
      fields: sumFields(allRows), ...totalEval,
    }

    // ลำดับคอลัมน์: target/value fields ของ mapping ก่อน แล้วที่เหลือเรียงชื่อ
    const mappingFields = [...(mapping.targetFields ?? []), ...mapping.valueFields]
    const rest = Object.keys(total.fields).filter((f) => !mappingFields.includes(f)).sort()
    let fieldList = [...mappingFields.filter((f) => f in total.fields), ...rest]

    // ป้ายไทย + จัดลำดับคอลัมน์ตาม label map (ถ้ามี) — ให้หน้า generic อ่านง่ายแบบ HDC
    // ไม่มี map → ใช้ชื่อ field ดิบ + ลำดับเดิม (KPI อื่นไม่กระทบ)
    const labelMap = fieldLabelsFor(kpi.moph_table as string)
    if (labelMap) {
      const ordered = Object.keys(labelMap).filter((f) => f in total.fields)
      fieldList = [...ordered, ...fieldList.filter((f) => !(f in labelMap))]
    }
    const fieldLabels: Record<string, string> = {}
    for (const f of fieldList) fieldLabels[f] = labelMap?.[f] ?? f

    // mapping ใช้ได้จริงไหม (KPI ที่ BLOCK จะ error → UI งดแสดง %)
    const engineCheck = computeMoph(allRows, mapping)

    return NextResponse.json({
      ok: true, kpiId, month, months,
      kpi: {
        name: kpi.name, category: kpi.category, owner: kpi.owner, unit: kpi.unit,
        direction, description: kpi.description,
        target: evalTarget,
      },
      savedMonthly: md
        ? { value: Number(md.value), target: Number(md.target), enteredBy: md.entered_by, enteredAt: md.entered_at }
        : null,
      manual,
      stale: manual && !mdAgg?.hasCur, // manual + ยังไม่กรอกเดือนปัจจุบัน
      lastMonth: mdAgg?.lastMonth ?? null,
      mappingOk: engineCheck.errors.length === 0,
      mappingErrors: engineCheck.errors,
      fieldList, fieldLabels, groups, total,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
