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
- [✅] `s_dm_control` (kpi-1780634936954) — คุมน้ำตาลได้ · มี field ย่อย hba1c/result/target *_com
- [✅] `s_dm_hba1c` (kpi-1780623103191) — ตรวจ HbA1c · B1/A1(TypeArea1,3) + B2/A2(ChronicFU) · *(HDC ยืนยัน 1,619/1,084/2,568/855)*
- [✅] `s_dm_hypo` (kpi-1780641897424) — ภาวะแทรกซ้อนเฉียบพลัน (lte) · B1=target_1/A1=result_1 + B2=target/A2=result · *(HDC ยืนยัน 1,619/22)*
- [✅] `s_dm_ckd` (kpi-1780641558319) — ยังไม่มีภาวะแทรกซ้อนไต · target/result/result1/result2 + target_1/result_1/result1_1/result2_1 · *(HDC ยืนยัน 991/711)*
- [✅] `s_dm_ckd1` (kpi-1780641689475) — ตรวจภาวะแทรกซ้อนไต · B1=ผู้ป่วยทั้งหมด (ต่างจาก s_dm_ckd) · *(HDC ยืนยัน 1,619/775)*
- [✅] `s_dm_foot` (kpi-1780641441532) — ตรวจเท้า · target/result/normal1/abnormal1 + target1/result1/normal2/abnormal2 · *(HDC ยืนยัน 1,619/599)*
- [✅] `s_dm_retina_kpi` (kpi-1780641242104) — ตรวจจอประสาทตา · field เหมือน s_dm_foot ทุกอย่าง · *(HDC ยืนยัน 1,619/767)*
- [✅] `s_dm_screen` (kpi-1780633804822) — คัดกรอง 35+ · target/result + result1-4(ไตรมาส) · *(HDC ยืนยัน 6,119/4,642)*
- [✅] `s_dm_screen_n` (kpi-1780846589104) — คัดกรอง 35-59 · target1(B)/result1(A) · *(HDC ยืนยัน 2,952/2,339)*
- [✅] `s_ncd_ldl_n1` (kpi-1780635504925) — ตรวจไขมัน LDL (1) · target(B1)/result(A1)/target1(B2)/result1(A2) · *(HDC ยืนยัน 1,619/1,396)*
- [✅] `s_ncd_ldl_n2` (kpi-1780641108643) — ตรวจไขมัน LDL (2) · 16 fields: target/result/target_dm/result_dm/target_i6/result_i6/target_i2/result_i2 (TypeArea) + target1/result1/…1_dm/…1_i6/…1_i2 (ChronicFU) · *(HDC ยืนยัน B=1,396/A=928)*
- [✅] `s_ncd_screen_repleate1` (kpi-1780634155910) — ตรวจยืนยัน FPG · target(B)/result(A)/non_follow180_13(A1)/over180 · *(HDC ยืนยัน B=28/A=21/A1=7)*
- [✅] `s_cf_dm_diag` (kpi-1780634418082) — DM รายใหม่ยืนยัน · target(B1)/result(A1)/targetb2(B2)/resultb2(A2) · *(HDC ยืนยัน B1=21/A1=8/B2=28/A2=10)*

### ความดัน (5)
- [✅] `s_ht_control` (kpi-1780643810275) — คุมความดันได้ · target(B1)/no_bp_d(D1)/bp1_d(1ครั้ง)/bp(≥2ครั้ง)/result_bp1_d(A1)/result(C1) + target1(B2)/no_bp_f(D2)/bp1_f/bp1/result_bp1_f(A2)/result1(C2) · *(aggregate ตรวจ: B1=3597≈3613 · A1=2343≈2324)*
- [✅] `s_ht_screen` (kpi-1780642658949) — คัดกรอง 35+ · target(B)/result(A) · result1-4=ไตรมาส(ไม่โชว์) · *(HDC ยืนยัน B=4,326/A=3,575)*
- [✅] `s_ht_screen_n` (kpi-1780643381148) — คัดกรอง 35-59 · target1(B)/result1(A) · target/result = 35+ รวม (ไม่โชว์) · *(HDC ยืนยัน B=2,604/A=2,119)*
- [✅] `s_ht_screen_follow` (kpi-1780643541722) — ตรวจติดตามยืนยันวินิจฉัย · target(B)/result(A)/r1(HBPM)/r2(OBPM)/non_follow90_13(A3)/over90 · _13 suffix ซ้ำกับ non-suffix → ไม่โชว์
- [✅] `s_ht_diag_follow` (kpi-1780643684708) — HT รายใหม่ · target(B1)/result(A)/r1(A1 HBPM)/r2(A2 OBPM) · *(HDC ยืนยัน B=352/A=20/A1=16/A2=14)*

### แม่ / เด็ก (8)
- [✅] `s_anc5` (kpi-1780624863291) — ฝากครรภ์คุณภาพ 5 ครั้ง · target(B)/result(A) · target1-4/result1-4=ไตรมาส(ไม่โชว์) · *(HDC ยืนยัน B=17/A=9)*
- [✅] `s_kpi_anc12` (kpi-1780624630449) — ฝากครรภ์ครั้งแรก ≤12 สัปดาห์ · target(B)/result(A) · target1-4/result1-4=ไตรมาส(ไม่โชว์) · *(HDC ยืนยัน B=25/A=16)*
- [✅] `s_postnatal` (kpi-1780811860245) — ดูแลหลังคลอด 3 ครั้ง · target(B)/result(A) · *(HDC ยืนยัน B=19/A=6)*
- [✅] `s_childdev_specialpp` (kpi-1780803994535) — DSPM สมวัย · target_*/result_*/1b260_1_* (×5 กลุ่มอายุ = 15 คอลัมน์) · *(HDC ยืนยัน B=322/A=201/สมวัย=189)*
- [ ] `s_childdev_specialpp48` (kpi-1780808040336) — DSPM ช่วงรณรงค์ (2569 ยังไม่มีข้อมูล)
- [✅] `s_tida4i` (kpi-1780808332272) — TEDA4I 9-60 เดือน · field เหมือน s_tida4i_o · *(ดงเจริญยังไม่มีเคสใน 2569)*
- [✅] `s_tida4i_o` (kpi-1780809572023) — TEDA4I 0-5 ปี · target/1b262/lost(ติดตามไม่ได้)/pre_teda/ill/1b260/stimulate(A)/1b270-1b275/1b27x/nocause/follow · *(ยืนยัน: target=1 + lost=1 ตรง HDC วังจั่ว)*
- [✅] `s_ferrous6_5` (kpi-1780811590088) — ยาน้ำเสริมธาตุเหล็ก · target_n(B 6-12เดือน)/result_n(A)/target(B 5ปี)/result(A) · Q1-Q4 ถูก QUARTER_RE กรองออก · *(HDC ยืนยัน B(12mo)=83/A=73 · B(5yr)=268/A=195)*

### มะเร็ง (2)
- [✅] `s_breast_screen` (kpi-1780629640168) — คัดกรองมะเร็งเต้านม · target(B)/result1(ตนเอง)/result(เจ้าหน้าที่=A) · result2=ซ้ำกับresult(ไม่โชว์) · *(HDC ยืนยัน B=3,194/A=2,456)*
- [✅] `s_cervix_screen_n66` (kpi-1780629337389) — คัดกรองมะเร็งปากมดลูก · target(B=0)/result(รวม 3 วิธี)/pap/via/hpv · ⚠️ B=0 → % เสีย

### อื่น (1)
- [✅] `s_telemed_hosp` (kpi-1780646566504) — บริการแพทย์ทางไกล · result(จำนวนครั้ง) · เฉพาะ 27980 รพ.ดงเจริญ · *(HDC ยืนยัน 429 ครั้ง)*

---

## หมายเหตุ
- *(...)* = แหล่งนิยาม field ที่ยืนยันแล้ว (kpi-verify-2569.md / owner-packet) → ทำได้เลยถ้าจับคู่ HDC ครบ
- ตัวที่ไม่มี *(...)* = ต้องขอ HDC screenshot ก่อน (ห้ามเดา)
- หลายตัวเป็น % ง่าย (target=ตัวหาร B, result=ตัวตั้ง A) แต่คำในป้ายให้ยึด HDC
