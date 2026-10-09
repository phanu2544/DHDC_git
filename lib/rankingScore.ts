/**
 * rankingScore — ระบบคะแนน Ranking (L7 · docs/kpi-sets-plan.md §15, §18.4)
 *
 * Ranking จังหวัดพิจิตร ให้คะแนนแต่ละตัวชี้วัด 1-5 ตาม "เกณฑ์คะแนน 5 ช่วง" แล้วคูณ "น้ำหนัก" (2 หรือ 3)
 * น้ำหนักรวมทุกข้อ = 100 → คะแนนรวม = Σ(คะแนน × น้ำหนัก) / 5  (เต็ม 100)
 *
 * เกณฑ์เก็บเป็น JSON ต่อ (KPI, ชุด) ที่ kpi_set_items.score_bands — ชุดอื่นไม่ใช้ (null)
 * pure ทั้งไฟล์ (ไม่แตะ DB) — หน้า /sets/[slug] และ export ใช้ตัวเดียวกัน
 */

/** ช่วงตัวเลข · label = ข้อความเกณฑ์ตามไฟล์ต้นฉบับ (แสดงผล) */
export interface RangeBand { score: number; min?: number | null; max?: number | null; label?: string }
/** ระดับข้อความ · ผลงานที่กรอก (valueText) ต้องตรงกับ label */
export interface LevelBand { score: number; label: string }

export type ScoreBands =
  /**
   * better='higher' (ยิ่งมากยิ่งดี): คะแนน = ช่วงสูงสุดที่ value ≥ min (ใช้แค่ min เป็นเกณฑ์ขั้นต่ำ)
   * better='lower'  (ยิ่งน้อยยิ่งดี): คะแนน = ช่วงสูงสุดที่ value ≤ max
   * ใช้ "เกณฑ์ขั้นต่ำ/ขั้นสูง" แทนการจับช่วงตรงๆ เพราะไฟล์ต้นฉบับมีทั้งช่วงที่มีรู (≤49 / 50-59 → 49.5 ตกช่อง)
   * และเกณฑ์แบบจุด (MMR2: 92 / 95 / 98 / 100) — แบบขั้นต่ำครอบคลุมทั้งสองรูปแบบโดยไม่ต้องเดา
   */
  | { kind: 'range'; better: 'higher' | 'lower'; bands: RangeBand[] }
  | { kind: 'level'; bands: LevelBand[] }

export interface ScoreResult {
  score: number | null      // 1-5 · null = ให้คะแนนไม่ได้
  reason?: string           // เหตุผลเมื่อ score=null (แสดงในหน้าเว็บ)
}

/** อ่าน JSON จาก DB อย่างปลอดภัย — รูปแบบผิด = null (ไม่ throw ให้หน้าเว็บพัง) */
export function parseScoreBands(raw: unknown): ScoreBands | null {
  if (raw == null || raw === '') return null
  let v: unknown = raw
  if (typeof raw === 'string') {
    try { v = JSON.parse(raw) } catch { return null }
  }
  if (!v || typeof v !== 'object') return null
  const o = v as { kind?: unknown; better?: unknown; bands?: unknown }
  if (!Array.isArray(o.bands) || o.bands.length === 0) return null
  const okScore = (s: unknown) => Number.isInteger(s) && (s as number) >= 1 && (s as number) <= 5
  if (o.kind === 'range' && (o.better === 'higher' || o.better === 'lower')) {
    const bands = (o.bands as RangeBand[]).filter((b) => b && okScore(b.score))
    return bands.length ? { kind: 'range', better: o.better, bands } : null
  }
  if (o.kind === 'level') {
    const bands = (o.bands as LevelBand[]).filter((b) => b && okScore(b.score) && typeof b.label === 'string' && b.label.trim())
    return bands.length ? { kind: 'level', bands } : null
  }
  return null
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** แปลงผลงาน → คะแนน 1-5 · numeric ใช้ value · ชนิดระดับ/ข้อความใช้ valueText */
export function scoreFor(bands: ScoreBands | null, value: number | null, valueText: string | null): ScoreResult {
  if (!bands) return { score: null, reason: 'ยังไม่ได้ตั้งเกณฑ์คะแนน' }

  if (bands.kind === 'level') {
    if (!valueText || !valueText.trim()) return { score: null, reason: 'ยังไม่มีผลงาน' }
    const hit = bands.bands.find((b) => norm(b.label) === norm(valueText))
    return hit ? { score: hit.score } : { score: null, reason: `ผลงาน "${valueText}" ไม่ตรงกับเกณฑ์ข้อใด` }
  }

  if (value == null || !Number.isFinite(value)) return { score: null, reason: 'ยังไม่มีผลงาน' }
  let best: number | null = null
  for (const b of bands.bands) {
    const ok = bands.better === 'higher'
      ? (b.min == null || value >= b.min)
      : (b.max == null || value <= b.max)
    if (ok && (best === null || b.score > best)) best = b.score
  }
  // ต่ำกว่าเกณฑ์ช่วงล่างสุดที่กำหนดไว้ (เช่นช่วงคะแนน 1 = "50-59" แล้วทำได้ 30) → ไม่ถึงคะแนน 1 = 0 คะแนน
  return best === null ? { score: 0, reason: 'ต่ำกว่าเกณฑ์คะแนน 1' } : { score: best }
}

export interface RankingItem { weight: number | null; score: number | null }

export interface RankingTotal {
  total: number          // Σ(คะแนน × น้ำหนัก) / 5 — คิดเฉพาะข้อที่ได้คะแนนแล้ว
  maxPossible: number    // Σ(น้ำหนัก) ของข้อที่ได้คะแนนแล้ว (คะแนนเต็มของส่วนที่ประเมินได้)
  fullWeight: number     // Σ(น้ำหนัก) ทุกข้อในชุด (ควร = 100 ตามไฟล์)
  scored: number         // จำนวนข้อที่ได้คะแนนแล้ว
  items: number          // จำนวนข้อที่มีน้ำหนัก
}

/** รวมคะแนนทั้งชุด — ข้อที่ยังไม่มีผลงานไม่ถูกนับเป็น 0 (แยก maxPossible ให้เห็นว่าประเมินไปได้แค่ไหน) */
export function rankingTotal(items: RankingItem[]): RankingTotal {
  let total = 0, maxPossible = 0, fullWeight = 0, scored = 0, count = 0
  for (const it of items) {
    if (it.weight == null || !(it.weight > 0)) continue
    count++
    fullWeight += it.weight
    if (it.score == null) continue
    scored++
    maxPossible += it.weight
    total += (it.score * it.weight) / 5
  }
  return { total: +total.toFixed(2), maxPossible: +maxPossible.toFixed(2), fullWeight: +fullWeight.toFixed(2), scored, items: count }
}
