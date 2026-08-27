# CLAUDE.md — คู่มือ AI สำหรับโปรเจกต์ DHDC KPI

> **อ่านไฟล์นี้ก่อนเริ่มงานเสมอ** สรุปสิ่งที่ต้องรู้ + ข้อห้าม แล้วค่อยดู [`README.md`](README.md) (ภาพรวม) และ [`docs/production-runbook.md`](docs/production-runbook.md) (deploy)

## โปรเจกต์คืออะไร
ระบบติดตาม KPI **โรงพยาบาลดงเจริญ (DHDC) จ.พิจิตร** — ดึงข้อมูลจริงจาก MOPH Open Data API มาคำนวณ/ประเมิน + เก็บ snapshot รายเดือนเพื่อดูแนวโน้ม (HDC ไม่เก็บประวัติรายเดือน = จุดขายของระบบนี้)
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
- cron (`lib/scheduler.ts`) ทุกวัน 07:00 เขียนทั้งสองตาราง scope 6611 + log 1 แถวลง `cron_log` (trigger='cron') — **ทำงานเฉพาะตอน server เปิด** (production ต้อง process manager) · สถานะ cron/ความสดข้อมูลดูได้ที่ `/admin` แท็บ Database (`GET /api/cron-status`)

## ไฟล์สำคัญ (ดูที่ไหน)
- **engine (pure):** `lib/mophEngine.ts` (computeMoph) · `lib/kpiStatus.ts` (evaluateKpiStatus) · `lib/scorecard.ts`
- **batch/cron:** `lib/mophBatch.ts` (runBatchSave — มี opt `trigger`, log `cron_log` เฉพาะ full-batch) · `lib/mophDetail.ts` (snapshot, มี `KEEP_MONTHLY_TABLES` สำหรับ s_epi2/s_kpi_ageing/s_colon_screen_w เก็บ field ไตรมาส) · `lib/scheduler.ts`
- **หน้า `/admin` (`app/admin/page.tsx` ~1550 บรรทัด):** 4 แท็บ — **KPI** (จัดการ KPI/หมวดหมู่ + ปุ่ม "🧭 เพิ่มตัวชี้วัด"=`components/KpiWizard.tsx` + 🔄 ดึงทีละตัว) · **MOPH** (Mapping Builder=`components/FieldChipBuilder.tsx` + preview + batch) · **ผู้ใช้** · **Database** (สถานะ DB + Migrate&Seed + แผง cron) · *(Catalog tab ถูกลบ 2 ก.ค. — dead code)*
- **drilldown รายเดือน:** `lib/monthlyView.ts` (snapshot/live + DB-ล่ม→live) · `lib/useMonthlyData.ts` (hook) · `components/MonthPicker.tsx` · `lib/areaRef.ts` (`groupByTambon`, ชื่อตำบล)
- **targets:** `lib/targets.ts` + `/admin/targets`
- **manual KPI (กรอกค่าเอง):** `lib/manualKpi.ts` (`isManualEntry` อ่าน flag `kpi_reports.manual_entry`) · ติ๊ก "กรอกค่าเอง" ในฟอร์ม `/admin` · `runBatchSave`/cron **ข้าม** ตัว manual · กรอก**รายหน่วยบริการ** (B/A, 7 หน่วย `HOSPCODE_NAMES`) ที่หน้า `/kpi/[id]` (admin) → `POST /api/monthly/detail` เขียน `moph_monthly_detail` (hospcode จริง, {target,result}) + `monthly_data` รวม (ΣA/ΣB) + audit (`source/entered_by/entered_at`) · detail **บังคับ mapping result/target + view=unit** เมื่อ manual · **ทำไมราย hospcode ไม่ใช่ตำบล:** hospcode→tambon ไม่ใช่ 1:1 (07705 คุม ต.01+02, รพ.ดงเจริญ 27980 คุม ต.01+05) → เลขรวมต่อ hospcode แตกกลับเป็นตำบลไม่ได้ ห้ามเดา
- **drilldown pages:** `app/kpi/{anemia,aged9,screen-risk,vaccines,ageing,colon-fit}/page.tsx` + API คู่ที่ `app/api/<name>/route.ts` · ทุกหน้ามี toggle รายตำบล↔รายหน่วยบริการ (`?view=area|unit` → `groupByTambon`/`groupByHospcode`)
- **ป้ายคอลัมน์ generic `/kpi/[id]`:** `lib/detailLabels.ts` (map `moph_table`→{field:ป้ายไทย}) · **มี entry = whitelist โชว์เฉพาะคอลัมน์นั้น + ลำดับ + ป้ายไทย · ไม่มี = field ดิบทั้งหมด** · เพิ่มทีละ KPI (ห้ามเดา field — ดู [`docs/drilldown-labels-checklist.md`](docs/drilldown-labels-checklist.md)) · `saveMonthlyDetail` รวม row key ซ้ำด้วย sum + DELETE ก่อน insert → drilldown รวม = Scorecard เสมอ
- **dashboard ลิงก์ drilldown** ตาม `mophTable` (ดู `app/dashboard/page.tsx`)

## เอกสารอื่น
- 🚩 [`docs/HANDOFF.md`](docs/HANDOFF.md) — **เริ่มแชทใหม่อ่านไฟล์นี้ก่อนเสมอ** (สถานะล่าสุด + การตัดสินใจของ owner + กฎที่พลาดแล้วเจ็บ)
- [`docs/PLAN.md`](docs/PLAN.md) — **checklist งานที่ค้าง + ลำดับที่จะทำต่อ**
- [`README.md`](README.md) — ภาพรวม + setup + รายการหน้า
- [`docs/production-runbook.md`](docs/production-runbook.md) — go-live (env, /api/init, replay config, batch, cron)
- [`docs/owner-packet-kpi-2569.md`](docs/owner-packet-kpi-2569.md) — นิยาม KPI ที่ owner รับรอง (⚠️ บางป้าย field สลับ เช่น โลหิตจาง result/result_ill — ยึดค่าที่ตรง HDC)

## หมายเหตุข้อมูล
- HDC screenshot ใน `data/` = ดงเจริญ (เชื่อถือได้) · CSV `.txt` ใน `data/` = จังหวัดรหัส 11 → **ใช้ได้แค่ดู schema ห้ามเทียบค่า**
- KPI drilldown ที่ทำเป็น snapshot รายเดือนแล้ว: anemia (s_child_hct), aged9 (s_aged9/_app), screen-risk (s_dm/s_ht_screen_risk), vaccines (s_epi2), Healthy Ageing (s_kpi_ageing → `/kpi/ageing` 2 รอบ), มะเร็งลำไส้ FIT test (s_colon_screen_w → `/kpi/colon-fit` แสดง FIT+/FIT− area/unit)
- **KPI กรอกค่าเอง (manual):** `s_epi_complete` (fully immunized) — Open Data คำนวณ per-child ไม่ได้ (ดู [`docs/kpi-verify-2569.md`](docs/kpi-verify-2569.md)) → owner กรอก**รายหน่วยบริการ** (7 หน่วย) จาก HDC เดือนละครั้ง · มี flag `manual_entry` ให้ติ๊ก KPI อื่นเพิ่มได้เอง
- **verify ค่าตรง HDC:** เทียบ `monthly_data` (ระบบ) ↔ HDC screenshot ใน `data/` **ช่วงเวลาเดียวกัน** (อย่าเทียบ MOPH live วันนี้ — ข้อมูลขยับ) · ผลรอบล่าสุด: 17/18 ตรง auto + 1 manual (ดู [`docs/kpi-verify-2569.md`](docs/kpi-verify-2569.md))
