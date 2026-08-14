import { NO_PROVINCE_TABLES } from './mophEngine'

/**
 * จุดเดียวที่คุยกับ MOPH Open Data API — ใช้ร่วมกัน 4 จุด: lib/mophBatch.ts (batch/cron),
 * app/api/moph/route.ts (ปุ่มดึงทีละตัว/preview), lib/monthlyView.ts + app/api/detail/route.ts (drilldown live)
 *
 * แก้ปัญหาที่เจอ 13 ส.ค. 69 (API ล่มช่วง 3-13 ส.ค. แล้วกลับมาเปลี่ยนรูปแบบ):
 *  1. response เปลี่ยนจากคืน array ตรงๆ เป็น envelope {data:[...], total, limit, offset}
 *  2. มี limit เริ่มต้น 1000 แถว/คำขอ — บางตารางเกิน (เช่น s_childdev_specialpp total 5953)
 * ดู docs/kpi-hdc-api-checklist.md
 */

const MOPH_API = 'https://opendata.moph.go.th/api/report_data'
const PAGE_SIZE = 1000
const PAGE_DELAY_MS = 300
const MAX_RETRIES_PER_PAGE = 3
// กันลูปไม่รู้จบถ้า MOPH ส่ง total ผิดเพี้ยน — ตารางที่ใช้จริงตอนนี้มากสุด 6 หน้า (~6000 แถว)
const MAX_PAGES = 50

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** รองรับทั้ง response แบบเก่า (array ตรงๆ) และแบบใหม่ ({data:[...],total,...}) */
function unwrapRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[]
  if (raw && typeof raw === 'object') {
    const data = (raw as { data?: unknown }).data
    if (Array.isArray(data)) return data as Record<string, unknown>[]
    return Object.values(raw as object) as Record<string, unknown>[]
  }
  return []
}

/** total มาเป็น string จาก MOPH (เช่น "5953") — ไม่มี/parse ไม่ได้ → fallback = จำนวนแถวหน้านี้ (response เก่าไม่มี envelope) */
function totalOf(raw: unknown, fallback: number): number {
  if (raw && typeof raw === 'object' && 'total' in (raw as object)) {
    const n = Number((raw as { total: unknown }).total)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

async function fetchPage(
  tableName: string, year: string, province: string, offset: number,
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  // บางตาราง (เช่น s_child0_5_pshyche_develop_coverage) ปฏิเสธ province → 400 "Parameter Invalid"
  const body = NO_PROVINCE_TABLES.has(tableName)
    ? { tableName, year, type: 'json', limit: PAGE_SIZE, offset }
    : { tableName, year, province, type: 'json', limit: PAGE_SIZE, offset }

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(MOPH_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })
    if (res.status === 429 && attempt < MAX_RETRIES_PER_PAGE) {
      await sleep(800 * (attempt + 1))
      continue
    }
    if (!res.ok) throw new Error(`MOPH ตอบ ${res.status}`)
    const raw = await res.json()
    const rows = unwrapRows(raw)
    return { rows, total: totalOf(raw, rows.length) }
  }
}

/**
 * ดึงข้อมูลจาก MOPH ให้ครบทุกแถว (paginate ผ่าน offset จนถึง total)
 * throw ถ้าดึงได้ไม่ครบ total — กันข้อมูลขาดแบบเงียบ (เช่น limit ตัดที่ 1000 ทั้งที่ total มากกว่า)
 */
export async function fetchMophRows(
  tableName: string, year: string, province: string,
): Promise<Record<string, unknown>[]> {
  const first = await fetchPage(tableName, year, province, 0)
  const rows = [...first.rows]
  const total = first.total

  for (let page = 1; rows.length < total; page++) {
    if (page >= MAX_PAGES) {
      throw new Error(`${tableName}: ดึงเกิน ${MAX_PAGES} หน้าแล้วยังไม่ครบ (ได้ ${rows.length}/${total}) — total อาจผิดปกติ`)
    }
    await sleep(PAGE_DELAY_MS)
    const next = await fetchPage(tableName, year, province, rows.length)
    if (next.rows.length === 0) break
    rows.push(...next.rows)
  }

  if (rows.length < total) {
    throw new Error(`${tableName}: ดึงข้อมูลไม่ครบ ได้ ${rows.length}/${total} แถว`)
  }

  return rows
}
