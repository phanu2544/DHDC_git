import { NextRequest, NextResponse } from 'next/server'
import { runBatchSave } from '@/lib/mophBatch'

/**
 * POST /api/moph/batch
 * Body: { year, province, hospcode?, areacode?, month? }
 * ดึง & บันทึก monthly_data ของทุก kpi_reports ที่ตั้งค่า moph_table ไว้
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const result = await runBatchSave(body)
  return NextResponse.json(result, { status: result.ok ? 200 : 404 })
}
