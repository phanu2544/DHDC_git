import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/cron-status — สถานะการดึงข้อมูลอัตโนมัติ (cron) + ความสดของข้อมูล
 * read-only ทั้งหมด · ใช้แสดงในแท็บ Database ของ /admin เพื่อ go-live readiness
 *
 * lastRun = MAX(fetched_at) จาก moph_monthly_detail — แม่นเพราะ saveMonthlyDetail
 * ทำ DELETE+INSERT ใหม่ทุกรอบ (ไม่ใช่ upsert) → fetched_at สดทุกครั้งที่ batch/cron รัน
 * ⚠️ สะท้อน "ครั้งล่าสุดที่ดึง+บันทึก" ไม่ว่าจาก cron อัตโนมัติ หรือกดดึงเอง (แยกไม่ได้ 100%)
 *
 * cron config อ่าน env ชุดเดียวกับ lib/scheduler.ts (default ตรงกัน)
 */
export async function GET() {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const conn = await pool.getConnection()
  try {
    const [detail]  = await conn.execute('SELECT MAX(fetched_at) AS v FROM moph_monthly_detail')
    const [latest]  = await conn.execute('SELECT MAX(month) AS v FROM monthly_data')
    // ตัวเศษ: นับเฉพาะ KPI แบบ auto (moph_table + ไม่ manual) ให้ consistent กับตัวส่วน autoCnt
    // (ไม่ JOIN แล้วนับ manual รวมด้วย จะทำให้ coverage เพี้ยนเมื่อ manual KPI มีข้อมูลเดือนนั้น)
    const [curCnt]  = await conn.execute(
      `SELECT COUNT(DISTINCT md.kpi_id) AS v FROM monthly_data md
       JOIN kpi_reports k ON k.id = md.kpi_id
       WHERE md.month = ? AND k.moph_table <> '' AND (k.manual_entry = 0 OR k.manual_entry IS NULL)`,
      [currentMonth])
    const [autoCnt] = await conn.execute(
      `SELECT COUNT(*) AS v FROM kpi_reports
       WHERE moph_table IS NOT NULL AND moph_table <> '' AND (manual_entry = 0 OR manual_entry IS NULL)`)

    // cron heartbeat แท้ — รอบ full-batch ล่าสุดที่ trigger='cron' (แยกจากกดดึงเอง)
    // ตาราง cron_log อาจยังไม่มี (DB เก่ายังไม่ migrate) → try/catch คืน null ไม่ให้ทั้ง endpoint พัง
    interface CronLogRow { run_at: unknown; saved: number; total: number; failed: number }
    let cronLast: CronLogRow | null = null
    try {
      const [rows] = await conn.execute(
        `SELECT run_at, saved, total, failed FROM cron_log
         WHERE trigger_by = 'cron' ORDER BY id DESC LIMIT 1`)
      cronLast = (rows as CronLogRow[])[0] ?? null
    } catch { /* ไม่มีตาราง cron_log — ข้าม */ }

    // รายชื่อ auto KPI ที่ยังไม่มีข้อมูลเดือนนี้ (โชว์ใน tooltip ของ coverage)
    const [missing] = await conn.execute(
      `SELECT k.name FROM kpi_reports k
       WHERE k.moph_table <> '' AND (k.manual_entry = 0 OR k.manual_entry IS NULL)
         AND k.id NOT IN (SELECT kpi_id FROM monthly_data WHERE month = ?)
       ORDER BY k.name`, [currentMonth])

    const one = (rows: unknown) => (rows as { v: unknown }[])[0]?.v ?? null

    return NextResponse.json({
      ok: true,
      lastRun:              one(detail),                   // datetime string หรือ null
      latestMonth:          one(latest),                   // 'YYYY-MM' หรือ null
      currentMonth,
      currentMonthKpiCount: Number(one(curCnt) ?? 0),
      autoKpiCount:         Number(one(autoCnt) ?? 0),
      missingKpis:          (missing as { name: string }[]).map((r) => r.name),
      cronLastRun:          cronLast?.run_at ?? null,
      cronLastSaved:        cronLast ? Number(cronLast.saved) : null,
      cronLastTotal:        cronLast ? Number(cronLast.total) : null,
      cronLastFailed:       cronLast ? Number(cronLast.failed) : null,
      cronExpr:             process.env.MOPH_CRON || '0 7 * * *',
      cronTz:               process.env.MOPH_CRON_TZ || 'Asia/Bangkok',
      cronDisabled:         process.env.MOPH_CRON_DISABLED === '1',
    })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
