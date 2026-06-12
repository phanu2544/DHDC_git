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
