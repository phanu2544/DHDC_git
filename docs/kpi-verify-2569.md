# KPI Verification Log — ปีงบ 2569 (อำเภอดงเจริญ 6611)

> บันทึกผลตรวจสอบว่าค่าที่ระบบคำนวณ **ตรงกับ HDC** หรือไม่ · ทำเพื่อสร้างความเชื่อมั่นก่อน go-live
> วิธี: เทียบ `monthly_data.value` (ระบบ snapshot ต้นมิ.ย.) ↔ HDC screenshot ใน `data/` (ถ่าย 9-10 มิ.ย. = ช่วงเดียวกัน)
> ⚠️ อย่าเทียบกับ MOPH live วันนี้ — ข้อมูลขยับรายวัน ค่าจะต่าง (ไม่ใช่ bug)

## รอบที่ 1 — กลุ่ม `value_field` ว่าง (LEGACY → default `'result'`) ที่ประเมินจริง (gte)
ตรวจ 2026-06-22 · ผล: **17/18 ถูกต้อง auto** (`'result'/'target'` = สูตร HDC) · **1 ตัว (s_epi_complete) แก้ด้วย manual entry** → ครบ 18/18

| KPI (moph_table) | ระบบ | HDC | สถานะ |
|---|---|---|---|
| s_anc5 | 46.67 | 46.67 | ✅ |
| s_dm_ckd | 72.02 | 72.12 | ✅ |
| s_dm_ckd1 | 47.95 | 48.01 | ✅ |
| s_dm_control | 35.17 | 35.22 | ✅ (HDC "ในเขตรับผิดชอบ") |
| s_dm_foot | 32.75 | 32.80 | ✅ |
| s_dm_retina_kpi | 43.11 | 43.17 | ✅ |
| s_dm_screen | 75.38 | 75.39 | ✅ |
| s_ferrous6_5 | 75.30 | 68.92 | ✅ field ถูก = กลุ่มอายุ 6ด.-5ปี (B=251) · ค่าต่างเพราะคนละวัน |
| s_ht_control | 62.05 | 64.98 | ✅ field ถูก = "ในเขตรับผิดชอบ" (ไม่ใช่ service 74.63) · ห่าง ~3 จุด (วันที่) |
| s_ht_screen | 82.42 | 82.46 | ✅ |
| s_ht_screen_follow | 50.69 | 50.69 | ✅ (result=result_13, target=target_13) |
| s_ht_screen_risk | 82.56 | 82.60 | ✅ |
| s_kpi_anc12 | 46.67 | 46.67 | ✅ |
| s_ncd_ldl_n1 | 86.23 | 86.26 | ✅ (% ตรวจ = self-consistent + cross-check n2) |
| s_ncd_ldl_n2 | 66.76 | 66.74 | ✅ |
| s_ncd_screen_repleate1 | 75.00 | 75.00 | ✅ |
| s_postnatal | 35.29 | 35.29 | ✅ |
| **s_epi_complete** | **41.60→กรอกมือ** | **86.89** | ✅ **แก้แล้ว (manual)** |

## ✅ แก้แล้ว: `s_epi_complete` (วัคซีน fully immunized เด็ก 2 ปี) — ใช้ manual entry
**ปัญหา:** ระบบดึง Open Data ได้ 41.60% แต่ HDC = 86.89% (A=53 เด็กได้ครบ / B=61 เด็กในพื้นที่)

**ทำไม auto ไม่ได้ (สืบจนสุดทาง 22 มิ.ย.):**
- "fully immunized" = เด็กต้องได้วัคซีน **ครบทุก 8 ชนิด (AND per-child)** + กรอง type_area 1,3 → คำนวณจากยอดรวม Open Data ไม่ได้
- ลองทุกวิธี (sum / group ตาม ตำบล,hospcode / dedup) = ได้ 42.53% เสมอ ไม่ใช่ 86.89%
- เลขจริงมีแต่ใน `api-hdc.moph.go.th` (HDC portal) ที่ต้อง **login token ส่วนตัว อายุ 2 ชม.** → ดึง auto ไม่ยั่งยืน
- Public Open Data ที่ MOPH ให้นักพัฒนา = `report_data/s_epi_complete` = raw เท่านั้น (ยืนยันจากลิงก์ "Open Data API" ของเขา)

**วิธีแก้ (manual entry — flag ใน DB, self-service, กรอกรายตำบล):**
- flag `kpi_reports.manual_entry=1` (ติ๊ก "📝 กรอกค่าเอง" ในฟอร์มแก้ KPI หน้า `/admin` ได้เอง ไม่ต้องแก้โค้ด) · helper `isManualEntry` ([lib/manualKpi.ts](../lib/manualKpi.ts))
- `runBatchSave`/cron อ่าน flag → **ข้าม** KPI ที่ manual (ไม่ดึง/ทับค่า)
- หน้า `/kpi/[id]` โหมด manual: **ตารางกรอกรายตำบล** (admin) — กรอก ฐาน B / ผลงาน A ต่อตำบล → ระบบคำนวณ % = A/B สด + กราฟแท่ง + รวมอำเภอ ΣA/ΣB · non-admin อ่านอย่างเดียว
- เก็บรายตำบลใน `moph_monthly_detail` (`POST /api/monthly/detail` — ลบเดือนนั้นแล้วเขียนใหม่) + อัปเดต `monthly_data` รวมอำเภอ · mapping ใช้ `result/target` (ล้าง moph_config เดิม `result10/target10` ที่ผิด)
- **audit:** `source='manual'`, `entered_by` (จาก session), `entered_at` → หน้าโชว์ "อัปเดตล่าสุดโดย … · เวลา"
- **เตือน stale:** ยังไม่กรอกเดือนปัจจุบัน → กล่องเหลือง
- กรอกค่าจริงรายตำบลแล้ว (วังงิ้วใต้10/10, วังงิ้ว15/8, ห้วยร่วม6/6, ห้วยพุก7/7, สำนักขุนเณร23/22 → รวม 53/61 = 86.89% ตรง HDC ทุกตำบล) · คง gte เป้า 90
- backup: `_resync_backup/epi-complete-manual-2026-06-22/`, `manual-flag-migrate-2026-06-22/`, `epi-manual-pertambon-2026-06-23/`

**ความทนทานสำหรับ manual KPI ตัวใหม่ (hardening):**
- detail route **บังคับ mapping `result/target`** เมื่อ manual (ไม่สน moph_config/field config เดิม) → toggle KPI auto→manual ได้เลย ไม่ต้องล้าง config (ทดสอบ: KPI ที่ value field ผิดยังคำนวณถูก)
- `/api/monthly/detail` รับเฉพาะ KPI ที่ flag manual (ไม่ใช่ → 400) กันเขียนผิดตัวแล้วโดน cron ทับ
- ⏳ งานต่อ (ไม่ด่วน): ป้าย/แจ้งเตือน "manual ที่ยังไม่กรอกเดือนนี้" บน dashboard (discoverability)

## ยังไม่ตรวจ (ความเสี่ยงต่ำ — dir=none "ติดตามเฉยๆ" ไม่ตัดสินผ่าน/ไม่ผ่าน)
- s_colon_screen_w (ใช้ field ไตรมาส `fitposq2` — snapshot ตัด q ทิ้ง, flag ไว้แล้ว)
- s_cf_dm_diag, s_dm_screen_risk, s_ht_diag_follow, s_aged9, s_aged9_app

## หมายเหตุ
- HDC screenshot ใน `data/` = ดงเจริญ เชื่อถือได้ (ดู CLAUDE.md) · `.txt` = จังหวัด 11 ใช้ดู schema เท่านั้น
- ไม่มี DB write จากการ verify รอบนี้ (17 ตัวถูกอยู่แล้ว — value_field ว่างแต่ engine ใช้ default `'result'` ถูก)
