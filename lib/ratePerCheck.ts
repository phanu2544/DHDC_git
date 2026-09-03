/**
 * ตรวจว่า "หน่วย" กับ "ตัวคูณ (rate_per)" ของตัวชี้วัดพูดตรงกันไหม
 *
 * ที่มา: 3 ก.ย. 69 เจอบั๊กข้อ 12 (อัตราส่วนการตายมารดา) — หน่วยเป็น "ต่อแสนคน"
 * แต่ rate_per ตั้งไว้ 100 → ค่าต่ำกว่าจริง 1,000 เท่า → KPI แนว "ยิ่งน้อยยิ่งดี"
 * ขึ้น "ผ่าน" ปลอม (มารดาตาย 1/250 ควรได้ 400 แต่ได้ 0.4 เทียบเป้า ≤15)
 *
 * ⚠️ เป็น "ตาข่ายกันพลาด" ไม่ใช่การรับประกัน — ช่องหน่วยพิมพ์อะไรก็ได้
 * เช่น "per 100,000" (อังกฤษ) ยังหลุดอยู่ · ใช้เตือนคน ไม่ได้ใช้บล็อกการบันทึก
 */

/** ตัวคูณที่ระบบรองรับ (ตรงกับตัวเลือกในฟอร์ม /admin) */
export const RATE_PER_OPTIONS = [100, 1000, 10000, 100000, 1000000] as const

/**
 * เดา "ตัวคูณที่ควรจะเป็น" จากข้อความในช่องหน่วย
 * - หาคำบอกจำนวนไทยที่ไหนก็ได้ในข้อความ (ไม่ต้องติดกับคำว่า "ต่อ")
 *   เช่น "ต่อการเกิดมีชีพแสนคน" ก็จับได้ ไม่ใช่แค่ "ต่อแสนคน"
 * - เผื่อกรณีพิมพ์เป็นตัวเลข เช่น "ต่อ 100,000 คน"
 * - ไม่เจออะไรเลย → 100 (ร้อยละ ซึ่งเป็นค่าปกติของระบบ)
 * เรียงจากใหญ่ไปเล็ก กันกรณีข้อความมีหลายคำ
 */
export function expectedRatePerFromUnit(unit: string | null | undefined): number {
  const u = (unit ?? '').replace(/[,\s]/g, '')
  if (!u) return 100
  if (u.includes('ล้าน') || u.includes('1000000')) return 1000000
  if (u.includes('แสน')  || u.includes('100000'))  return 100000
  if (u.includes('หมื่น') || u.includes('10000'))   return 10000
  if (u.includes('พัน')  || u.includes('1000'))    return 1000
  return 100
}

const LABEL: Record<number, string> = {
  100: 'ร้อยละ (×100)',
  1000: 'ต่อพัน (×1,000)',
  10000: 'ต่อหมื่น (×10,000)',
  100000: 'ต่อแสน (×100,000)',
  1000000: 'ต่อล้าน (×1,000,000)',
}
export const ratePerLabel = (n: number) => LABEL[n] ?? `×${n.toLocaleString()}`

/**
 * คืนข้อความเตือนถ้าหน่วยกับตัวคูณไม่ตรงกัน · คืน null ถ้าตรง (หรือเดาไม่ได้)
 * ตรวจ 2 ทาง: หน่วยบอกต่อแสนแต่ตั้ง 100 · และตั้ง 100,000 แต่หน่วยเป็น "%"
 */
export function ratePerMismatch(
  unit: string | null | undefined,
  ratePer: number | null | undefined,
): { expected: number; actual: number; message: string } | null {
  const actual = Number(ratePer) || 100
  const expected = expectedRatePerFromUnit(unit)
  if (expected === actual) return null
  const u = (unit ?? '').trim() || '(ไม่ระบุ)'
  return {
    expected, actual,
    message: expected > actual
      ? `หน่วยเขียนว่า "${u}" แต่ระบบตั้งวิธีคิดไว้ ${ratePerLabel(actual)} — ตัวเลขจะต่ำกว่าความจริง ${(expected / actual).toLocaleString()} เท่า (ควรเป็น ${ratePerLabel(expected)})`
      : `หน่วยเขียนว่า "${u}" แต่ระบบตั้งวิธีคิดไว้ ${ratePerLabel(actual)} — ตัวเลขจะสูงกว่าความจริง ${(actual / expected).toLocaleString()} เท่า (ควรเป็น ${ratePerLabel(expected)})`,
  }
}
