# Checklist — ป้ายชื่อคอลัมน์ drilldown (generic `/kpi/[id]`)

> สร้าง 2026-06-30 · เป้าหมาย: หน้า drilldown ทุก KPI อ่านง่ายแบบ HDC (ไม่โชว์ field ดิบ result/a1/b1/r1…)
> **กฎเหล็ก: ห้ามเดา field** — ต้องมี HDC screenshot หรือ owner-packet ยืนยันก่อนใส่ป้าย

## วิธีทำ (ทำทีละ KPI)
1. ผู้ใช้เปิด HDC ของ KPI นั้น → ส่ง screenshot (ให้เห็นชื่อคอลัมน์ + ตัวเลขรวมอำเภอ/รายหน่วย)
2. จับคู่คอลัมน์ HDC ↔ field ดิบ (ดู field ได้จาก `/api/detail?kpiId=...` → `total.fields` หรือหน้า `/kpi/[id]`)
3. เพิ่ม 1 entry ใน [`lib/detailLabels.ts`](../lib/detailLabels.ts): `moph_table: { field: 'ป้ายไทย', ... }` (ลำดับ key = ลำดับคอลัมน์)
4. **กลไก:** มี entry → drilldown โชว์**เฉพาะ**คอลัมน์ที่กำหนด (whitelist) + ป้ายไทย · ไม่มี → field ดิบทั้งหมด
5. verify: ค่ารวมอำเภอ + รายหน่วย ตรง HDC screenshot (ดูตัวอย่าง s_ncd_bp ที่ทำแล้ว)
6. `npx tsc --noEmit` ผ่าน → commit

> ตัวอย่างที่ทำแล้ว: `s_ncd_bp` = `{ b1:'ทั้งหมด (B1)', r1:'ได้รับการตรวจวัดความดันโลหิต', a1:'ควบคุมความดันโลหิตได้ตามเกณฑ์ (A1)' }` → ตรง HDC ทุกหน่วย (รวม 1619/1523/862/53.24)

---

## ✅ เสร็จแล้ว / ไม่ต้องทำ
- **มีหน้า drilldown เฉพาะ (หัวตาราง HDC ในหน้าเอง — ไม่ใช้ generic):** `s_child_hct`(anemia) · `s_aged9`/`s_aged9_app`(aged9) · `s_dm_screen_risk`/`s_ht_screen_risk`(screen-risk) · `s_epi2`(vaccines) · `s_kpi_ageing`(ageing) · `s_colon_screen_w`(colon-fit)
- **detailLabels เสร็จ:** `s_kpi_ageing` · `s_ncd_bp`
- **manual (ป้าย ฐาน(B)/ผลงาน(A) อยู่แล้ว):** `s_epi_complete`

---

## ☐ ค้าง — 29 KPI ยัง field ดิบ (ใส่ detailLabels.ts ทีละตัว)

### เบาหวาน / NCD (13)
- [ ] `s_dm_control` (kpi-1780634936954) — คุมน้ำตาลได้ · มี field ย่อย hba1c/result/target *_com
- [ ] `s_dm_hba1c` (kpi-1780623103191) — ตรวจ HbA1c · *(kpi-verify: result/target)*
- [ ] `s_dm_hypo` (kpi-1780641897424) — ภาวะแทรกซ้อนเฉียบพลัน (lte) · *(kpi-verify: result_1/target_1)*
- [ ] `s_dm_ckd` (kpi-1780641558319) — ยังไม่มีภาวะแทรกซ้อนไต
- [ ] `s_dm_ckd1` (kpi-1780641689475) — ตรวจภาวะแทรกซ้อนไต
- [ ] `s_dm_foot` (kpi-1780641441532) — ตรวจเท้า
- [ ] `s_dm_retina_kpi` (kpi-1780641242104) — ตรวจจอประสาทตา
- [ ] `s_dm_screen` (kpi-1780633804822) — คัดกรอง 35+ · *(kpi-verify: result/target)*
- [ ] `s_dm_screen_n` (kpi-1780846589104) — คัดกรอง 35-59 · *(kpi-verify: result1/target1)*
- [ ] `s_ncd_ldl_n1` (kpi-1780635504925) — ตรวจไขมัน LDL (1)
- [ ] `s_ncd_ldl_n2` (kpi-1780641108643) — ตรวจไขมัน LDL (2)
- [ ] `s_ncd_screen_repleate1` (kpi-1780634155910) — ตรวจติดตามยืนยันวินิจฉัย
- [ ] `s_cf_dm_diag` (kpi-1780634418082) — DM รายใหม่ยืนยัน · *(owner: result/target — ดู checklist-pending ข้อ 4)*

### ความดัน (5)
- [ ] `s_ht_control` (kpi-1780643810275) — คุมความดันได้
- [ ] `s_ht_screen` (kpi-1780642658949) — คัดกรอง 35+
- [ ] `s_ht_screen_n` (kpi-1780643381148) — คัดกรอง 35-59 · *(kpi-verify: result1/target1)*
- [ ] `s_ht_screen_follow` (kpi-1780643541722) — ตรวจติดตามยืนยันวินิจฉัย
- [ ] `s_ht_diag_follow` (kpi-1780643684708) — HT รายใหม่ · *(owner: result — ดู checklist-pending ข้อ 3)*

### แม่ / เด็ก (8)
- [ ] `s_anc5` (kpi-1780624863291) — ฝากครรภ์คุณภาพ 5 ครั้ง
- [ ] `s_kpi_anc12` (kpi-1780624630449) — ฝากครรภ์ครั้งแรก ≤12 สัปดาห์
- [ ] `s_postnatal` (kpi-1780811860245) — ดูแลหลังคลอด 3 ครั้ง
- [ ] `s_childdev_specialpp` (kpi-1780803994535) — DSPM สมวัย · *(sumFields result_9/18/30/42/60 ÷ target_*)*
- [ ] `s_childdev_specialpp48` (kpi-1780808040336) — DSPM ช่วงรณรงค์ (2569 ยังไม่มีข้อมูล)
- [ ] `s_tida4i` (kpi-1780808332272) — TEDA4I 9-60 เดือน (ดงเจริญไม่มีเคส) · *(owner-packet ข้อ 11)*
- [ ] `s_tida4i_o` (kpi-1780809572023) — TEDA4I 0-5 ปี · *(owner-packet ข้อ 11: 1b27x/stimulate)*
- [ ] `s_ferrous6_5` (kpi-1780811590088) — ยาน้ำเสริมธาตุเหล็ก

### มะเร็ง (2)
- [ ] `s_breast_screen` (kpi-1780629640168) — คัดกรองมะเร็งเต้านม (target 85 รอ owner ยืนยัน)
- [ ] `s_cervix_screen_n66` (kpi-1780629337389) — คัดกรองมะเร็งปากมดลูก (count ราย, none) · ⚠️ % เสียไม่มีตัวหาร

### อื่น (1)
- [ ] `s_telemed_hosp` (kpi-1780646566504) — บริการแพทย์ทางไกล (count ครั้ง, none)

---

## หมายเหตุ
- *(...)* = แหล่งนิยาม field ที่ยืนยันแล้ว (kpi-verify-2569.md / owner-packet) → ทำได้เลยถ้าจับคู่ HDC ครบ
- ตัวที่ไม่มี *(...)* = ต้องขอ HDC screenshot ก่อน (ห้ามเดา)
- หลายตัวเป็น % ง่าย (target=ตัวหาร B, result=ตัวตั้ง A) แต่คำในป้ายให้ยึด HDC
