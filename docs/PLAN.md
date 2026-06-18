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
- [ ] ตั้ง **target ที่ยังเป็น 0** (~6 ตัว needs_review) ผ่าน `/admin/targets`
- [ ] รับรองนิยาม **โลหิตจาง (result/target)** + **NCD BP (a1/b1)** — owner-packet หมวด 3
- [ ] ตรวจ **2 KPI ไม่มีข้อมูล 6611** (`s_tida4i`, `s_childdev_specialpp48`) — ตารางถูกไหม/ดงเจริญไม่มีจริง

## B. Cleanup เล็ก (เราทำได้เลย — ได้ของเร็ว)  ⬅️ เริ่มที่นี่
- [x] ลบ **kpi-01** (KPI ทดสอบค้าง ซ้ำ s_dm_control) — *DB op เสร็จ 2026-06-18: backup `_resync_backup/kpi-01-delete-2026-06-18/` → preview(ROLLBACK) → COMMIT (monthly_data 2 + moph_monthly_detail 56 + kpi_reports 1, kpi_targets 0) → verify หาย/ตัวจริง kpi-1780634936954 ครบ · รวม KPI 40→39*
- [~] โลหิตจาง: **(2026-06-18)** ✅ แก้ label owner-packet (result=A1 numerator, result_ill=ไม่ใช้ + ลบ path หลง) · ✅ ชื่อ KPI: user เลือก**คงเดิม** (ไม่ตัด "(Coverage)", ไม่แตะ DB) · **รอ user:** `—` vs `0.00` (ห้วยร่วม, หน้า anemia)
- [x] คู่มือไทย **(เสร็จ 2026-06-18)**: port `3000`→`3002` ทุกจุดใน `คำสั่งที่ใช้บ่อย.md` (15 จุด) + db.ts/dev DB ใน body ตรง CLAUDE.md (env, `dhdc_dev` root/123456, mysql.exe path) · production host เหลือ 1 จุดมี caveat
- [ ] ตัดสิน `docs/data_owner/` + `data/` → commit หรือ gitignore

## C. Feature ต่อยอด (เลือกทำ / รอเงื่อนไข)
- [ ] **registry `detail_view`** แทน hardcode routing ใน `dashboard` (KPI ↔ drilldown แบบไหน) — ลดงานเพิ่ม KPI ใหม่
- [ ] **formatter เดือน พ.ศ./เดือนไทย** (จุดเดียวใน `MonthPicker`)
- [ ] **กราฟเส้น trend รายเดือน** — ⏳ รอ cron เก็บ **≥2 เดือน** ก่อน (โครงพร้อม)
- [ ] ตาราง `kpi_monthly_measure` — เฉพาะถ้าทำ exec trend หนักๆ (ตอนนี้ field ดิบพอ)

## D. 🚀 Production go-live (ก้อนใหญ่ — ต้อง owner sign-off)
- [ ] ตั้ง `.env.local` (production DB) + ตรวจ `/api/dbinfo` ขึ้น "production"
- [ ] `POST /api/init` บน production (สร้าง schema)
- [ ] Replay config ตาม `production-runbook.md` (snapshot→gate→verify) — ⚠️ owner sign-off โลหิตจาง/NCD BP
- [ ] ตั้ง target ปีงบ + batch scope 6611 + verify ตรง dev
- [ ] **Process manager (PM2/NSSM) ดูแล app + MariaDB รันถาวร** — ไม่งั้น cron/snapshot ไม่ทำงาน (ปมที่เจอจริง: dev หยุดเอง)

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
