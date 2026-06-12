import { STATUS_META } from './kpiStatus'
import type { StatusSummary } from './kpiStatus'
import { DIRECTION_LABEL, EXECUTIVE_SEVERITY_ORDER } from './scorecard'
import type { ScorecardRow } from './scorecard'

/**
 * Phase 5 — Export Executive Scorecard เป็น .xlsx (client-side)
 * - dynamic import('xlsx') — โหลด lib เฉพาะตอนกดปุ่ม ไม่ถ่วง bundle หน้าแรก
 * - export "ทุกแถวเสมอ" ไม่ตาม filter บนจอ (เอกสารแนบวาระต้องครบทุกตัว)
 * - เรียงตาม EXECUTIVE_SEVERITY_ORDER + ใช้ label ไทยชุดเดียวกับจอ
 *   → เลขบนกระดาษ = เลขบนจอ เสมอ
 */
export async function exportScorecardXlsx(
  rows: ScorecardRow[],
  summary: StatusSummary,
  month: string,
): Promise<void> {
  const XLSX = await import('xlsx')
  const monthLabel = new Date(month + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })

  const sorted = [...rows].sort(
    (a, b) => EXECUTIVE_SEVERITY_ORDER.indexOf(a.status) - EXECUTIVE_SEVERITY_ORDER.indexOf(b.status),
  )

  // ── Sheet 1: Scorecard ──────────────────────────────────────────────────
  const header = ['ตัวชี้วัด (KPI)', 'หมวดหมู่', 'ผู้รับผิดชอบ', 'ค่าจริง', 'เป้าหมาย', 'หน่วย', 'ทิศทาง', 'สถานะ', 'หมายเหตุ']
  const body = sorted.map((r) => [
    r.kpi.name.trim(),
    r.kpi.category,
    r.kpi.owner,
    r.value === null ? '—' : r.value,
    r.target,
    r.kpi.unit ?? '',
    DIRECTION_LABEL[r.direction],
    STATUS_META[r.status].label,
    r.message ?? '',
  ])
  const ws = XLSX.utils.aoa_to_sheet([
    ['Executive Scorecard — อำเภอดงเจริญ'],
    [`เดือน ${monthLabel} · ข้อมูลสะสมปีงบประมาณ ณ วันที่เก็บ`],
    [],
    header,
    ...body,
  ])
  ws['!cols'] = [
    { wch: 64 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 10 },
    { wch: 8 }, { wch: 14 }, { wch: 18 }, { wch: 44 },
  ]

  // ── Sheet 2: สรุป ───────────────────────────────────────────────────────
  const sum = XLSX.utils.aoa_to_sheet([
    ['สรุปสถานะ', `เดือน ${monthLabel}`],
    [],
    ['ผ่าน', summary.pass],
    ['เฝ้าระวัง', summary.watch],
    ['ไม่ผ่าน', summary.fail],
    ['ยังไม่มีข้อมูล', summary.no_data],
    ['ติดตาม (ไม่ประเมิน)', summary.no_target],
    ['ข้อมูลผิด', summary.invalid],
    ['ตรวจสอบเป้าหมาย', summary.needs_review],
    [],
    ['รวมทั้งหมด', rows.length],
    ['ประเมินได้ (ผ่าน+เฝ้าระวัง+ไม่ผ่าน)', summary.evaluable],
    ['อัตราผ่าน passRate (%)', summary.passRate ?? '—'],
    [],
    ['สร้างเมื่อ', new Date().toLocaleString('th-TH')],
  ])
  sum['!cols'] = [{ wch: 34 }, { wch: 22 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Scorecard')
  XLSX.utils.book_append_sheet(wb, sum, 'สรุป')
  XLSX.writeFile(wb, `scorecard-${month}.xlsx`)
}
