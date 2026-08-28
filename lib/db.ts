import mysql from 'mysql2/promise'

// Config จาก env — ถ้าไม่ตั้ง env จะ default เป็น local dev (dhdc_dev) เหมือนเดิมทุกประการ
// production: ตั้ง DB_HOST/DB_NAME/... ผ่าน .env.local (ห้าม hardcode ค่า production ในไฟล์นี้)
const createPool = () => mysql.createPool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     Number(process.env.DB_PORT || 3306),
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD ?? '123456',
  database: process.env.DB_NAME     || 'dhdc_dev',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
})

/**
 * ⚠️ ต้องเก็บ pool ไว้บน globalThis — ห้ามสร้างใหม่ตรงๆ ตอน import
 *
 * Next.js dev (hot reload) โหลดโมดูลนี้ใหม่ทุกครั้งที่แก้ไฟล์ ถ้า createPool() ตรงๆ
 * จะได้ pool ใหม่ทุกรอบ (รอบละ 10 connection) โดย pool เก่าไม่ถูกปิด ยังถือ connection ค้างไว้
 * → แก้โค้ดไปสัก 10-20 รอบ MariaDB จะขึ้น "Too many connections" แล้วทั้งระบบล่ม
 * (อาการ "dev server + MariaDB หยุดเองบ่อย" ที่จดไว้ใน CLAUDE.md ส่วนหนึ่งมาจากตรงนี้)
 *
 * production ไม่มี hot reload จึงได้ pool เดียวเหมือนเดิมทุกประการ — ไม่กระทบพฤติกรรม
 */
const g = globalThis as typeof globalThis & { __dhdcPool?: ReturnType<typeof createPool> }
const pool = g.__dhdcPool ?? createPool()
if (process.env.NODE_ENV !== 'production') g.__dhdcPool = pool

export default pool
