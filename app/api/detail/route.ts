import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { buildMappingFromLegacy, computeMoph, DISTRICT_ONLY_TABLES } from '@/lib/mophEngine'
import { evaluateKpiStatus } from '@/lib/kpiStatus'
import { tambonCodeOf, tambonNameOf, hospcodeNameOf, HOSPCODE_NAMES, TAMBON_NAMES, DISTRICT_NAME } from '@/lib/areaRef'
import { fieldLabelsFor, legendFor } from '@/lib/detailLabels'
import { isManualEntry, manualScopeOf } from '@/lib/manualKpi'
import { COOKIE_NAME, verifySession } from '@/lib/auth'
import { canEditManualKpi } from '@/lib/kpiOwnership'
import { reportFreqOf } from '@/lib/fiscalQuarter'
import { currentMophFiscalYear } from '@/lib/mophBatch'
import { fetchMophRows } from '@/lib/mophFetch'
import { filterSummaryFields } from '@/lib/mophDetail'
import { applyBaselineToMapping, loadBaselineRows, previousFiscalYear } from '@/lib/baselineYear'
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
      `SELECT id, name, category, owner, unit, target, description, moph_table, manual_entry, manual_scope, measure_type, text_options, report_freq, rate_per,
              COALESCE(evaluation_direction,'gte') AS direction,
              moph_value_field, moph_target_field, moph_calc_mode, moph_config
       FROM kpi_reports WHERE id = ?`, [kpiId])
    const kpi = (kpiRows as Record<string, unknown>[])[0]
    if (!kpi) return NextResponse.json({ ok: false, message: 'ไม่พบ KPI' }, { status: 404 })
    const manual = isManualEntry(kpi.manual_entry) // KPI กรอกมือ → หน้า drilldown ทำตารางให้แก้ไขได้
    const manualScope = manualScopeOf(kpi.manual_scope)
    // สิทธิ์เจ้าของ KPI — เช็กครั้งเดียว reuse ทุก branch (ไม่ผูกกับเดือนที่กำลังดู)
    // เดือนแก้ได้ไหม (staff เฉพาะเดือนปัจจุบัน) ให้ frontend เช็กเองจากเดือนที่แสดง (isEditableMonth ฝั่ง client)
    // เพราะเดือนอาจเปลี่ยนหลังโหลด (auto-jump ไปเดือนปัจจุบัน) โดยไม่ได้ re-fetch — ส่วนการเขียนจริง
    // ฝั่ง POST (/api/monthly/detail, /single, /api/kpi-notes) ยัง enforce isEditableMonth เข้มงวดเสมอ
    const isKpiOwner = session ? await canEditManualKpi(conn, session, kpiId) : false
    // canEdit = แก้ "ผลงาน" ได้ → เฉพาะ KPI ที่กรอกมือ (auto มาจาก MOPH ห้ามพิมพ์ทับ)
    const canEdit = manual && isKpiOwner
    // canEditNotes = แก้ "บันทึกเชิงคุณภาพ" (L2) ได้ → ทุก KPI ไม่ว่า auto หรือ manual
    // (ตัวชี้วัดตรวจราชการบางข้อผูกกับ KPI auto เดิม เช่น DM/HT, DSPM — ต้องเขียนปัญหา/แนวทางได้ด้วย)
    const canEditNotes = isKpiOwner
    // L4: ความถี่รายงาน — หน้า /kpi/[id] ใช้เลือกว่าจะโชว์ตัวเลือกเดือนหรือไตรมาส
    const reportFreq = reportFreqOf(kpi.report_freq)

    // ── manual scope='single' — ค่าเดียว ไม่มี moph_monthly_detail ให้ดู แยก branch อ่านจาก monthly_data ล้วน ──
    if (manual && manualScope === 'single') {
      const [monthRows] = await conn.execute(
        'SELECT DISTINCT month FROM monthly_data WHERE kpi_id = ? ORDER BY month', [kpiId])
      const singleMonths = (monthRows as { month: string }[]).map((r) => r.month)
      const singleMonth = monthParam && singleMonths.includes(monthParam) ? monthParam : (singleMonths[singleMonths.length - 1] ?? null)

      const [mdRows] = await conn.execute(
        'SELECT value, target, value_text, source, entered_by, entered_at, raw_target, raw_result FROM monthly_data WHERE kpi_id = ? AND month = ?',
        [kpiId, singleMonth ?? ''])
      const md = (mdRows as { value: number; target: number; value_text: string | null; source: string | null; entered_by: string | null; entered_at: string | null; raw_target: number | null; raw_result: number | null }[])[0] ?? null

      const [allMd] = await conn.execute(
        'SELECT MAX(month) AS lastMonth, MAX(CASE WHEN month=? THEN 1 ELSE 0 END) AS hasCur FROM monthly_data WHERE kpi_id = ?',
        [thisMonth, kpiId])
      const mdAgg = (allMd as { lastMonth: string | null; hasCur: number }[])[0]

      return NextResponse.json({
        ok: true, kpiId, month: singleMonth, months: singleMonths, manual, manualScope, canEdit, canEditNotes, reportFreq,
        measureType: kpi.measure_type === 'text' || kpi.measure_type === 'level' ? kpi.measure_type : 'numeric',
        textOptions: (kpi.text_options as string | null) ?? null,
        kpi: { name: kpi.name, category: kpi.category, owner: kpi.owner, unit: kpi.unit,
               direction: kpi.direction, description: kpi.description, target: Number(kpi.target ?? 0),
               ratePer: Number(kpi.rate_per) || 100 },
        savedMonthly: md
          ? { value: Number(md.value), target: Number(md.target), valueText: md.value_text, enteredBy: md.entered_by, enteredAt: md.entered_at,
              rawTarget: md.raw_target != null ? Number(md.raw_target) : null, rawResult: md.raw_result != null ? Number(md.raw_result) : null }
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

    // calcMode='percentIncrease' → เติมยอดปีฐานจาก kpi_baseline_year (ถ้ายังไม่เก็บ = ใช้ค่าคงที่ใน config)
    mapping = await applyBaselineToMapping(conn, kpiId, mapping, currentMophFiscalYear())

    // ── เดือนที่มี detail ──────────────────────────────────────────────────
    const [mRows] = await conn.execute(
      'SELECT DISTINCT month FROM moph_monthly_detail WHERE kpi_id = ? ORDER BY month', [kpiId])
    const months = (mRows as { month: string }[]).map((r) => r.month)
    if (months.length === 0 && !isLive) {
      return NextResponse.json({
        ok: true, kpiId, months: [], manual, manualScope, canEdit, canEditNotes, reportFreq,
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
        const rawRows = await fetchMophRows(String(kpi.moph_table), currentMophFiscalYear(), '66')
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

    // ตารางระดับอำเภอเท่านั้น (DISTRICT_ONLY_TABLES) — hospcode/areacode ที่ติดมาไม่ใช่ของจริง
    // (พิสูจน์แล้วกับ s_child0_5_pshyche_develop_coverage) → ไม่แยกราย ตำบล/หน่วยบริการ โชว์แถวเดียว
    const isDistrictOnly = DISTRICT_ONLY_TABLES.has(String(kpi.moph_table))

    const groups: GroupOut[] = isDistrictOnly ? [] : [...byGroup.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, rows]) => ({
        code, name: nameOf(code), rows: rows.length,
        fields: sumFields(rows), ...evalGroup(rows),
      }))

    // unit view: inject hospcodes ที่ไม่มีข้อมูลเป็น row "ไม่มีข้อมูล" (ไม่ตัดทิ้ง = รู้ว่าหน่วยไหนขาด)
    if (!isDistrictOnly && grpView === 'unit') {
      const have = new Set(groups.map((g) => g.code))
      for (const code of Object.keys(HOSPCODE_NAMES)) {
        if (!have.has(code)) {
          groups.push({ code, name: hospcodeNameOf(code), rows: 0, fields: {}, calcValue: null, status: null })
        }
      }
      groups.sort((a, b) => a.code.localeCompare(b.code))
    }

    // area view: inject ตำบลที่ไม่มีข้อมูลเป็น row "ไม่มีข้อมูล" — เหมือน unit view ด้านบน
    // (สำคัญกับ KPI ระดับโรงพยาบาลอย่าง sepsis ที่มีข้อมูลจริงแค่ 1 ตำบล — ให้เห็นว่าตำบลอื่นไม่มีข้อมูล ไม่ใช่ดึงตกหล่น)
    if (!isDistrictOnly && grpView === 'area') {
      const have = new Set(groups.map((g) => g.code))
      for (const code of Object.keys(TAMBON_NAMES)) {
        if (!have.has(code)) {
          groups.push({ code, name: tambonNameOf(code), rows: 0, fields: {}, calcValue: null, status: null })
        }
      }
      groups.sort((a, b) => a.code.localeCompare(b.code))
    }

    const totalEval = evalGroup(allRows)
    const total: GroupOut = {
      code: 'all', name: 'รวมอำเภอ', rows: allRows.length,
      fields: sumFields(allRows), ...totalEval,
    }
    // DISTRICT_ONLY_TABLES: groups มีแถวเดียว "อำเภอดงเจริญ" (ไม่มีตำบล/หน่วยบริการจริงให้แยก)
    // ให้กราฟ+ตารางยังมีแถวให้เห็น ไม่ใช่ว่าง — ส่วน total ยังส่งไปเป็นแหล่งข้อมูลการ์ดสรุปด้านบนตามปกติ
    // (หน้าเว็บซ่อนแถว "รวมอำเภอ" ซ้ำเองเมื่อ groups.length===1 — ดู app/kpi/[id]/page.tsx)
    if (isDistrictOnly) groups.push({ ...total, name: DISTRICT_NAME })

    // ลำดับคอลัมน์: target/value fields ของ mapping ก่อน แล้วที่เหลือเรียงชื่อ
    const mappingFields = [...(mapping.targetFields ?? []), ...mapping.valueFields]
    const rest = Object.keys(total.fields).filter((f) => !mappingFields.includes(f)).sort()
    let fieldList = [...mappingFields.filter((f) => f in total.fields), ...rest]

    // ป้ายไทย + เลือก/จัดลำดับคอลัมน์ตาม label map (ถ้ามี) — ให้หน้า generic อ่านง่ายแบบ HDC
    // มี map → โชว์**เฉพาะ**คอลัมน์ที่กำหนด (whitelist + ลำดับ + ป้ายไทย) · ไม่มี map → field ดิบทั้งหมด (KPI อื่นไม่กระทบ)
    //
    // ⚠️ KPI กรอกมือ **ห้ามใช้ whitelist ของ moph_table** — ข้อมูลที่คนกรอกเก็บเป็น {target,result} เสมอ
    // แต่ whitelist ผูกกับชื่อ field ของ MOPH (เช่น cavity-free = c/b/a · s_ncd_bp = b1/r1/a1)
    // ถ้ากรองด้วย whitelist หลังกรอกมือจะไม่เหลือคอลัมน์ให้แสดงเลย (ตาราง drilldown ว่างเปล่า)
    // เคสจริงที่เจอได้: MOPH API ล่ม → ติ๊ก "กรอกค่าเอง" ชั่วคราว → คีย์มือ → ตารางหาย
    const labelMap = manual ? null : fieldLabelsFor(kpi.moph_table as string)
    if (labelMap) {
      fieldList = Object.keys(labelMap).filter((f) => f in total.fields)
    } else if (manual) {
      // ใช้ target/result ตรงๆ (ตรงกับที่ฟอร์มกรอก) · ถ้ายังไม่เคยกรอกทับ (ยังเป็น snapshot auto เดิม
      // ที่ชื่อ field คนละชุด) ให้ fallback เป็น field ดิบทั้งหมด — ดีกว่าโชว์ตารางว่าง
      const preferred = ['target', 'result'].filter((f) => f in total.fields)
      fieldList = preferred.length > 0 ? preferred : Object.keys(total.fields).sort()
    }
    // ทศนิยมคงที่ต่อคอลัมน์ (เช่นคอลัมน์ร้อยละ ต้องโชว์ 29.80 ไม่ใช่ 29.8) · ป้ายคอลัมน์ "ผลงาน" เฉพาะ KPI
    let fieldDecimals: Record<string, number> | undefined
    let pctLabel: string | undefined
    let pctDecimals: number | undefined
    // หัวตาราง 2 ชั้น: กลุ่มคอลัมน์ (เช่น ปีงบ 2568 / 2569) ครอบคอลัมน์ย่อย — ไม่มี = หัวชั้นเดียวแบบเดิม
    let fieldGroups: { label: string; fields: string[]; sub?: { label: string; fields: string[] }[] }[] | undefined
    const MANUAL_LABELS: Record<string, string> = { target: 'กลุ่มเป้าหมาย (B)', result: 'ผลงาน (A)' }
    const fieldLabels: Record<string, string> = {}
    for (const f of fieldList) fieldLabels[f] = labelMap?.[f] ?? (manual ? MANUAL_LABELS[f] ?? f : f)

    // s_kpi_sepsis_septic: ยุบ D/A/B/C รายไตรมาส (16 field ดิบ) เป็นผลรวมทั้งปีงบ + คอลัมน์ A+C
    // (owner ขอตารางแบบสั้น — ทุก field เป็นยอดสะสมปีงบอยู่แล้วจึงรวม 4 ไตรมาสตรงๆ ได้ ไม่ต้องเฉลี่ย)
    // !manual: ถ้าสลับเป็นกรอกมือ ข้อมูลจะเป็น {target,result} ไม่มี field ไตรมาสให้ยุบ (จะได้ 0 ทุกช่อง)
    if (kpi.moph_table === 's_kpi_sepsis_septic' && !manual) {
      const collapse = (f: Record<string, number>) => {
        const D = (f.targetq1 ?? 0) + (f.targetq2 ?? 0) + (f.targetq3 ?? 0) + (f.targetq4 ?? 0)
        const A = (f.resultq1 ?? 0) + (f.resultq2 ?? 0) + (f.resultq3 ?? 0) + (f.resultq4 ?? 0)
        const B = (f.result2q1 ?? 0) + (f.result2q2 ?? 0) + (f.result2q3 ?? 0) + (f.result2q4 ?? 0)
        const C = (f.result3q1 ?? 0) + (f.result3q2 ?? 0) + (f.result3q3 ?? 0) + (f.result3q4 ?? 0)
        return { D, A, B, C, 'A+C': A + C }
      }
      for (const g of groups) g.fields = collapse(g.fields)
      total.fields = collapse(total.fields)
      fieldList = ['D', 'A', 'B', 'C', 'A+C']
      for (const k of Object.keys(fieldLabels)) delete fieldLabels[k]
      for (const k of fieldList) fieldLabels[k] = k
    }

    // s_ttm35 (#45): ยุบ op_service/tm_service รายไตรมาส (8 field ดิบ ไม่สื่อความหมาย) เป็นเป้าหมาย/ผลงานสะสมปีงบ
    // เหมือน sepsis ด้านบน — mapping ก็รวม 4 ไตรมาสแบบเดียวกันอยู่แล้ว (calcMode=percent, sumFields)
    if (kpi.moph_table === 's_ttm35' && !manual) {
      const collapse = (f: Record<string, number>) => {
        const เป้าหมาย = (f.op_service_q1 ?? 0) + (f.op_service_q2 ?? 0) + (f.op_service_q3 ?? 0) + (f.op_service_q4 ?? 0)
        const ผลงาน = (f.tm_service_q1 ?? 0) + (f.tm_service_q2 ?? 0) + (f.tm_service_q3 ?? 0) + (f.tm_service_q4 ?? 0)
        return { เป้าหมาย, ผลงาน }
      }
      for (const g of groups) g.fields = collapse(g.fields)
      total.fields = collapse(total.fields)
      fieldList = ['เป้าหมาย', 'ผลงาน']
      for (const k of Object.keys(fieldLabels)) delete fieldLabels[k]
      for (const k of fieldList) fieldLabels[k] = k
    }

    // s_stroke_admit_death (#9): ยุบ 48 field ดิบ เหลือเฉพาะ "I60-I64" ตรงนิยามตัวชี้วัด
    // ตารางนี้มี 2 วิธีแบ่งซ้อนกัน (รวม I60-69 · แยก I60-62/I63/I64-69 · แยก I60-64/I65-69)
    // ⚠️ ตัวชี้วัดนิยาม I60-I64 → ต้องใช้ *_6064 เท่านั้น · ห้ามใช้ targetqN/resultqN (= I60-I69 กว้างกว่านิยาม)
    // ตอนนี้ดงเจริญ 2 ชุดนี้ค่าเท่ากันเพราะไม่มีผู้ป่วย I65-69 เลย — "บังเอิญถูก" ไม่ใช่ถูกจริง
    // ⚠️ ตัวเศษสะกด results (มี s) แต่ตัวหาร target (ไม่มี s) — ชื่อไม่สมมาตร พิมพ์ผิดง่าย
    if (kpi.moph_table === 's_stroke_admit_death' && !manual) {
      const collapse = (f: Record<string, number>) => {
        const discharged = (f.targetq1_6064 ?? 0) + (f.targetq2_6064 ?? 0) + (f.targetq3_6064 ?? 0) + (f.targetq4_6064 ?? 0)
        const died       = (f.resultsq1_6064 ?? 0) + (f.resultsq2_6064 ?? 0) + (f.resultsq3_6064 ?? 0) + (f.resultsq4_6064 ?? 0)
        return { 'ผู้ป่วยจำหน่าย (ครั้ง)': discharged, 'เสียชีวิต (ครั้ง)': died }
      }
      for (const g of groups) g.fields = collapse(g.fields)
      total.fields = collapse(total.fields)
      fieldList = ['ผู้ป่วยจำหน่าย (ครั้ง)', 'เสียชีวิต (ครั้ง)']
      for (const k of Object.keys(fieldLabels)) delete fieldLabels[k]
      for (const k of fieldList) fieldLabels[k] = k
    }

    // s_common_diseases_thai_drug (#46): ตารางเทียบ 2 ปีงบ แบบเดียวกับรายงาน HDC
    // (คน/ครั้ง ของทั้ง "วินิจฉัย"=B และ "ได้ยาสมุนไพร"=A + ร้อยละของแต่ละปี + ร้อยละเพิ่มขึ้น)
    //
    // ปีปัจจุบัน = ดึงสด/snapshot ตามปกติ · ปีฐาน = อ่านจาก kpi_baseline_year (คีย์จากภาพ HDC
    // เพราะ Open Data ปี 2568 แช่แข็งกลางปี ใช้ไม่ได้ — ดู kpi-hdc-api-checklist.md §46)
    //
    // สถานะผ่าน/ไม่ผ่าน: **แถวรวมอำเภอเท่านั้น** (เกณฑ์ทางการตัดสินที่ระดับอำเภอ/ทั้งปีงบ) —
    // แถวตำบล/หน่วยบริการโชว์ตัวเลขให้ดูประกอบ ไม่ตัดสิน (owner เคาะ 18 ส.ค. 2569)
    // แถวที่ปีฐาน=0 → หารไม่ได้ โชว์ 0.00 ตาม convention ของ HDC (owner เคาะ)
    if (kpi.moph_table === 's_common_diseases_thai_drug' && !manual) {
      const baseFY = previousFiscalYear(currentMophFiscalYear())
      const baseRows = await loadBaselineRows(conn, kpiId, baseFY)

      if (baseRows.length > 0) {
        const curFY = Number(currentMophFiscalYear())
        const LB = {
          bPerson: `${baseFY} วินิจฉัย (คน)`,   bTimes: `${baseFY} วินิจฉัย (ครั้ง)`,
          aPerson: `${baseFY} ได้ยาสมุนไพร (คน)`, aTimes: `${baseFY} ได้ยาสมุนไพร (ครั้ง)`,
          pct:     `${baseFY} ร้อยละ`,
        }
        const LC = {
          bPerson: `${curFY} วินิจฉัย (คน)`,    bTimes: `${curFY} วินิจฉัย (ครั้ง)`,
          aPerson: `${curFY} ได้ยาสมุนไพร (คน)`,  aTimes: `${curFY} ได้ยาสมุนไพร (ครั้ง)`,
          pct:     `${curFY} ร้อยละ`,
        }

        // จัดกลุ่มปีฐานด้วยกฎเดียวกับปีปัจจุบัน (unit → hospcode · area → ตำบลจาก areacode)
        const baseByGroup = new Map<string, Record<string, number>>()
        const baseAll: Record<string, number> = {}
        for (const r of baseRows) {
          const k = keyOf(r)
          const acc = baseByGroup.get(k) ?? {}
          for (const [f, v] of Object.entries(r.data)) {
            acc[f]     = (acc[f] ?? 0) + num(v)
            baseAll[f] = (baseAll[f] ?? 0) + num(v)
          }
          baseByGroup.set(k, acc)
        }

        const pct = (a: number, b: number) => (b > 0 ? +((a / b) * 100).toFixed(2) : 0)
        const build = (b: Record<string, number>, c: Record<string, number>) => ({
          [LB.bPerson]: b.person_year_diag ?? 0, [LB.bTimes]: b.times_year_diag ?? 0,
          [LB.aPerson]: b.person_year ?? 0,      [LB.aTimes]: b.times_year ?? 0,
          [LB.pct]:     pct(b.times_year ?? 0, b.times_year_diag ?? 0),
          [LC.bPerson]: c.person_year_diag ?? 0, [LC.bTimes]: c.times_year_diag ?? 0,
          [LC.aPerson]: c.person_year ?? 0,      [LC.aTimes]: c.times_year ?? 0,
          [LC.pct]:     pct(c.times_year ?? 0, c.times_year_diag ?? 0),
        })

        for (const g of groups) {
          const b = baseByGroup.get(g.code) ?? {}
          const c = g.fields
          const c1 = pct(b.times_year ?? 0, b.times_year_diag ?? 0)
          const c2 = pct(c.times_year ?? 0, c.times_year_diag ?? 0)
          g.fields = build(b, c)
          g.calcValue = c1 > 0 ? +(((c2 - c1) / c1) * 100).toFixed(2) : 0
          g.status = null
        }
        // total: ตัวเลขคอลัมน์รวมเอง · calcValue/status ปล่อยเป็นค่าจาก engine (แหล่งเดียวกับการ์ดสรุป)
        total.fields = build(baseAll, total.fields)

        fieldList = [LB.bPerson, LB.bTimes, LB.aPerson, LB.aTimes, LB.pct,
                     LC.bPerson, LC.bTimes, LC.aPerson, LC.aTimes, LC.pct]
        for (const k of Object.keys(fieldLabels)) delete fieldLabels[k]
        // หัวตาราง 3 ชั้นแบบรายงาน HDC: ปีงบ → รายการ → คน/ครั้ง
        // (หัวคอลัมน์ย่อยเหลือแค่ "คน"/"ครั้ง" → ตารางแคบลงมาก และเทียบข้ามปีด้วยตาเปล่าง่ายขึ้น)
        const SHORT = ['คน', 'ครั้ง', 'คน', 'ครั้ง', '']
        fieldList.forEach((k, i) => { fieldLabels[k] = SHORT[i % SHORT.length] })
        const yearGroup = (label: string, f: string[]) => ({
          label, fields: f,
          sub: [
            { label: 'ได้รับการวินิจฉัย', fields: [f[0], f[1]] },
            { label: 'ได้รับยาสมุนไพร',   fields: [f[2], f[3]] },
            { label: 'ร้อยละ',            fields: [f[4]] },
          ],
        })
        fieldGroups = [
          yearGroup(`ปีงบประมาณ ${baseFY}`, fieldList.slice(0, 5)),
          yearGroup(`ปีงบประมาณ ${curFY}`,  fieldList.slice(5)),
        ]
        fieldDecimals = { [LB.pct]: 2, [LC.pct]: 2 }
        pctLabel = 'ร้อยละเพิ่มขึ้น (%)'
        pctDecimals = 2   // 0 → "0.00" ให้เหมือนรายงาน HDC (owner เคาะ 18 ส.ค. 2569)
      } else {
        // ยังไม่มีปีฐานเก็บไว้ → ตารางแบบเดิม 2 คอลัมน์ (อัตราปีนี้ดิบ ไม่มีสถานะรายแถว)
        const raw = (f: Record<string, number>) => ({
          'วินิจฉัย (ครั้ง)':      f.times_year_diag ?? 0,
          'ได้ยาสมุนไพร (ครั้ง)': f.times_year ?? 0,
        })
        for (const g of groups) {
          const b2 = g.fields.times_year_diag ?? 0
          const a2 = g.fields.times_year ?? 0
          g.fields = raw(g.fields)
          g.calcValue = b2 > 0 ? +((a2 / b2) * 100).toFixed(2) : null
          g.status = null
        }
        total.fields = raw(total.fields)
        fieldList = ['วินิจฉัย (ครั้ง)', 'ได้ยาสมุนไพร (ครั้ง)']
        for (const k of Object.keys(fieldLabels)) delete fieldLabels[k]
        for (const k of fieldList) fieldLabels[k] = k
      }
    }

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
      manual, manualScope, canEdit, canEditNotes, reportFreq, view: grpView,
      stale: manual && !mdAgg?.hasCur, // manual + ยังไม่กรอกเดือนปัจจุบัน
      lastMonth: mdAgg?.lastMonth ?? null,
      live: isLive,
      liveError,
      legend: legendFor(kpi.moph_table as string),
      mappingOk: engineCheck.errors.length === 0,
      mappingErrors: engineCheck.errors,
      fieldList, fieldLabels, fieldDecimals, fieldGroups, pctLabel, pctDecimals, groups, total,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
