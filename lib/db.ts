import mysql from 'mysql2/promise'

// Config จาก env — ถ้าไม่ตั้ง env จะ default เป็น local dev (dhdc_dev) เหมือนเดิมทุกประการ
// production: ตั้ง DB_HOST/DB_NAME/... ผ่าน .env.local (ห้าม hardcode ค่า production ในไฟล์นี้)
const pool = mysql.createPool({
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

export default pool
