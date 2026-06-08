import type { FieldMode, CalcMode, FieldType, MophMapping, MophResult } from './types'

// Fields ที่เป็น identifier/ที่อยู่ → ห้ามใช้เป็น value/target field
const DIMENSION_FIELDS = new Set([
  'hospcode', 'hcode', 'hoscode',
  'areacode', 'changwat', 'amphur', 'tambon', 'province',
  'cid', 'pid', 'hn', 'an', 'hospname', 'name', 'fname', 'lname',
])

// Fields ที่เป็น date/time → เตือนถ้าถูกเลือกเป็น value/target field
const TIME_FIELDS = new Set([
  'month', 'monthly', 'b_year', 'year', 'fyear', 'quarter',
  'date', 'ddate', 'visitdate', 'datediag', 'd_update',
  'updated_at', 'created_at', 'period',
])

/** จัดประเภท field จากชื่อ — ใช้ guard การเลือก value/target ผิด */
export function classifyField(name: string): FieldType {
  const lower = name.toLowerCase()
  if (DIMENSION_FIELDS.has(lower)) return 'dimension'
  if (TIME_FIELDS.has(lower)) return 'time'
  if (lower === 'target' || lower.endsWith('_target') || lower.startsWith('target_') || /^target\d/.test(lower)) return 'target'
  return 'measure'
}

/** จัดประเภททุก field จาก sample row หนึ่งแถว */
export function classifyFields(sampleRow: Record<string, unknown>): Record<string, FieldType> {
  return Object.fromEntries(Object.keys(sampleRow).map((k) => [k, classifyField(k)]))
}

/** แปลง params แบบเดิม (string เดียว) → MophMapping เพื่อ backward compat */
export function buildMappingFromLegacy(
  valueField: string,
  targetField: string | null | undefined,
  calcMode: string,
): MophMapping {
  const cm = (calcMode || 'percent') as CalcMode
  const needTarget = cm === 'percent'
  return {
    fieldMode:   'singleField',
    valueFields: [valueField || 'result'],
    targetMode:  needTarget ? 'field' : 'none',
    targetFields: needTarget ? [targetField || 'target'] : undefined,
    calcMode:    cm,
    aggregate:   'sum',
  }
}

/**
 * คำนวณผลจาก MOPH rows ตาม mapping
 * Pure function — ไม่มี DB / fetch / side-effects
 *
 * - validate: dimension field → error (block), time field → warning, field ไม่มีจริง → error
 * - sumFields: รวมหลาย field ในแถวก่อน แล้วรวมข้ามแถว
 * - percent + sumTarget=0 → calcValue=null + warning (ไม่หารด้วย 0)
 * - raw → ค่าจากแถวแรก (หรือ avg ถ้า aggregate='avg')
 * - noTarget → คำนวณ sumValue ติดตามได้ แต่ calcValue=null, evaluated=false
 */
export function computeMoph(
  rows: Record<string, unknown>[],
  mapping: MophMapping,
): MophResult {
  const warnings: string[] = []
  const errors:   string[] = []

  if (rows.length === 0) {
    return { calcValue: null, sumValue: 0, sumTarget: null, evaluated: false, warnings, errors }
  }

  const sampleRow = rows[0]

  // ── Validate value fields ────────────────────────────────────────────────────
  for (const vf of mapping.valueFields) {
    const ftype = classifyField(vf)
    if (ftype === 'dimension') {
      errors.push(`"${vf}" เป็น dimension field (hospcode/areacode/ฯลฯ) — ใช้เป็น value field ไม่ได้`)
    } else if (ftype === 'time') {
      warnings.push(`"${vf}" ดูเหมือน time field (month/monthly/b_year/ฯลฯ) — ตรวจสอบว่าถูก field หรือไม่`)
    }
    if (!(vf in sampleRow)) {
      const available = Object.keys(sampleRow).slice(0, 10).join(', ')
      errors.push(`ไม่พบ field "${vf}" ในข้อมูล MOPH (fields ที่มี: ${available})`)
    }
  }

  // ── Validate target fields (เฉพาะ targetMode='field') ────────────────────────
  if (mapping.targetMode === 'field') {
    for (const tf of mapping.targetFields ?? []) {
      const ftype = classifyField(tf)
      if (ftype === 'dimension') {
        errors.push(`"${tf}" เป็น dimension field — ใช้เป็น target/denominator field ไม่ได้`)
      } else if (ftype === 'time') {
        warnings.push(`"${tf}" ดูเหมือน time field — ตรวจสอบว่าถูก target field หรือไม่`)
      }
      if (!(tf in sampleRow)) {
        const available = Object.keys(sampleRow).slice(0, 10).join(', ')
        errors.push(`ไม่พบ target field "${tf}" ในข้อมูล MOPH (fields ที่มี: ${available})`)
      }
    }
  }

  if (errors.length > 0) {
    return { calcValue: null, sumValue: 0, sumTarget: null, evaluated: false, warnings, errors }
  }

  // ── Sum value ข้ามแถว (sumFields-aware) ──────────────────────────────────────
  const sumValue = rows.reduce((s, r) => {
    const rowVal =
      mapping.fieldMode === 'sumFields'
        ? mapping.valueFields.reduce((rv, f) => rv + (Number(r[f]) || 0), 0)
        : Number(r[mapping.valueFields[0]]) || 0
    return s + rowVal
  }, 0)

  // ── noTarget — ติดตามอย่างเดียว ไม่ประเมิน ───────────────────────────────────
  if (mapping.calcMode === 'noTarget') {
    return {
      calcValue: null,
      sumValue:  +sumValue.toFixed(2),
      sumTarget: null,
      evaluated: false,
      warnings, errors,
    }
  }

  // ── Sum target ข้ามแถว ───────────────────────────────────────────────────────
  let sumTarget: number | null = null
  if (mapping.targetMode === 'field' && (mapping.targetFields?.length ?? 0) > 0) {
    sumTarget = rows.reduce(
      (s, r) => s + mapping.targetFields!.reduce((tv, f) => tv + (Number(r[f]) || 0), 0),
      0,
    )
  } else if (mapping.targetMode === 'constant' && mapping.constantTarget !== undefined) {
    sumTarget = mapping.constantTarget
  }

  // ── Final calculation ────────────────────────────────────────────────────────
  let calcValue: number | null = null

  if (mapping.calcMode === 'sum') {
    calcValue = +sumValue.toFixed(2)
  } else if (mapping.calcMode === 'raw') {
    calcValue =
      mapping.aggregate === 'avg'
        ? +(sumValue / rows.length).toFixed(2)
        : +(Number(rows[0][mapping.valueFields[0]]) || 0).toFixed(2)
  } else {
    // percent
    if (sumTarget === null) {
      warnings.push('ไม่ระบุ target field — ไม่สามารถคำนวณ % ได้')
    } else if (sumTarget === 0) {
      warnings.push('sumTarget = 0 — ไม่สามารถหารได้ (ข้อมูล target อาจว่างหรือไม่มีในช่วงนี้)')
    } else {
      calcValue = +((sumValue / sumTarget) * 100).toFixed(2)
    }
  }

  return {
    calcValue,
    sumValue:  +sumValue.toFixed(2),
    sumTarget: sumTarget !== null ? +sumTarget.toFixed(2) : null,
    evaluated: true,
    warnings, errors,
  }
}

export { DIMENSION_FIELDS, TIME_FIELDS }
export type { FieldMode, CalcMode, FieldType, MophMapping, MophResult }
