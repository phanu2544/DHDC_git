import { setCodeFor, type SetSummary } from './setsSummary'
import { formatThaiMonth } from './formatMonth'
import { quarterInfoOfMonth } from './fiscalQuarter'
import type { ScorecardRow } from './scorecard'

/**
 * L6 — Export กลับเป็น "ฟอร์มตรวจราชการ" (docs/kpi-sets-plan.md §11.2)
 *
 * เลย์เอาต์ยึดตามไฟล์ต้นฉบับ `docs/data_owner/ตัวชี้วัดตรวจราชการ 69 รอบ 1.xlsx`
 * (ชีตเดียว · หัวตาราง 3 แถวซ้อน + merge · ข้อมูลเริ่มแถวที่ 5 ของ Excel)
 *
 *  A ลำดับที่ | B กลุ่ม | C ตัวชี้วัดตรวจราชการ | D ผู้รับผิดชอบ | E Baseline ข้อมูลปี 68
 *  F–K เป้าหมาย [ F เขต | G จังหวัด | H–K รพ. ไตรมาส 1–4 ]
 *  L ผลงานปัจจุบัน | M ปัญหาอุปสรรค | N แนวทางการดำเนินงานต่อไป | O แหล่งที่มาข้อมูล
 *
 * ⚠️ ค่าที่ระบบ "ไม่ได้เก็บแยก" จึงต้องอธิบายไว้ตรงนี้ (อย่าให้คนอ่านไฟล์เข้าใจผิดว่ามาจากข้อมูลจริง)
 *  - **เป้า รพ. เก็บค่าเดียวต่อปีงบ** (`kpi_set_items.target_hospital`) ไม่ได้แยกรายไตรมาส
 *    → **merge ช่องไตรมาส 1–4 ของแถวนั้นเป็นช่องเดียว** แล้วใส่ค่าที่มี
 *    เหตุผล: เขียนค่าซ้ำ 4 ช่อง = เดาแทนเจ้าของ และขัดกับต้นฉบับจริง (ลำดับ 22 เขียน `-`
 *    ที่ไตรมาส 2–4 ตั้งใจว่าไม่มีเป้า · ลำดับ 29 ใส่เป้าเฉพาะไตรมาส 4) · ใส่ช่องเดียวก็ตกหล่น
 *    → merge = ไม่เดา ไม่ตกหล่น · ถ้าอนาคตต้องการเป้าต่างกันรายไตรมาส ต้องเพิ่มคอลัมน์ใน schema ก่อน
 *  - **กลุ่ม A–H** อ่านจากคำนำหน้าของ `category` (เช่น `A (ส่งเสริมป้องกันโรค)` → `A`)
 *    ตัวที่ยังไม่จัดหมวด (owner ยังไม่เคาะ) เว้นว่าง — ไม่เดา
 *  - **Baseline ปี 68** ตอน L5 นำเข้าเก็บไว้ใน `description` (ไม่มีคอลัมน์ของตัวเอง) → ดึงกลับด้วย regex
 */

/** ชุดที่ใช้ฟอร์มนี้ได้ — ฟอร์มมีคอลัมน์เฉพาะของตรวจราชการ (Baseline 68 / เป้า 3 ระดับ) ชุดอื่นใช้ไม่ได้ */
export const INSPECTION_SET_SLUGS = ['inspection-r3']

export function isInspectionSet(slug: string): boolean {
  return INSPECTION_SET_SLUGS.includes(slug)
}

/** หมายเหตุเชิงคุณภาพต่อรอบ (L2) — คีย์ด้วย kpiId */
export interface InspectionNote {
  kpiId: string
  problem?: string
  nextAction?: string
  dataRef?: string
}

/** `A (ส่งเสริมป้องกันโรค)` → `A` · หมวดที่ไม่ได้ขึ้นต้นด้วยตัวอักษรกลุ่ม → '' (เว้นว่าง ไม่เดา) */
function groupLetter(category: string): string {
  const m = /^([A-H])\s*\(/.exec(category.trim())
  return m ? m[1] : ''
}

/** ดึง Baseline ปี 68 กลับจาก description ที่ L5 เขียนไว้ ("Baseline ปี 68: <ค่า> · นำเข้าจาก...") */
function baselineOf(description?: string): string {
  if (!description) return ''
  const m = /Baseline\s*ปี\s*68:\s*([^·]*)/.exec(description)
  return m ? m[1].trim() : ''
}

/**
 * ชื่อที่ใช้ในไฟล์ export — บาง KPI ถูกย่อชื่อในระบบให้อ่านง่ายบนหน้าจอ (เช่น #5 MMR2 ตัดคำว่า
 * "ระดับ จังหวัด" ที่เข้าใจผิดได้ว่าเป็นเลขระดับจังหวัด ทั้งที่ระบบเก็บระดับอำเภอ) แต่ไฟล์ที่ส่งเขต
 * ต้องคงชื่อเต็มตามต้นฉบับไว้เทียบกับแบบฟอร์มจริงได้ — ถ้า description มีรูปแบบ
 * `ชื่อเต็มตามไฟล์ตรวจราชการ ... : "<ชื่อเต็ม>"` ให้ดึงชื่อเต็มนั้นมาใช้แทน ไม่มี = ใช้ชื่อในระบบตามเดิม
 */
function officialNameOf(name: string, description?: string): string {
  if (!description) return name
  const m = /ชื่อเต็มตามไฟล์ตรวจราชการ[^:]*:\s*"([^"]+)"/.exec(description)
  return m ? m[1].trim() : name
}

/**
 * ผลงานปัจจุบัน — numeric คืน number (ให้ Excel เก็บเป็นตัวเลขจริง คำนวณต่อได้)
 * text/level คืนข้อความ · ไม่มีข้อมูลคืน '' (ช่องว่างเหมือนต้นฉบับ ไม่ใช่ '—')
 */
function resultCell(r: ScorecardRow): string | number {
  if (r.valueText != null) return r.valueText
  return r.value === null ? '' : r.value
}

/** ป้ายรอบ เช่น "ไตรมาส 2/2569 (ม.ค. – มี.ค. 69)" · เดือนที่ไม่ใช่เดือนปิดไตรมาสใช้ชื่อเดือนไทย */
function periodLabel(month: string): string {
  const q = quarterInfoOfMonth(month)
  return q ? `${q.label} (${q.range})` : formatThaiMonth(month)
}

export async function exportInspectionXlsx(
  summary: SetSummary,
  notes: InspectionNote[],
  month: string,
): Promise<void> {
  const XLSX = await import('xlsx')
  const noteOf = new Map(notes.map((n) => [n.kpiId, n]))

  const body = summary.rows.map((r) => {
    const tag = r.kpi.sets?.find((s) => s.id === summary.set.id)
    const tgt = tag?.targetHospital ?? ''
    const n = noteOf.get(r.kpi.id)
    return [
      setCodeFor(r, summary.set.id) ?? '',
      groupLetter(r.kpi.category),
      officialNameOf(r.kpi.name.trim(), r.kpi.description),
      r.kpi.owner,
      baselineOf(r.kpi.description),
      tag?.targetRegion ?? '',
      tag?.targetProvince ?? '',
      tgt, null, null, null,       // เป้า รพ. — ค่าเดียวต่อปีงบ · merge คร่อมไตรมาส 1–4 ด้านล่าง
      resultCell(r),
      n?.problem ?? '',
      n?.nextAction ?? '',
      n?.dataRef ?? '',
    ]
  })

  const ws = XLSX.utils.aoa_to_sheet([
    [`${summary.set.name} — อำเภอดงเจริญ · ${periodLabel(month)}`],
    ['ลำดับที่', 'กลุ่ม', 'ตัวชี้วัดตรวจราชการ', 'ผู้รับผิดชอบ', 'Baseline ข้อมูลปี 68',
      'เป้าหมาย', null, null, null, null, null,
      'ผลงานปัจจุบัน', 'ปัญหาอุปสรรค', 'แนวทางการดำเนินงานต่อไป',
      'แหล่งที่มาข้อมูล (ให้แนบ link หรือ ระบุช่องทางผู้รับผิดชอบ)'],
    [null, null, null, null, null, 'เขต', 'จังหวัด', 'รพ.', null, null, null],
    [null, null, null, null, null, null, null, 'ไตรมาส 1', 'ไตรมาส 2', 'ไตรมาส 3', 'ไตรมาส 4'],
    ...body,
  ])

  // merge หัวตาราง — index เป็นแถวจริงใน sheet (แถว 0 = บรรทัดชื่อเรื่อง)
  const span3 = (c: number) => ({ s: { c, r: 1 }, e: { c, r: 3 } })
  ws['!merges'] = [
    ...[0, 1, 2, 3, 4, 11, 12, 13, 14].map(span3),  // คอลัมน์ชั้นเดียว → คร่อม 3 แถวหัว
    { s: { c: 5, r: 1 }, e: { c: 10, r: 1 } },       // "เป้าหมาย" คร่อม F–K
    { s: { c: 5, r: 2 }, e: { c: 5, r: 3 } },        // เขต
    { s: { c: 6, r: 2 }, e: { c: 6, r: 3 } },        // จังหวัด
    { s: { c: 7, r: 2 }, e: { c: 10, r: 2 } },       // "รพ." คร่อม 4 ไตรมาส
    // เป้า รพ. ของแต่ละแถว = ค่าเดียวต่อปีงบ → คร่อมช่องไตรมาส 1–4 (ดูหมายเหตุหัวไฟล์)
    ...body.map((_, i) => ({ s: { c: 7, r: i + 4 }, e: { c: 10, r: i + 4 } })),
  ]
  ws['!cols'] = [
    { wch: 8 }, { wch: 6 }, { wch: 60 }, { wch: 18 }, { wch: 20 },
    { wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 },
    { wch: 16 }, { wch: 40 }, { wch: 40 }, { wch: 30 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ตรวจราชการ')
  XLSX.writeFile(wb, `ตรวจราชการ-${summary.set.slug}-${month}.xlsx`)
}
