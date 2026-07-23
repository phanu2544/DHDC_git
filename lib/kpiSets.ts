/**
 * kpiSets — helper กลางสำหรับแกน "ชุด/ประเภทตัวชี้วัด" (docs/kpi-sets-plan.md)
 * แยกออกจาก route.ts เพราะ Next.js App Router ห้าม route ไฟล์ export ค่าอื่นนอกจาก HTTP handler
 */

// slug ต้องเป็น ASCII lowercase + เลข + ขีด (ใช้เป็น URL /sets/<slug>) — กันภาษาไทยหลุดเข้า path
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
