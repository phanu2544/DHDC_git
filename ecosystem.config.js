/**
 * PM2 process manager config — รัน Next.js (production) แบบถาวร + autorestart + รันตอน boot
 * เพื่อให้ node-cron in-process (lib/scheduler.ts) เก็บ snapshot รายเดือนต่อเนื่อง
 * (ปมที่เจอจริง: dev/app หยุดเอง → cron ไม่รัน → ไม่มีประวัติรายเดือน)
 *
 * วิธีใช้ (ดูขั้นตอนเต็มใน docs/production-runbook.md):
 *   npm run build
 *   pm2 start ecosystem.config.js
 *   pm2 save && pm2 startup
 *
 * หมายเหตุ:
 *  - ต้อง `npm run build` ก่อน (PM2 รัน next start = production build เท่านั้น — dev ไม่สตาร์ท cron แบบถาวร)
 *  - ค่า DB/MOPH อ่านจาก .env.local (Next โหลดเอง) — ไม่ใส่ความลับในไฟล์นี้ (ไฟล์นี้ commit ได้)
 *  - ปิด cron ชั่วคราวได้ด้วย env MOPH_CRON_DISABLED=1 ใน .env.local
 *  - รัน next ผ่าน binary ตรงๆ เลี่ยงปัญหา npm.cmd บน Windows
 */
module.exports = {
  apps: [
    {
      name: 'dhdc-kpi',
      script: './node_modules/next/dist/bin/next',
      args: 'start -p 3002',
      interpreter: 'node',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      time: true, // timestamp หน้า log แต่ละบรรทัด
      env: { NODE_ENV: 'production' },
    },
  ],
}
