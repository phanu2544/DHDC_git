# DHDC KPI Tracking System

ระบบติดตามตัวชี้วัด KPI สาธารณสุข **อำเภอดงเจริญ จ.พิจิตร** (areacode `6611`, province `66`)
ดึงข้อมูลจริงจาก **MOPH Open Data API** มาคำนวณ/ประเมินผล และ**เก็บ snapshot รายเดือน**เพื่อดูแนวโน้มย้อนหลัง (ซึ่ง HDC ไม่มีให้)

## เทคโนโลยี

- **Framework**: Next.js 14 (App Router) + TypeScript
- **UI**: Tailwind CSS · **Charts**: Recharts · **Icons**: lucide-react
- **Database**: MariaDB (ผ่าน `mysql2`) — ดู [`lib/db.ts`](lib/db.ts)
- **Data source**: MOPH Open Data — `POST https://opendata.moph.go.th/api/report_data`
- **Scheduler**: `node-cron` ในตัว (ดึง MOPH อัตโนมัติทุกวัน 07:00)
- **Export**: `xlsx`

## เริ่มใช้งาน (local dev)

ต้องมี: Node.js + MariaDB (service ชื่อ `MariaDB`) รันที่ `127.0.0.1:3306`

```bash
npm install
npm run dev          # เปิดที่ http://localhost:3002
```

ครั้งแรก — สร้าง schema + seed (categories/users) ด้วย:

```
POST http://localhost:3002/api/init
```

**Database config** อ่านจาก env (ดู [`.env.example`](.env.example)) — ถ้าไม่ตั้งจะ default เป็น local dev:

| env | default (dev) |
|-----|---------------|
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `3306` |
| `DB_USER` | `root` |
| `DB_PASSWORD` | `123456` |
| `DB_NAME` | `dhdc_dev` |

> ห้าม hardcode ค่า production ใน `db.ts` · production ตั้งผ่าน `.env.local` (ดู [production-runbook](docs/production-runbook.md))

## บัญชีทดสอบ (dev demo)

| บทบาท | อีเมล | รหัสผ่าน |
|-------|-------|---------|
| Admin | admin@hospital.go.th | admin123 |
| Staff | staff@hospital.go.th | staff123 |

## หน้าต่างๆ

| หน้า | URL | หมายเหตุ |
|------|-----|---------|
| Login | `/login` | |
| Scorecard ภาพรวม | `/dashboard` | สรุปสถานะ KPI + ลิงก์ไป drilldown |
| รายการ KPI | `/kpi` | ค้นหา/กรอง |
| Drilldown ทั่วไป (รายตำบล) | `/kpi/[id]` | |
| โลหิตจางเด็ก 12 เดือน | `/kpi/anemia` | dual ร้อยละการตรวจ/โลหิตจาง |
| คัดกรองสูงอายุ 9 ด้าน | `/kpi/aged9?table=s_aged9\|s_aged9_app` | คัดกรอง/เสี่ยง/% |
| คัดกรองเสี่ยง DM/HT | `/kpi/screen-risk?disease=dm\|ht` | stacked ปกติ/เสี่ยง/เสี่ยงสูง/สงสัยป่วย |
| วัคซีนเด็กครบ 2 ปี | `/kpi/vaccines` | ความครอบคลุม 5 ชนิด |
| เปรียบเทียบรายเดือน | `/compare` | |
| จัดการระบบ | `/admin` | Admin |
| ตั้งเป้าหมายรายปีงบ | `/admin/targets` | Admin |

หน้า drilldown ทุกหน้าเลือกได้ว่าจะอ่าน **ข้อมูลบันทึกรายเดือน (snapshot)** หรือ **สดจาก MOPH (live)** ผ่าน `MonthPicker` มุมขวาบน

## สถาปัตยกรรมข้อมูล

```
MOPH Open Data ──▶ computeMoph (engine กลาง) ──▶ monthly_data (ค่า headline/เดือน → Scorecard)
   (รายเดือน)                                  └▶ moph_monthly_detail (field ดิบราย รพ.สต. → drilldown ย้อนหลัง)
```

- **`monthly_data`** = ค่า KPI 1 ตัว/เดือน (Scorecard อ่านตัวนี้)
- **`moph_monthly_detail`** = field ดิบราย hospcode/เดือน (JSON) → กราฟ drilldown สร้างย้อนหลังได้
- cron ทุกวัน 07:00 เขียนทั้งสองตาราง (scope 6611) — ขึ้นเดือนใหม่ แถวเดือนเก่ากลายเป็นประวัติอัตโนมัติ

## ไฟล์สำคัญ

| ไฟล์ | หน้าที่ |
|------|--------|
| [`lib/db.ts`](lib/db.ts) | MariaDB pool (env-based, default dev) |
| [`lib/mophEngine.ts`](lib/mophEngine.ts) | `computeMoph` — คำนวณค่าจาก mapping (pure) |
| [`lib/kpiStatus.ts`](lib/kpiStatus.ts) | `evaluateKpiStatus` — ประเมิน pass/watch/fail/… (pure) |
| [`lib/mophBatch.ts`](lib/mophBatch.ts) | `runBatchSave` — ดึง+บันทึกทุก KPI |
| [`lib/mophDetail.ts`](lib/mophDetail.ts) | snapshot field ดิบราย hospcode |
| [`lib/monthlyView.ts`](lib/monthlyView.ts) | `getMonthlyRows` — เลือก snapshot/live (DB ล่ม→live) |
| [`lib/useMonthlyData.ts`](lib/useMonthlyData.ts) | hook กลางหน้า drilldown |
| [`lib/areaRef.ts`](lib/areaRef.ts) | ชื่อตำบลดงเจริญ + `groupByTambon` |
| [`lib/targets.ts`](lib/targets.ts) | เป้าหมายรายปีงบ (`kpi_targets`) |
| [`lib/scheduler.ts`](lib/scheduler.ts) | node-cron auto-batch |
| [`components/MonthPicker.tsx`](components/MonthPicker.tsx) | เลือกเดือน + badge แหล่ง |

ตาราง DB: `kpi_reports · monthly_data · kpi_targets · moph_monthly_detail · moph_snapshot · moph_report_catalog · categories · users`

## Deploy ขึ้น production

ดู [`docs/production-runbook.md`](docs/production-runbook.md) — ตั้ง `.env.local`, รัน `/api/init`, replay config (ต้อง owner sign-off), ตั้ง target, batch scope 6611, และรัน server ถาวรด้วย process manager (ให้ cron ทำงาน)

## สำหรับ AI / นักพัฒนาใหม่

อ่าน [`CLAUDE.md`](CLAUDE.md) ก่อน — สรุปสถาปัตยกรรม ไฟล์สำคัญ และ**ข้อห้ามสำคัญ** (DB dev เท่านั้น / ห้ามแตะ production / scope 6611)
