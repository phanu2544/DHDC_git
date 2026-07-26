import type { KpiEvalStatus } from './types'
import type { ScorecardRow } from './scorecard'

/**
 * setsSummary — จัดกลุ่ม ScorecardRow ตาม "ชุด/ประเภทตัวชี้วัด" (docs/kpi-sets-plan.md K6)
 * pure: หน้า /sets (การ์ดรวม) และ /sets/[slug] (รายชุด) ใช้ตัวเดียวกัน
 * 1 KPI อยู่ได้หลายชุด → row เดียวปรากฏได้หลาย summary (ไม่ใช่ bug)
 */

export interface KpiSetInfo {
  id: number
  name: string
  slug: string
  fiscalYear: string | null
  description: string | null
}

export interface SetSummary {
  set: KpiSetInfo
  rows: ScorecardRow[]                          // KPI ในชุดนี้ (เรียงตาม set_code แล้วชื่อ)
  total: number
  pass: number
  evaluated: number                            // total ที่ประเมินจริง (ตัด no_target ออก)
  statusCounts: Record<KpiEvalStatus, number>
}

const emptyCounts = (): Record<KpiEvalStatus, number> => ({
  fail: 0, watch: 0, no_data: 0, needs_review: 0, invalid: 0, pass: 0, no_target: 0, narrative: 0,
})

/** เลขข้อ (set_code) ของ row ในชุด setId — ใช้เรียงลำดับ (null ไปท้าย) */
function setCodeOf(row: ScorecardRow, setId: number): string | null {
  return row.kpi.sets?.find((s) => s.id === setId)?.setCode ?? null
}

/** แปลง set_code เป็นเลขเทียบได้ (รองรับ "1.5", "2.1") — เรียงแบบธรรมชาติ ไม่ใช่ string */
function codeSortKey(code: string | null): number {
  if (!code) return Number.POSITIVE_INFINITY
  const parts = code.split('.').map((p) => parseInt(p, 10))
  const major = Number.isFinite(parts[0]) ? parts[0] : 9999
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0
  return major * 1000 + minor
}

export function summarizeSets(rows: ScorecardRow[], sets: KpiSetInfo[]): SetSummary[] {
  return sets.map((set) => {
    const members = rows.filter((r) => r.kpi.sets?.some((s) => s.id === set.id))
    const statusCounts = emptyCounts()
    for (const r of members) statusCounts[r.status] += 1
    // ตัวหาร % ผ่าน = ตัดตัวที่ไม่ประเมิน (no_target=ติดตาม, narrative=ข้อความ) ออก
    const evaluated = members.length - statusCounts.no_target - statusCounts.narrative
    members.sort((a, b) => {
      const ka = codeSortKey(setCodeOf(a, set.id))
      const kb = codeSortKey(setCodeOf(b, set.id))
      if (ka !== kb) return ka - kb
      return a.kpi.name.localeCompare(b.kpi.name, 'th')
    })
    return { set, rows: members, total: members.length, pass: statusCounts.pass, evaluated, statusCounts }
  })
}

/** หา set_code ของ KPI ในชุดที่กำหนด (ใช้แสดงเลขข้อในหน้ารายชุด) */
export function setCodeFor(row: ScorecardRow, setId: number): string | null {
  return setCodeOf(row, setId)
}
