# DHDC KPI — Plan / Checklist

> งานที่ค้าง + ลำดับที่จะทำต่อ · ทำ**ทีละ step → tick `[x]` → review → commit** · อัปเดต 2026-06-16
> กฎ/สถาปัตยกรรม: ดู [`CLAUDE.md`](../CLAUDE.md) · **ทุก DB op:** backup → preview/gate → COMMIT → verify · scope `6611` · ห้าม commit เองจนกว่า user สั่ง

---

## ✅ เสร็จแล้ว (Phase 8 — เก็บข้อมูลรายเดือน)
- [x] กราฟ HDC-style รายตำบล 4 หน้า: vaccines · aged9 (คัดกรอง/เสี่ยง/%) · screen-risk (stacked) · anemia (dual + หัวคอลัมน์ HDC)
- [x] เก็บ detail รายเดือน + อ่าน snapshot/live (`monthlyView` · `MonthPicker` · `useMonthlyData` · `groupByTambon`)
- [x] Re-sync 6611 → ค่า Scorecard ตรง HDC ปัจจุบัน (backup: `_resync_backup/`)
- [x] Audit ตรง HDC (40 KPI: map ถูกหมด, stale 2 ตัวแก้แล้ว, structural 5 ตั้งใจ)
- [x] docs: README ใหม่ + CLAUDE.md + Phase 8 ใน runbook + consolidate docs

---

## A. รอ owner (เราเตรียมให้แล้ว — owner ลงมือ)
> ตรวจ DB 2026-06-18: `target=0` มี **12 ตัว** = 🟢5 ตั้งใจ `none` (tracking ไม่ใช่งานค้าง: มะเร็งปากมดลูก, เบาหวานรายใหม่, มะเร็งลำไส้, วัคซีน, telemed) + 🔴7 `gte` ค้าง (ใน 7 มี 2 ติด no-data) · kpi_targets 2569 ใช้จริงแค่ 1 (มะเร็งเต้านม=85)
- [ ] ตั้ง **target 5 ตัว** (มีข้อมูลจริง) ผ่าน `/admin/targets`: สูงอายุ9ด้าน×2 (`s_aged9`/`_app`), คัดกรอง DM 35+ (`s_dm_screen_risk`), Healthy Ageing (`s_kpi_ageing`), HT รายใหม่ (`s_ht_diag_follow`)
- [ ] **ยืนยันค่า 85%** มะเร็งเต้านม (`kpi-1780629640168`) — DB ตั้งแล้ว 13 มิ.ย. แต่ packet ข้อ 4 ยังเขียน "ยังไม่กำหนด"
- [ ] รับรองนิยาม **โลหิตจาง** + **NCD BP** — owner-packet ข้อ 9,10 (ยังไม่เซ็น · owner ตอบข้อ 1-8,11-12 แล้ว)
- [ ] ตัดสิน **2 KPI ไม่มีข้อมูล 6611** (`s_tida4i` kpi-...272 target=75, `s_childdev_specialpp48` kpi-...336) — ตารางผิด/ดงเจริญไม่มีจริง
- [ ] *(ปลดล็อก)* เลือก numerator **HT รายใหม่** (ข้อ 6) + mapping **TEDA4I** 2.3/2.4 (ข้อ 11 บรรทัดสรุปยังว่าง)

## B. Cleanup เล็ก (เราทำได้เลย — ได้ของเร็ว)  ⬅️ เริ่มที่นี่
- [x] ลบ **kpi-01** (KPI ทดสอบค้าง ซ้ำ s_dm_control) — *DB op เสร็จ 2026-06-18: backup `_resync_backup/kpi-01-delete-2026-06-18/` → preview(ROLLBACK) → COMMIT (monthly_data 2 + moph_monthly_detail 56 + kpi_reports 1, kpi_targets 0) → verify หาย/ตัวจริง kpi-1780634936954 ครบ · รวม KPI 40→39*
- [x] โลหิตจาง **(เสร็จ 2026-06-18, commit a8917ec)**: ✅ label owner-packet (result=A1 numerator, result_ill=ไม่ใช้ + ลบ path หลง) · ✅ ชื่อ KPI คงเดิม (ไม่ตัด "(Coverage)") · ✅ ห้วยร่วมแสดง `0.00` ตรง HDC + ทุก % 2 ตำแหน่ง
- [x] คู่มือไทย **(เสร็จ 2026-06-18)**: port `3000`→`3002` ทุกจุดใน `คำสั่งที่ใช้บ่อย.md` (15 จุด) + db.ts/dev DB ใน body ตรง CLAUDE.md (env, `dhdc_dev` root/123456, mysql.exe path) · production host เหลือ 1 จุดมี caveat
- [x] `docs/data_owner/` + `data/` → **gitignore ทั้งคู่** + untrack `tsconfig.tsbuildinfo` **(เสร็จ 2026-06-18, commit a8917ec)**

## C. Feature ต่อยอด (เลือกทำ / รอเงื่อนไข)
- [x] **registry `detail_view`** **(เสร็จ 2026-06-18)** — `lib/detailView.ts` (map mophTable→href + fallback `/kpi/[id]`), dashboard เรียก `detailViewHref(r.kpi)` แทน ternary chain · verify URL เดิมเป๊ะ
- [x] **formatter เดือน พ.ศ./เดือนไทย** **(เสร็จ 2026-06-18)** — `lib/formatMonth.ts` `formatThaiMonth("2026-06")→"มิถุนายน 2569"` ใช้ใน MonthPicker + dashboard + `kpi/[id]` (ยุบ inline/ซ้ำ 4 จุด) · `compare` คง `month:'short'` ตั้งใจ (ไม่ยุบ)
- [x] **target mode toggle + self-service** **(เสร็จ 2026-06-18)** — `/admin/targets` สลับ "ประเมิน ↔ ติดตามเฉยๆ" (track→`evaluation_direction=none` เก็บเป้าเดิม สลับกลับได้) + เลือกทิศทาง gte/lte + เปิดให้ **staff (ผู้รับผิดชอบ)** เข้ากรอกเอง (audit เก็บชื่อ) · API `PUT /api/targets` รับ `mode`/`direction` (backward-compat) · verify browser ครบ capture→test→restore · ⏳ ค้าง: ผูก owner↔user (D2-B), per-year mode (D3)
- [x] **Auth-1: API authentication** **(เสร็จ 2026-06-18)** — signed JWT (`jose`) ใน HttpOnly cookie (`lib/auth.ts`) + `middleware.ts` กัน `/api/*` (401 ถ้าไม่ login) · whitelist login/logout/dbinfo/init · login เซ็ต cookie + เพิ่ม `/api/auth/logout`,`/me` · env `AUTH_SECRET` (dev มี fallback, prod ต้องตั้ง) · verify: unauth→401 / login→200 / HttpOnly จริง / logout→401 / build edge middleware ผ่าน
- [x] **Auth-2: hash รหัสผ่าน (bcrypt)** **(เสร็จ 2026-06-18)** — `lib/password.ts` (bcryptjs, hashPassword/verifyPassword + fallback plaintext กัน lockout ช่วง transition) · login เทียบด้วย bcrypt.compare (ไม่คืน password กลับ client) · init seed + users POST/PATCH hash ตอนเขียน · **migration DB**: hash 3 users เดิม (backup `_resync_backup/users-prehash-2026-06-18.sql` → COMMIT → verify is_bcrypt=1) · verify login admin/staff ถูก→200 ผิด→401 · middleware ยัง 33.2kB (bcryptjs ไม่เข้า edge) · ⏳ ค้าง: **Auth-3** client อ่าน `/me` แทน localStorage, rate-limit login
- [x] **role-guard per-route + Navbar** **(เสร็จ 2026-06-18)** — middleware แยก role: `/api/users` admin ทุก method · `/api/kpis`,`/api/categories`,`/api/monthly`,`/api/moph*` mutation=admin (GET เปิด) · staff→403 บนเส้น admin, admin→ผ่าน · `/api/targets` staff ยังได้ (D2-C) · Navbar เปิดลิงก์ "ตั้งเป้าหมาย" ให้ staff เห็น · verify 2 role ผ่าน · ⏳ ค้าง: Auth-3, rate-limit
- [ ] **กราฟเส้น trend รายเดือน** — ⏳ รอ cron เก็บ **≥2 เดือน** ก่อน (โครงพร้อม)
- [ ] ตาราง `kpi_monthly_measure` — เฉพาะถ้าทำ exec trend หนักๆ (ตอนนี้ field ดิบพอ)

## D. 🚀 Production go-live (ก้อนใหญ่ — ต้อง owner sign-off)
- [ ] ตั้ง `.env.local` (production DB) + ตรวจ `/api/dbinfo` ขึ้น "production"
- [ ] `POST /api/init` บน production (สร้าง schema)
- [ ] Replay config ตาม `production-runbook.md` (snapshot→gate→verify) — ⚠️ owner sign-off โลหิตจาง/NCD BP
- [ ] ตั้ง target ปีงบ + batch scope 6611 + verify ตรง dev
- [~] **Process manager (PM2/NSSM)** **(เตรียม 2026-06-18)** — ✅ `ecosystem.config.js` (รัน next start port 3002, autorestart) + runbook turnkey (A1 PM2 app / A2 MariaDB service auto-start / A3 verify) · build verify ผ่าน · **เหลือ user รันเอง:** `pm2 start ecosystem.config.js` + `sc.exe config MariaDB` (ต้อง UAC) → ปลดล็อก cron สะสมเดือน → trend ใช้ได้

## E. 💡 เพิ่ม KPI จาก MOPH ผ่านเว็บ (ทำเมื่อ owner เริ่มอยากเพิ่มเอง)
> มีแล้ว: `/admin` tab MOPH+catalog → ใส่ table → Preview field → map (single/sumFields) → Save → ขึ้น Scorecard + generic drilldown `/kpi/[id]` + snapshot อัตโนมัติ
- [ ] **MOPH table browser** — เลือกตารางจาก catalog แทนพิมพ์เอง (กันพิมพ์ผิด/เดา)
- [ ] **Auto-suggest mapping + ปุ่ม "ทดสอบคำนวณ"** ก่อน save (โชว์ค่า+สถานะที่จะได้)
- [ ] (ขั้นสูง) **drilldown builder** — กำหนดกราฟ/คอลัมน์จาก field เองได้ (ลดการเขียนโค้ด per KPI)

---

## ลำดับที่แนะนำ
**B (cleanup, ได้ของเร็ว) → C (detail_view + formatter) → เตรียม D (production)**
· A = ติดตาม owner ขนาน · E = เมื่อ owner เริ่มเพิ่ม KPI เอง

## วิธีใช้ไฟล์นี้
ทำทีละข้อ → `[ ]` เป็น `[x]` → review + commit · ข้อที่แตะ DB ทำตามกฎ backup→gate→verify เสมอ
