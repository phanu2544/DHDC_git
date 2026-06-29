# DHDC KPI — Plan / Checklist

> งานที่ค้าง + ลำดับที่จะทำต่อ · ทำ**ทีละ step → tick `[x]` → review → commit** · อัปเดต 2026-06-24
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
- [~] ~~ตั้ง target 5 ตัว~~ → **ตรวจ DB 21 มิ.ย.: ทั้ง 5 ตัวเป็น "ติดตามเฉยๆ" (`none`) แล้ว** (`s_aged9`/`_app`, `s_dm_screen_risk`, `s_ht_diag_follow`, `s_kpi_ageing`) · **Healthy Ageing แก้เพิ่ม 21 มิ.ย.:** เดิม config รวมรอบ1+รอบ2 (ผิดกฎ HDC) + snapshot เก็บแค่ `target` → แก้เป็นรอบ1 (`result1q1/targetq1`=96.10% ตรง HDC) + เก็บ field ไตรมาสครบ (`s_kpi_ageing`∈`KEEP_MONTHLY_TABLES`) + drilldown label ไทย · **+ หน้า drilldown เฉพาะแบบ HDC เต็ม (21 มิ.ย.):** `/kpi/ageing` + `/api/ageing` แสดง 2 รอบ (คัดกรอง/ติดสังคม/ติดบ้าน/ติดเตียง/% แยกรอบ) + 2 กราฟ · register ใน `detailView` · ตรง HDC ทุกตำบลทั้ง 2 รอบ · **เหลือ owner ยืนยันว่า 5 ตัวนี้ "ติดตาม" ถูกต้อง (หรือมีตัวที่อยากกลับมาประเมิน)**
- [ ] **ยืนยันค่า 85%** มะเร็งเต้านม (`kpi-1780629640168`) — DB ตั้งแล้ว 13 มิ.ย. แต่ packet ข้อ 4 ยังเขียน "ยังไม่กำหนด"
- [ ] รับรองนิยาม **โลหิตจาง** + **NCD BP** — owner-packet ข้อ 9,10 (ยังไม่เซ็น · owner ตอบข้อ 1-8,11-12 แล้ว)
- [x] ตัดสิน **KPI พัฒนาการเด็กที่ยังไม่มีข้อมูล** — **เสร็จ 21 มิ.ย.: ตั้ง "ติดตามเฉยๆ" (`none`) ครบ 3 ตัว** (ตรวจ MOPH 18 มิ.ย., owner-packet ภาคผนวก ก): `s_tida4i`(9-60ด.)=ดงเจริญไม่มีเคสจริง · `s_tida4i_o`(0-5)=config ถูก+ค่า 0 จริง (N=1 รพ.สต.07707, owner ยืนยัน field ข้อ 11: 2.3=`1b27x`, 2.4=`stimulate`) · `s_childdev_specialpp48`=รายงานช่วงรณรงค์ ปี 2569 ยังไม่ถึงรอบ (DB op 21 มิ.ย.: backup→gate→COMMIT→verify, `kpi-1780808040336` gte→none) · **เหลือ owner ติ๊กยืนยัน ก.1/ก.2 ในเอกสาร**
- [ ] *(ปลดล็อก)* เลือก numerator **HT รายใหม่** (ข้อ 6) + mapping **TEDA4I** 2.3/2.4 (ข้อ 11 บรรทัดสรุปยังว่าง)
- [x] **Verify KPI ประเมินจริงตรง HDC** **(เสร็จ 22 มิ.ย. — ดู [`docs/kpi-verify-2569.md`](kpi-verify-2569.md))** — ตรวจ 18 ตัว gte กลุ่ม `value_field` ว่าง (default `'result'`) เทียบ HDC screenshot: **ถูก 17/18** (`'result'/'target'` = สูตร HDC) · 🔴 เจอ `s_epi_complete` ผิด (ดูข้อล่าง) · ยังไม่ตรวจกลุ่ม `none` (เสี่ยงต่ำ)
- [x] **Go-live readiness audit ครบ 39 ตัว + แก้ config bug** **(เสร็จ 29 มิ.ย. — ดู verify รอบ 2)** — 🔴 เจอ+แก้ **`s_dm_screen_n`** map ผิด `result/target`(35+)→`result1/target1`(35-59): 75.38→**79.23%** [backup→gate→COMMIT→re-batch kpiId เดียว→verify self-consistent + ไม่กระทบตัวอื่น] · พิสูจน์ผ่าน `s_ht_screen_n` ตรง HDC 81.17 · 🟡 cosmetic: `s_colon_screen_w` unit `%`→`ราย`, `s_tida4i` target `75`→`0` · ✅ verify เพิ่ม: s_ht_screen_n, s_dm_hypo, s_dm_hba1c ถูก · 🟠 เหลือ owner 4 ตัว (โลหิตจาง/NCD BP นิยาม + s_ht_diag_follow/s_cf_dm_diag เลือก field) → checklist · ⚠️ go-live: owner เหลือบ HDC DM 35-59 ยืนยัน 79.x
- [x] **แก้ `s_epi_complete` + ระบบ manual-entry แบบ future-proof** **(เสร็จ 22-23 มิ.ย.)** — fully immunized = AND ทุกวัคซีนราย คน → Open Data คำนวณไม่ได้ (ลองทุกวิธี=42.53%) · เลขจริงอยู่ใน api-hdc ที่ต้อง token 2 ชม. (ดึง auto ไม่ยั่งยืน) → ใช้ **manual-entry แบบ flag ใน DB (self-service) + กรอกรายตำบล**: column `kpi_reports.manual_entry` ติ๊กในฟอร์ม `/admin` ได้เอง · `runBatchSave`/cron อ่าน flag→ข้าม · หน้า `/kpi/[id]` โหมด manual = **ตารางกรอกรายตำบล (B/A) → คำนวณ % สด + กราฟ + รวมอำเภอ ΣA/ΣB** (admin แก้ได้, อื่นอ่านอย่างเดียว) เก็บใน `moph_monthly_detail` ผ่าน `POST /api/monthly/detail` · **audit** (`monthly_data.source/entered_by/entered_at` + "อัปเดตล่าสุดโดย…") · **เตือน stale** · กรอกรายตำบลตรง HDC แล้ว (รวม 86.89%) · verify ครบ: per-tambon ตรง HDC ทุกตำบล ✅ self-service toggle→batch skip/resume ✅ audit ✅ staff อ่านอย่างเดียว ✅ regression ✅ · **เหลือ owner กรอกเดือนละครั้งจาก HDC**

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
- [x] **role-guard per-route + Navbar** **(เสร็จ 2026-06-18)** — middleware แยก role: `/api/users` admin ทุก method · `/api/kpis`,`/api/categories`,`/api/monthly`,`/api/moph*` mutation=admin (GET เปิด) · staff→403 บนเส้น admin, admin→ผ่าน · `/api/targets` staff ยังได้ (D2-C) · Navbar เปิดลิงก์ "ตั้งเป้าหมาย" ให้ staff เห็น · verify 2 role ผ่าน
- [x] **Auth-3: client เชื่อ server ไม่เชื่อ localStorage + rate-limit + กัน init** **(เสร็จ 2026-06-21)** — `lib/useAuth.ts` ดึง identity/role จาก `/api/auth/me` (signed cookie) ไม่ใช่ localStorage → spoof role ใน devtools ไม่ทำให้ UI admin โผล่ · refactor 6 หน้า (dashboard/kpi/compare/kpi[id]/admin/targets) เลิกใช้ `getSession` · **(21 มิ.ย. ปิด gap):** `lib/useMonthlyData` ใช้ `useAuth` ภายใน → 4 หน้า drilldown (anemia/aged9/screen-risk/vaccines) เลิกเชื่อ localStorage ด้วย (ไม่ต้องแก้หน้า) · เพิ่ม `department` เข้า JWT (ให้ /me ครบ) · `lib/rateLimit.ts` กัน brute-force login 10ครั้ง/5นาที/IP (รีเซ็ตเมื่อสำเร็จ) · `/api/init` ถ้ามี user แล้วต้อง admin (bootstrap DB ว่างยังเปิด) · **verify browser ครบ:** /me มี department / staff spoof→เด้ง /dashboard + /api/users 403 / 10×401→429 / init non-admin 403 admin 200 / build edge 33.4kB · ⏳ ค้าง (ไม่ด่วน): per-year target mode (D3), owner↔user link (D2-B)
- [x] **dashboard discoverability (manual)** **(เสร็จ 24 มิ.ย.)** — Scorecard มีป้าย "✍️ กรอกมือ" + แจ้ง "ยังไม่กรอกเดือนนี้" (value=null) บน KPI ที่ flag manual
- [x] **drilldown สลับมุมมอง รายตำบล ↔ รายหน่วยบริการ** **(เสร็จ 24 มิ.ย.)** — `/api/detail?view=area|unit` group ตาม tambon หรือ hospcode · `lib/areaRef.HOSPCODE_NAMES` (ดงเจริญ 7 หน่วย จาก HDC) · ปุ่ม toggle ในหน้า generic `/kpi/[id]` (เฉพาะ KPI auto) · verify: breast_screen area(5 ตำบล)↔unit(7 หน่วย) รวม 76.94% เท่ากัน · ⏳ custom pages (aged9/ageing/screen-risk/vaccines) ยังเป็นรายตำบล = follow-up
- [x] **manual KPI: เปลี่ยนกรอกรายตำบล → รายหน่วยบริการ (hospcode)** **(เสร็จ 24 มิ.ย.)** — owner อยาก toggle 2 มุมในตัว manual แต่ตรวจข้อมูลจริงพบ **hospcode→tambon ไม่ใช่ 1:1** (07705 คุม ต.01+02, รพ.ดงเจริญ 27980 คุม ต.01+05) → กรอกราย hospcode แตกกลับเป็นตำบลไม่ได้ (ห้ามเดา) → ฟิกกรอกราย hospcode 7 หน่วย (ตรง HDC unit table) · `/api/monthly/detail` รับ `{hospcode,target,result}` validate กับ 7 หน่วยจริง · detail บังคับ `view=unit` เมื่อ manual · ฟอร์ม `/kpi/[id]` กรอก 7 หน่วยเรียงตามรหัส · migrate: ลบ detail รายตำบลเดิม 5 แถว [snapshot→gate→COMMIT] คง monthly_data 86.89% (total grouping-independent) → owner re-enter จาก HDC · verify preview ครบ (save/group/validation/live-recompute/order) ✅
- [x] **data protection: orphan + audit log + ล็อกฟอร์ม** **(เสร็จ 24 มิ.ย., commit 7fb2da1)** — กันข้อมูล manual หาย/ขัดกันตอนถูกลบ · (1) ตารางใหม่ `data_change_log` (เก็บ `old_data` JSON ก่อนลบ/ทับ + `changed_by/changed_at` — ไม่ผูก FK cascade เก็บ log แม้ KPI ถูกลบ) · (2) `DELETE /api/monthly` ลบ `moph_monthly_detail` ตามไปด้วยใน transaction (แก้ orphan: เดิมลบแค่ monthly_data เหลือ detail ค้าง) + log action=delete · (3) `POST /api/monthly/detail` ครอบ transaction (atomic) + log action=overwrite ก่อนทับค่าเดิม · (4) ฟอร์ม manual `/kpi/[id]` **ล็อกหลังบันทึก** (inputs disabled + แบนเนอร์ 🔒 "บันทึกแล้วโดย…") → ต้องกด "✏️ แก้ไข" ก่อน + ปุ่ม "ยกเลิก" คืนค่าเดิม (กันมือลั่นกรอกทับ) · verify ครบ: orphan fix (test month detail=0) · audit (overwrite+delete log เก็บ 7 hospcode) · lock/edit/cancel cycle · ข้อมูลจริง 2026-06 (86.67%/7) คงเดิม · ⏳ ปุ่ม "กู้คืน" จาก log ใน UI = follow-up (ตอนนี้กู้มือ: อ่าน old_data → re-POST) · ⚠️ **production ต้องรัน `POST /api/init` 1 ครั้งเพื่อสร้างตาราง data_change_log**
- [ ] **กราฟเส้น trend รายเดือน** — ⏳ รอ cron เก็บ **≥2 เดือน** ก่อน (โครงพร้อม)
- [ ] ตาราง `kpi_monthly_measure` — เฉพาะถ้าทำ exec trend หนักๆ (ตอนนี้ field ดิบพอ)
- [ ] *(follow-up)* **custom pages view toggle** — aged9/ageing/screen-risk/vaccines ยัง group รายตำบลอย่างเดียว (generic `/kpi/[id]` มี toggle area↔unit แล้ว) — ถ้า owner อยากได้ราย hospcode ในหน้าเหล่านี้ด้วย
- [ ] *(follow-up)* **ปุ่มกู้คืนจาก data_change_log ใน UI** — ตอนนี้กู้มือ (อ่าน old_data JSON → re-POST /api/monthly/detail)

## D. 🚀 Production go-live (ก้อนใหญ่ — ต้อง owner sign-off)
- [ ] ตั้ง `.env.local` (production DB) + ตรวจ `/api/dbinfo` ขึ้น "production"
- [ ] `POST /api/init` บน production (สร้าง schema — **รวมตาราง `data_change_log` ใหม่**; idempotent CREATE IF NOT EXISTS)
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
