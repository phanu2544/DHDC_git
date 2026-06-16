import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { buildMappingFromLegacy, classifyFields, computeMoph } from '@/lib/mophEngine'
import { saveMonthlyDetail } from '@/lib/mophDetail'
import { getTargetFor } from '@/lib/targets'
import type { MophMapping } from '@/lib/types'

const MOPH_API = 'https://opendata.moph.go.th/api/report_data'

async function fetchMOPH(tableName: string, year: string, province: string) {
  const res = await fetch(MOPH_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableName, year, province, type: 'json' }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`MOPH ตอบ ${res.status}`)
  const raw = await res.json()
  return (Array.isArray(raw) ? raw : Object.values(raw)) as Record<string, unknown>[]
}

/** กรองแถวตาม hospcode และ/หรือ areacode prefix */
function applyFilters(
  rows: Record<string, unknown>[],
  hospcode: string,
  areacode: string,
): Record<string, unknown>[] {
  let out = rows
  if (hospcode) out = out.filter((r) => String(r.hospcode) === String(hospcode))
  if (areacode) out = out.filter((r) => String(r.areacode ?? '').startsWith(String(areacode)))
  return out
}

// POST /api/moph  → ดึงข้อมูล + บันทึกลง DB
export async function POST(req: NextRequest) {
  const {
    kpiId, tableName, year, province,
    hospcode = '', areacode = '',
    valueField, targetField, calcMode, month,
  } = await req.json()

  if (!tableName || !year || !province) {
    return NextResponse.json({ message: 'กรุณาระบุ tableName, year, province' }, { status: 400 })
  }

  let rows = await fetchMOPH(tableName, year, province).catch((e) => {
    throw new Error('เชื่อมต่อ MOPH ไม่ได้: ' + e.message)
  })

  rows = applyFilters(rows, hospcode, areacode)

  if (rows.length === 0) {
    const filterDesc = [hospcode && `hospcode ${hospcode}`, areacode && `areacode ${areacode}*`].filter(Boolean).join(', ')
    return NextResponse.json({ message: `ไม่พบข้อมูล${filterDesc ? ` (${filterDesc})` : ''}`, rows: 0 }, { status: 404 })
  }

  // ── โหลด mapping: ถ้ามี kpiId → SELECT moph_config+target จาก DB (Phase 2) ──
  // มี moph_config → ใช้เป็น mapping; ไม่มี → fallback buildMappingFromLegacy
  let mapping: MophMapping
  let kpiTarget = 0
  if (kpiId) {
    const conn = await pool.getConnection()
    try {
      const [kpiRows] = await conn.execute(
        'SELECT target, moph_config FROM kpi_reports WHERE id = ?',
        [kpiId],
      )
      const kpiRow = (kpiRows as { target: number; moph_config: string | null }[])[0]
      // Phase 7A: เป้ารายปีงบ (kpi_targets) ก่อน → fallback kpi_reports.target
      const yearTarget = await getTargetFor(conn, kpiId, year)
      kpiTarget = yearTarget ?? Number(kpiRow?.target ?? 0)
      const storedConfig = kpiRow?.moph_config
      if (storedConfig) {
        try {
          mapping = JSON.parse(storedConfig) as MophMapping
        } catch {
          // JSON parse ล้มเหลว → fallback legacy และแจ้ง warning
          mapping = buildMappingFromLegacy(valueField || 'result', targetField, calcMode)
        }
      } else {
        // ยังไม่มี moph_config → ใช้ legacy fields จาก request body
        mapping = buildMappingFromLegacy(valueField || 'result', targetField, calcMode)
      }
    } finally {
      conn.release()
    }
  } else {
    // ไม่มี kpiId → ใช้ legacy (preview mode)
    mapping = buildMappingFromLegacy(valueField || 'result', targetField, calcMode)
  }

  const engineResult = computeMoph(rows, mapping)

  // engine พบ error (dimension field / field ไม่มีจริง) → ไม่บันทึก ตอบ 400
  if (engineResult.errors.length > 0) {
    return NextResponse.json({
      ok: false,
      message:  engineResult.errors[0],
      errors:   engineResult.errors,
      warnings: engineResult.warnings,
      rows: rows.length,
      sampleFields: rows[0] ? Object.keys(rows[0]) : [],
    }, { status: 400 })
  }

  const saveMonth = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  // ── Phase 4.8: เก็บ detail ราย hospcode (เฉพาะเมื่อระบุ kpiId) — additive ──
  let detailSaved = 0
  if (kpiId) {
    const detail = await saveMonthlyDetail(kpiId, saveMonth, rows, tableName)
    detailSaved = detail.saved
    if (detail.error) engineResult.warnings.push(`เก็บ detail ไม่สำเร็จ: ${detail.error}`)
  }

  // บันทึกเฉพาะเมื่อ: ระบุ kpiId และ calcValue คำนวณได้ (ไม่ใช่ null — noTarget/sumTarget=0)
  let savedMonth: string | null = null
  if (kpiId && engineResult.calcValue !== null) {
    const conn = await pool.getConnection()
    try {
      // monthly_data.target ต้องมาจาก kpi_reports.target เท่านั้น — ห้ามใช้ denominator จาก MOPH
      await conn.execute(
        `INSERT INTO monthly_data (kpi_id, month, value, target)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value), target = VALUES(target)`,
        [kpiId, saveMonth, engineResult.calcValue, kpiTarget],
      )
      savedMonth = saveMonth
    } finally {
      conn.release()
    }
  } else if (kpiId && engineResult.calcValue === null) {
    engineResult.warnings.push('ไม่บันทึกลง DB เนื่องจากคำนวณค่าไม่ได้ (noTarget หรือ target=0)')
  }

  return NextResponse.json({
    ok: true, tableName, year, province,
    hospcode: hospcode || null,
    areacode: areacode || null,
    rows: rows.length,
    sumValue:  engineResult.sumValue,
    sumTarget: engineResult.sumTarget,
    calcValue: engineResult.calcValue,
    calcMode:  calcMode || 'percent',
    evaluated: engineResult.evaluated,
    warnings:  engineResult.warnings,
    errors:    engineResult.errors,
    savedMonth,
    detailSaved,
    sampleFields: rows[0] ? Object.keys(rows[0]) : [],
    sample: rows.slice(0, 3),
  })
}

// GET /api/moph?tableName=&year=&province=&hospcode=&areacode=&limit=  → preview
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tableName = searchParams.get('tableName')
  const year      = searchParams.get('year') || '2569'
  const province  = searchParams.get('province') || '66'
  const hospcode  = searchParams.get('hospcode') || ''
  const areacode  = searchParams.get('areacode') || ''
  // limit=0 = คืนทุก row, limit=N = คืน N rows แรก (default 3 ถ้าไม่มี filter, all ถ้ามี filter)
  const limitParam = searchParams.get('limit')
  const hasFilter  = !!(hospcode || areacode)

  if (!tableName) return NextResponse.json({ ok: false, message: 'ต้องระบุ tableName' }, { status: 400 })

  let rows: Record<string, unknown>[]
  try {
    rows = await fetchMOPH(tableName, year, province)
  } catch (e) {
    return NextResponse.json({ ok: false, message: String(e) }, { status: 502 })
  }

  rows = applyFilters(rows, hospcode, areacode)

  // ถ้ามี filter → คืนทุก row (ผ่าน filter แล้ว จำนวนน้อยแน่นอน)
  // ถ้าไม่มี filter → คืน 5 rows แรก (ป้องกัน payload ใหญ่เกิน)
  let limit: number
  if (limitParam !== null) {
    limit = parseInt(limitParam) || 0
  } else {
    limit = hasFilter ? 0 : 5
  }

  const sample = limit > 0 ? rows.slice(0, limit) : rows

  return NextResponse.json({
    ok: true, tableName, year, province,
    hospcode: hospcode || null,
    areacode: areacode || null,
    rows: rows.length,
    fields:     rows[0] ? Object.keys(rows[0]) : [],
    fieldTypes: rows[0] ? classifyFields(rows[0]) : {},
    sample,
  })
}
