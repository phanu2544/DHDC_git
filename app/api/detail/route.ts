import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { buildMappingFromLegacy, computeMoph } from '@/lib/mophEngine'
import { evaluateKpiStatus } from '@/lib/kpiStatus'
import { tambonCodeOf, tambonNameOf, hospcodeNameOf, HOSPCODE_NAMES } from '@/lib/areaRef'
import { fieldLabelsFor, legendFor } from '@/lib/detailLabels'
import { isManualEntry, manualScopeOf } from '@/lib/manualKpi'
import { COOKIE_NAME, verifySession } from '@/lib/auth'
import { canEditManualKpi } from '@/lib/kpiOwnership'
import { fetchMOPH, currentMophFiscalYear } from '@/lib/mophBatch'
import { filterSummaryFields } from '@/lib/mophDetail'
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
  const viewParam = searchParams.get('view') === 'unit' ? 'unit' : 'area' // มุมมอง: รายตำบล (area) / รายหน่วยบริการ (unit)
  if (!kpiId) return NextResponse.json({ ok: false, message: 'ต้องระบุ kpiId' }, { status: 400 })

  // สิทธิ์แก้ไข (manual KPI เท่านั้น) — reuse กฎเดียวกับ /api/monthly/detail (lib/kpiOwnership.ts)
  const token = req.cookies.get(COOKIE_NAME)?.value
  const session = token ? await verifySession(token) : null

  const conn = await pool.getConnection()
  try {
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    // ── KPI meta + mapping (ชุดเดียวกับ batch/scorecard) ──────────────────
    const [kpiRows] = await conn.execute(
      `SELECT id, name, category, owner, unit, target, description, moph_table, manual_entry, manual_scope,
              COALESCE(evaluation_direction,'gte') AS direction,
              moph_value_field, moph_target_field, moph_calc_mode, moph_config
       FROM kpi_reports WHERE id = ?`, [kpiId])
    const kpi = (kpiRows as Record<string, unknown>[])[0]
    if (!kpi) return NextResponse.json({ ok: false, message: 'ไม่พบ KPI' }, { status: 404 })
    const manual = isManualEntry(kpi.manual_entry) // KPI กรอกมือ → หน้า drilldown ทำตารางให้แก้ไขได้
    const manualScope = manualScopeOf(kpi.manual_scope)
    // canEdit = สิทธิ์เจ้าของ KPI เท่านั้น (ไม่ผูกกับเดือนที่กำลังดู) — เช็กครั้งเดียว reuse ทุก branch
    // เดือนแก้ได้ไหม (staff เฉพาะเดือนปัจจุบัน) ให้ frontend เช็กเองจาก entryMonth (isEditableMonth ฝั่ง client)
    // เพราะ entryMonth อาจเปลี่ยนหลังโหลด (auto-jump ไปเดือนปัจจุบัน) โดยไม่ได้ re-fetch — ส่วนการเขียนจริง
    // ฝั่ง POST /api/monthly/detail และ /single ยัง enforce isEditableMonth เข้มงวดเสมอ ไม่ว่า UI จะโชว์ยังไง
    const canEdit = manual && session ? await canEditManualKpi(conn, session, kpiId) : false

    // ── manual scope='single' — ค่าเดียว ไม่มี moph_monthly_detail ให้ดู แยก branch อ่านจาก monthly_data ล้วน ──
    if (manual && manualScope === 'single') {
      const [monthRows] = await conn.execute(
        'SELECT DISTINCT month FROM monthly_data WHERE kpi_id = ? ORDER BY month', [kpiId])
      const singleMonths = (monthRows as { month: string }[]).map((r) => r.month)
      const singleMonth = monthParam && singleMonths.includes(monthParam) ? monthParam : (singleMonths[singleMonths.length - 1] ?? null)

      const [mdRows] = await conn.execute(
        'SELECT value, target, source, entered_by, entered_at FROM monthly_data WHERE kpi_id = ? AND month = ?',
        [kpiId, singleMonth ?? ''])
      const md = (mdRows as { value: number; target: number; source: string | null; entered_by: string | null; entered_at: string | null }[])[0] ?? null

      const [allMd] = await conn.execute(
        'SELECT MAX(month) AS lastMonth, MAX(CASE WHEN month=? THEN 1 ELSE 0 END) AS hasCur FROM monthly_data WHERE kpi_id = ?',
        [thisMonth, kpiId])
      const mdAgg = (allMd as { lastMonth: string | null; hasCur: number }[])[0]

      return NextResponse.json({
        ok: true, kpiId, month: singleMonth, months: singleMonths, manual, manualScope, canEdit,
        kpi: { name: kpi.name, category: kpi.category, owner: kpi.owner, unit: kpi.unit,
               direction: kpi.direction, description: kpi.description, target: Number(kpi.target ?? 0) },
        savedMonthly: md
          ? { value: Number(md.value), target: Number(md.target), enteredBy: md.entered_by, enteredAt: md.entered_at }
          : null,
        stale: !mdAgg?.hasCur,
        lastMonth: mdAgg?.lastMonth ?? null,
        live: false,
        message: singleMonths.length === 0 ? 'KPI นี้กรอกค่าเอง (ค่าเดียว) — ยังไม่มีข้อมูล (กรอกได้ด้านล่าง)' : undefined,
      })
    }

    const isLive = monthParam === 'live' && !manual && !!(kpi.moph_table as string)

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
    if (months.length === 0 && !isLive) {
      return NextResponse.json({
        ok: true, kpiId, months: [], manual, manualScope, canEdit,
        kpi: { name: kpi.name, category: kpi.category, owner: kpi.owner, unit: kpi.unit,
               direction: kpi.direction, description: kpi.description, target: Number(kpi.target ?? 0) },
        savedMonthly: null, stale: manual, lastMonth: null,
        message: manual
          ? 'KPI นี้กรอกค่าเอง — ยังไม่มีข้อมูล (กรอกรายหน่วยบริการได้ด้านล่าง)'
          : 'ยังไม่มีข้อมูล detail (ระบบเริ่มเก็บอัตโนมัติ มิ.ย. 2569)',
      })
    }
    const month = isLive ? thisMonth : (monthParam && months.includes(monthParam) ? monthParam : months[months.length - 1])

    // ── target ของเดือนนั้นจาก monthly_data (เกณฑ์เดียวกับ Scorecard) + audit ──────
    const [mdRows] = await conn.execute(
      'SELECT value, target, source, entered_by, entered_at FROM monthly_data WHERE kpi_id = ? AND month = ?', [kpiId, month])
    const md = (mdRows as { value: number; target: number; source: string | null; entered_by: string | null; entered_at: string | null }[])[0] ?? null
    const evalTarget = md ? Number(md.target) : Number(kpi.target ?? 0)
    const direction = kpi.direction as EvalDirection

    // เตือน stale: ยังไม่ได้กรอก monthly_data ของเดือนปัจจุบัน (ใช้กับ manual)
    const [allMd] = await conn.execute(
      'SELECT MAX(month) AS lastMonth, MAX(CASE WHEN month=? THEN 1 ELSE 0 END) AS hasCur FROM monthly_data WHERE kpi_id = ?',
      [thisMonth, kpiId])
    const mdAgg = (allMd as { lastMonth: string | null; hasCur: number }[])[0]

    // ── detail rows: live (สดจาก MOPH) หรือ snapshot (moph_monthly_detail) ───
    let detail: { hospcode: string; areacode: string; data: string }[]
    let liveError: string | undefined
    if (isLive) {
      try {
        const AREACODE_PREFIX = process.env.MOPH_FETCH_AREACODE ?? '6611'
        const rawRows = await fetchMOPH(String(kpi.moph_table), currentMophFiscalYear(), '66')
        const scopeRows = rawRows.filter((r) => String(r.areacode ?? '').startsWith(AREACODE_PREFIX))
        detail = scopeRows.map((r) => ({
          hospcode: String(r.hospcode ?? ''),
          areacode: String(r.areacode ?? ''),
          data: JSON.stringify(filterSummaryFields(r, String(kpi.moph_table))),
        }))
      } catch (e) {
        liveError = String(e)
        detail = []
      }
    } else {
      const [dRows] = await conn.execute(
        'SELECT hospcode, areacode, data FROM moph_monthly_detail WHERE kpi_id = ? AND month = ?',
        [kpiId, month])
      detail = dRows as { hospcode: string; areacode: string; data: string }[]
    }

    // มุมมอง: manual เก็บราย hospcode จริง → บังคับรายหน่วยบริการ
    // (manual กรอกราย hospcode เพราะ hospcode→tambon ไม่ใช่ 1:1 — ดู /api/monthly/detail)
    const grpView = manual ? 'unit' : viewParam
    const keyOf = (r: { hospcode: string; areacode: string }) =>
      grpView === 'unit' ? String(r.hospcode ?? '') : tambonCodeOf(r.areacode)
    const nameOf = (key: string) =>
      grpView === 'unit' ? hospcodeNameOf(key) : tambonNameOf(key)

    const byGroup = new Map<string, Record<string, unknown>[]>()
    const allRows: Record<string, unknown>[] = []
    for (const r of detail) {
      let d: Record<string, unknown>
      try { d = JSON.parse(r.data) } catch { continue }
      const k = keyOf(r)
      if (!byGroup.has(k)) byGroup.set(k, [])
      byGroup.get(k)!.push(d)
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

    const groups: GroupOut[] = [...byGroup.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, rows]) => ({
        code, name: nameOf(code), rows: rows.length,
        fields: sumFields(rows), ...evalGroup(rows),
      }))

    // unit view: inject hospcodes ที่ไม่มีข้อมูลเป็น row "ไม่มีข้อมูล" (ไม่ตัดทิ้ง = รู้ว่าหน่วยไหนขาด)
    if (grpView === 'unit') {
      const have = new Set(groups.map((g) => g.code))
      for (const code of Object.keys(HOSPCODE_NAMES)) {
        if (!have.has(code)) {
          groups.push({ code, name: hospcodeNameOf(code), rows: 0, fields: {}, calcValue: null, status: null })
        }
      }
      groups.sort((a, b) => a.code.localeCompare(b.code))
    }

    const totalEval = evalGroup(allRows)
    const total: GroupOut = {
      code: 'all', name: 'รวมอำเภอ', rows: allRows.length,
      fields: sumFields(allRows), ...totalEval,
    }

    // ลำดับคอลัมน์: target/value fields ของ mapping ก่อน แล้วที่เหลือเรียงชื่อ
    const mappingFields = [...(mapping.targetFields ?? []), ...mapping.valueFields]
    const rest = Object.keys(total.fields).filter((f) => !mappingFields.includes(f)).sort()
    let fieldList = [...mappingFields.filter((f) => f in total.fields), ...rest]

    // ป้ายไทย + เลือก/จัดลำดับคอลัมน์ตาม label map (ถ้ามี) — ให้หน้า generic อ่านง่ายแบบ HDC
    // มี map → โชว์**เฉพาะ**คอลัมน์ที่กำหนด (whitelist + ลำดับ + ป้ายไทย) · ไม่มี map → field ดิบทั้งหมด (KPI อื่นไม่กระทบ)
    const labelMap = fieldLabelsFor(kpi.moph_table as string)
    if (labelMap) {
      fieldList = Object.keys(labelMap).filter((f) => f in total.fields)
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
      manual, manualScope, canEdit, view: grpView,
      stale: manual && !mdAgg?.hasCur, // manual + ยังไม่กรอกเดือนปัจจุบัน
      lastMonth: mdAgg?.lastMonth ?? null,
      live: isLive,
      liveError,
      legend: legendFor(kpi.moph_table as string),
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
