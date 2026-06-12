/**
 * Next.js instrumentation hook
 * สตาร์ท MOPH auto-batch cron (snapshot รายวัน scope ดงเจริญ 6611)
 * ปิดได้ด้วย env MOPH_CRON_DISABLED=1
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('@/lib/scheduler')
    startScheduler()
  }
}
