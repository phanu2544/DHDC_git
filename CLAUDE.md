# CLAUDE.md — คู่มือ AI สำหรับโปรเจกต์ DHDC KPI

> **อ่านไฟล์นี้ก่อนเริ่มงานเสมอ** สรุปสิ่งที่ต้องรู้ + ข้อห้าม แล้วค่อยดู [`README.md`](README.md) (ภาพรวม) และ [`docs/production-runbook.md`](docs/production-runbook.md) (deploy)

## โปรเจกต์คืออะไร
ระบบติดตาม KPI สาธารณสุข **อำเภอดงเจริญ จ.พิจิตร** — ดึงข้อมูลจริงจาก MOPH Open Data API มาคำนวณ/ประเมิน + เก็บ snapshot รายเดือนเพื่อดูแนวโน้ม (HDC ไม่เก็บประวัติรายเดือน = จุดขายของระบบนี้)
Stack: Next.js 14 (App Router) + TypeScript + MariaDB (mysql2) + Recharts + node-cron · dev port **3002**

## ⛔ ข้อห้ามสำคัญ (เด็ดขาด)
1. **DB = `dhdc_dev` (127.0.0.1, root/123456) เท่านั้น** — `lib/db.ts` ห้ามแก้กลับเป็น production
2. **ห้ามแตะ production DB** (`192.168.0.236` / db `dhdc` / user `dong`) — go-live ทำตาม runbook + owner sign-off
3. **service MariaDB ชื่อ `MariaDB`** เท่านั้น — service `MySQL` เป็นของ BMS **ห้ามแตะ** (สตาร์ท MariaDB ต้องใช้ UAC → ให้ user ทำเอง)
4. **ห้าม commit เอง** จนกว่า user สั่ง ("commit & push") · **scope พื้นที่ = areacode `6611`** เท่านั้น (province 66, ปีงบ 2569)
5. **ห้ามเดา target / field mapping** — ยืนยันกับค่า HDC หรือถาม owner ก่อน
6. **แก้ข้อมูล DB** ต้อง: snapshot/backup → preview(ROLLBACK) → gate (ROW_COUNT) → COMMIT → verify · **ห้าม SQL UPDATE `monthly_data.value` ตรงๆ**

## วิธีรัน / ทดสอบ
- `npm run dev` (port 3002) · ครั้งแรก `POST /api/init` สร้าง schema+seed
- DB query: `"C:/Program Files/MariaDB 10.5/bin/mysql.exe" -u root -p123456 dhdc_dev --default-character-set=utf8mb4`
- login dev: `admin@hospital.go.th` / `admin123`
- dev server + MariaDB **หยุดเองบ่อย** บนเครื่องนี้ — เช็ค port 3002 / ping DB ก่อนถ้าเจอ connection refused

## สถาปัตยกรรม (data flow)
```
MOPH Open Data ─POST report_data─▶ computeMoph(engine) ─▶ monthly_data (1 ค่า/เดือน → Scorecard)
                                                        └▶ moph_monthly_detail (field ดิบราย รพ.สต. → drilldown)
```
- **Scorecard** (`/dashboard`) อ่าน `monthly_data` · **drilldown** อ่าน `moph_monthly_detail` (snapshot) หรือ live ผ่าน `lib/monthlyView.getMonthlyRows`
- cron (`lib/scheduler.ts`) ทุกวัน 07:00 เขียนทั้งสองตาราง scope 6611 — **ทำงานเฉพาะตอน server เปิด** (production ต้อง process manager)

## ไฟล์สำคัญ (ดูที่ไหน)
- **engine (pure):** `lib/mophEngine.ts` (computeMoph) · `lib/kpiStatus.ts` (evaluateKpiStatus) · `lib/scorecard.ts`
- **batch/cron:** `lib/mophBatch.ts` (runBatchSave) · `lib/mophDetail.ts` (snapshot, มี `KEEP_MONTHLY_TABLES` สำหรับ s_epi2) · `lib/scheduler.ts`
- **drilldown รายเดือน:** `lib/monthlyView.ts` (snapshot/live + DB-ล่ม→live) · `lib/useMonthlyData.ts` (hook) · `components/MonthPicker.tsx` · `lib/areaRef.ts` (`groupByTambon`, ชื่อตำบล)
- **targets:** `lib/targets.ts` + `/admin/targets`
- **drilldown pages:** `app/kpi/{anemia,aged9,screen-risk,vaccines}/page.tsx` + API คู่ที่ `app/api/<name>/route.ts`
- **dashboard ลิงก์ drilldown** ตาม `mophTable` (ดู `app/dashboard/page.tsx`)

## เอกสารอื่น
- [`README.md`](README.md) — ภาพรวม + setup + รายการหน้า
- [`docs/production-runbook.md`](docs/production-runbook.md) — go-live (env, /api/init, replay config, batch, cron)
- [`docs/owner-packet-kpi-2569.md`](docs/owner-packet-kpi-2569.md) — นิยาม KPI ที่ owner รับรอง (⚠️ บางป้าย field สลับ เช่น โลหิตจาง result/result_ill — ยึดค่าที่ตรง HDC)

## หมายเหตุข้อมูล
- HDC screenshot ใน `data/` = ดงเจริญ (เชื่อถือได้) · CSV `.txt` ใน `data/` = จังหวัดรหัส 11 → **ใช้ได้แค่ดู schema ห้ามเทียบค่า**
- KPI drilldown ที่ทำเป็น snapshot รายเดือนแล้ว: anemia (s_child_hct), aged9 (s_aged9/_app), screen-risk (s_dm/s_ht_screen_risk), vaccines (s_epi2)
