/**
 * Phase 6A — ชื่อพื้นที่อ้างอิง อำเภอดงเจริญ (areacode prefix 6611)
 * ตำบล = areacode หลักที่ 5-6 · ยืนยันชื่อจากตาราง HDC รายตำบลแล้ว
 * (ชื่อ รพ.สต. ราย hospcode จะเพิ่มใน Phase 6B ผ่านตาราง area_ref + admin)
 */
export const DISTRICT_NAME = 'อำเภอดงเจริญ'
export const DISTRICT_PREFIX = '6611'

export const TAMBON_NAMES: Record<string, string> = {
  '01': 'วังงิ้วใต้',
  '02': 'วังงิ้ว',
  '03': 'ห้วยร่วม',
  '04': 'ห้วยพุก',
  '05': 'สำนักขุนเณร',
}

/** คืนรหัสตำบล (2 หลัก) จาก areacode เช่น '66110115' → '01' */
export function tambonCodeOf(areacode: string): string {
  return String(areacode ?? '').slice(4, 6)
}

export function tambonNameOf(code: string): string {
  return TAMBON_NAMES[code] ?? `ตำบล ${code}`
}

/**
 * ชื่อหน่วยบริการ (hospcode) อำเภอดงเจริญ — ยืนยันจาก HDC screenshot ใน data/
 * (owner ปรับชื่อได้ · hospcode นอกรายการนี้ → fallback โชว์รหัส)
 */
export const HOSPCODE_NAMES: Record<string, string> = {
  '07705': 'รพ.สต.บ้านวังก้านเหลือง',
  '07706': 'รพ.สต.วังงิ้วใต้ (ต.วังงิ้ว)',
  '07707': 'รพ.สต.บ้านดงเจริญ (ต.วังงิ้ว)',
  '07708': 'รพ.สต.ห้วยร่วม',
  '07709': 'รพ.สต.ห้วยพุก',
  '07710': 'สอน.เฉลิมพระเกียรติฯ สำนักขุนเณร',
  '27980': 'รพช. ดงเจริญ',
}

export function hospcodeNameOf(code: string): string {
  return HOSPCODE_NAMES[code] ?? `รพ. ${code}`
}

/**
 * จัดกลุ่มแถวดิบรายตำบล (เรียงตามรหัสตำบล) + คำนวณแถวรวมอำเภอ
 * build(rows, code, name) คืน object ของตำบลนั้น (กราฟแต่ละหน้านิยามเอง)
 */
export function groupByTambon<T>(
  rows: Record<string, unknown>[],
  build: (rows: Record<string, unknown>[], code: string, name: string) => T,
  totalName = 'รวมอำเภอ',
): { tambons: T[]; total: T } {
  const groups = new Map<string, Record<string, unknown>[]>()
  for (const r of rows) {
    const t = tambonCodeOf(String(r.areacode))
    if (!groups.has(t)) groups.set(t, [])
    groups.get(t)!.push(r)
  }
  const tambons = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, rs]) => build(rs, code, tambonNameOf(code)))
  return { tambons, total: build(rows, 'all', totalName) }
}

/** จัดกลุ่มแถวดิบรายหน่วยบริการ (เรียงตาม hospcode) + คำนวณแถวรวมอำเภอ */
export function groupByHospcode<T>(
  rows: Record<string, unknown>[],
  build: (rows: Record<string, unknown>[], code: string, name: string) => T,
  totalName = 'รวมอำเภอ',
): { tambons: T[]; total: T } {
  const groups = new Map<string, Record<string, unknown>[]>()
  for (const r of rows) {
    const h = String(r.hospcode ?? '')
    if (!groups.has(h)) groups.set(h, [])
    groups.get(h)!.push(r)
  }
  const tambons = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, rs]) => build(rs, code, hospcodeNameOf(code)))
  return { tambons, total: build(rows, 'all', totalName) }
}
