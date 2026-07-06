import { NextRequest, NextResponse } from 'next/server'
import { runBatchSave } from '@/lib/mophBatch'

/**
 * POST /api/moph/batch
 * Body: { year, province, hospcode?, areacode?, month? }
 * ดึง & บันทึก monthly_data ของทุก kpi_reports ที่ตั้งค่า moph_table ไว้
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  // trigger='cron' ต้องมาจาก lib/scheduler.ts เท่านั้น (เรียก runBatchSave ตรง ไม่ผ่าน HTTP)
  // บังคับ 'manual' ที่นี่เสมอ กัน client ปลอม trigger:'cron' ผ่าน request body มาทำให้ cron_log heartbeat เพี้ยน
  const result = await runBatchSave({ ...body, trigger: 'manual' })
  return NextResponse.json(result, { status: result.ok ? 200 : 404 })
}
