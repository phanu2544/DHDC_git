import cron from 'node-cron'
import { runBatchSave, currentMophFiscalYear } from '@/lib/mophBatch'

/**
 * ตัวตั้งเวลา node-cron แบบ in-process (รันในโปรเซส Next.js เดียวกัน)
 * ทำงาน: ทุกวัน 07:00 (Asia/Bangkok) → ดึง MOPH ทุก KPI → บันทึก monthly_data + detail
 *
 * Phase 4.8 design: monthly_data = snapshot ค่าสะสมปีงบ ณ การเก็บล่าสุดของเดือน
 * (รันทุกวันทับเดือนปัจจุบัน → ขึ้นเดือนใหม่ แถวเดือนเก่ากลายเป็นประวัติอัตโนมัติ)
 *
 * ปรับแต่งได้ผ่าน env:
 *   MOPH_CRON           ตาราง cron (default '0 7 * * *' = ทุกวัน 07:00)
 *   MOPH_CRON_TZ        timezone   (default 'Asia/Bangkok')
 *   MOPH_FETCH_YEAR     ปีงบประมาณ พ.ศ. (default = คำนวณอัตโนมัติ)
 *   MOPH_FETCH_PROVINCE จังหวัด (default '66')
 *   MOPH_FETCH_AREACODE areacode prefix (default '6611')
 *   MOPH_FETCH_HOSPCODE hospcode (default '' = ไม่กรอง)
 *   MOPH_CRON_DISABLED  '1' = ปิด cron
 */

// ป้องกันลงทะเบียนซ้ำ (dev HMR / import หลายครั้ง)
const globalForCron = globalThis as unknown as { __mophCronStarted?: boolean }

export function startScheduler() {
  if (globalForCron.__mophCronStarted) return
  if (process.env.MOPH_CRON_DISABLED === '1') {
    console.log('[cron] MOPH auto-batch ถูกปิดไว้ (MOPH_CRON_DISABLED=1)')
    return
  }

  const expr = process.env.MOPH_CRON || '0 7 * * *'
  const timezone = process.env.MOPH_CRON_TZ || 'Asia/Bangkok'

  if (!cron.validate(expr)) {
    console.error(`[cron] รูปแบบ cron ไม่ถูกต้อง: "${expr}" — ยกเลิกการตั้งเวลา`)
    return
  }

  cron.schedule(
    expr,
    async () => {
      const startedAt = new Date().toISOString()
      console.log(`[cron] เริ่มดึง MOPH อัตโนมัติ @ ${startedAt}`)
      try {
        const result = await runBatchSave({
          year:     process.env.MOPH_FETCH_YEAR     || currentMophFiscalYear(),
          province: process.env.MOPH_FETCH_PROVINCE || '66',
          areacode: process.env.MOPH_FETCH_AREACODE ?? '6611',
          hospcode: process.env.MOPH_FETCH_HOSPCODE ?? '',
        })
        console.log(
          `[cron] เสร็จสิ้น: เดือน ${result.savedMonth} | สำเร็จ ${result.saved}/${result.total} | ` +
          `ล้มเหลว ${result.failed}`,
        )
        if (result.failed > 0) {
          for (const r of result.results.filter((x) => x.status === 'error')) {
            console.warn(`[cron]   ✗ ${r.kpiId} (${r.kpiName}): ${r.error}`)
          }
        }
      } catch (e) {
        console.error('[cron] ดึง MOPH ล้มเหลว:', e)
      }
    },
    { timezone },
  )

  globalForCron.__mophCronStarted = true
  console.log(`[cron] ตั้งเวลา MOPH auto-batch แล้ว: "${expr}" (${timezone})`)
}
