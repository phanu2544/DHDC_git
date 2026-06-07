# DHDC KPI Tracking System

ระบบติดตามตัวชี้วัด KPI สำหรับ HDC กระทรวงสาธารณสุข

## วิธีติดตั้งและใช้งาน

```bash
# ติดตั้ง dependencies
npm install

# รันในโหมด development
npm run dev
```

เปิดเบราว์เซอร์ที่ http://localhost:3000

## บัญชีผู้ใช้ทดสอบ

| บทบาท | อีเมล | รหัสผ่าน |
|-------|-------|---------|
| Admin | admin@hospital.go.th | admin123 |
| Staff | staff@hospital.go.th | staff123 |

## หน้าต่างๆ

| หน้า | URL | สิทธิ์ |
|------|-----|--------|
| Dashboard ภาพรวม | /dashboard | ทุกคน |
| รายการ KPI | /kpi | ทุกคน |
| เปรียบเทียบรายเดือน | /compare | ทุกคน |
| จัดการระบบ | /admin | Admin เท่านั้น |

## ฟีเจอร์

- **Dashboard**: สรุปจำนวน KPI แยกสถานะ, Donut chart, รายการ KPI เกินกำหนด
- **KPI List**: ค้นหา/กรองตามหมวดหมู่และสถานะ, คลิกดูกราฟแนวโน้มรายเดือน
- **Monthly Compare**: เลือกเดือน เปรียบเทียบ ▲▼ จากเดือนก่อน พร้อม sparkline
- **Admin Panel**: เพิ่ม/แก้ไข/ลบ KPI, เปลี่ยนสถานะ, ดูรายชื่อผู้ใช้

## เทคโนโลยีที่ใช้

- **Framework**: Next.js 14 (App Router)
- **UI**: Tailwind CSS
- **Charts**: Recharts
- **Storage**: localStorage (browser)
- **Language**: TypeScript

## ขยายระบบในอนาคต

1. **เชื่อม MOPH API**: แก้ `/lib/storage.ts` เพิ่ม fetch จาก opendata.moph.go.th
2. **Google Sheets**: แทน localStorage ด้วย Google Sheets API
3. **Deploy**: Push ขึ้น GitHub แล้ว deploy บน Vercel ฟรี
