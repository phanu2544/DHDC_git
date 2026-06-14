import { NextResponse } from 'next/server'

/**
 * GET /api/dbinfo — คืนค่า connection จริงที่ server ใช้ (จาก env เดียวกับ lib/db.ts)
 * ระบบภายใน — แสดง host/database ได้ · ไม่คืน user/password
 */
export async function GET() {
  return NextResponse.json({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'dhdc_dev',
    label: process.env.NEXT_PUBLIC_DB_LABEL || 'local dev',
  })
}
