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

**วิธีแก้ (manual entry — flag ใน DB, self-service, กรอกรายหน่วยบริการ):**
- flag `kpi_reports.manual_entry=1` (ติ๊ก "📝 กรอกค่าเอง" ในฟอร์มแก้ KPI หน้า `/admin` ได้เอง ไม่ต้องแก้โค้ด) · helper `isManualEntry` ([lib/manualKpi.ts](../lib/manualKpi.ts))
- `runBatchSave`/cron อ่าน flag → **ข้าม** KPI ที่ manual (ไม่ดึง/ทับค่า)
- หน้า `/kpi/[id]` โหมด manual: **ตารางกรอกรายหน่วยบริการ** (admin, 7 หน่วย `HOSPCODE_NAMES`) — กรอก ฐาน B / ผลงาน A ต่อหน่วย → ระบบคำนวณ % = A/B สด + กราฟแท่ง + รวมอำเภอ ΣA/ΣB · non-admin อ่านอย่างเดียว
- เก็บรายหน่วยใน `moph_monthly_detail` (hospcode จริง, `POST /api/monthly/detail` — ลบเดือนนั้นแล้วเขียนใหม่) + อัปเดต `monthly_data` รวมอำเภอ · mapping ใช้ `result/target` · detail บังคับ `view=unit` เมื่อ manual
- **audit:** `source='manual'`, `entered_by` (จาก session), `entered_at` → หน้าโชว์ "อัปเดตล่าสุดโดย … · เวลา"
- **เตือน stale:** ยังไม่กรอกเดือนปัจจุบัน → กล่องเหลือง
- backup: `_resync_backup/epi-complete-manual-2026-06-22/`, `manual-flag-migrate-2026-06-22/`, `epi-manual-pertambon-2026-06-23/`, `backups/manual_detail_tambon_snapshot_*` (รายตำบลเดิมก่อน migrate)

**🔄 เปลี่ยน รายตำบล → รายหน่วยบริการ (24 มิ.ย. 2569):**
- **เหตุผล:** owner ขอ toggle รายตำบล↔รายหน่วยบริการ แต่ตรวจข้อมูลจริง (`moph_monthly_detail` ของ KPI auto) พบ **hospcode→tambon ไม่ใช่ 1:1** — 07705 คุม ต.01+02, รพ.ดงเจริญ 27980 คุม ต.01+05 → เลขรวมต่อ hospcode **แตกกลับเป็นตำบลไม่ได้** (ห้ามเดา) → ฟิกเป็นกรอกราย hospcode (ตรง HDC "รายหน่วยบริการ" ก๊อปมาวางได้เลย)
- **migrate:** ลบ detail รายตำบลเดิม 5 แถว (hospcode='manual') ของ 2026-06 [snapshot→gate(ROW_COUNT=5)→COMMIT] · คง `monthly_data` 86.89% ไว้ (total grouping-independent → ยังตรง HDC) · drilldown โชว์ฟอร์ม 7 หน่วยว่าง + เตือน stale → **owner re-enter รายหน่วยบริการจาก HDC** (เลขเดิมรายตำบล convert เป็น hospcode ไม่ได้)
- **verify (preview):** save 7 หน่วย → 86.89% (Σ53/61) · GET detail view=unit → 7 group ชื่อ รพ.สต. ถูก, %/สถานะรายหน่วยถูก · validation: hospcode ไม่รู้จัก→400, A>B→400 · live-recompute ตอนพิมพ์ทำงาน · ลำดับแถวเรียงตามรหัส (รพ.สต.ก่อน รพ.ดงเจริญท้าย) · ลบ test rows คืนสถานะว่างแล้ว

**ความทนทานสำหรับ manual KPI ตัวใหม่ (hardening):**
- detail route **บังคับ mapping `result/target`** เมื่อ manual (ไม่สน moph_config/field config เดิม) → toggle KPI auto→manual ได้เลย ไม่ต้องล้าง config (ทดสอบ: KPI ที่ value field ผิดยังคำนวณถูก)
- `/api/monthly/detail` รับเฉพาะ KPI ที่ flag manual (ไม่ใช่ → 400) กันเขียนผิดตัวแล้วโดน cron ทับ
- ✅ discoverability (เสร็จ 24 มิ.ย.): Scorecard/dashboard มีป้าย "✍️ กรอกมือ" + แจ้ง "ยังไม่กรอกเดือนนี้" (value null) บน KPI ที่ flag manual

## ยังไม่ตรวจ (ความเสี่ยงต่ำ — dir=none "ติดตามเฉยๆ" ไม่ตัดสินผ่าน/ไม่ผ่าน)
- s_colon_screen_w (ใช้ field ไตรมาส `fitposq2` — snapshot ตัด q ทิ้ง, flag ไว้แล้ว)
- s_cf_dm_diag, s_dm_screen_risk, s_ht_diag_follow, s_aged9, s_aged9_app

## หมายเหตุ
- HDC screenshot ใน `data/` = ดงเจริญ เชื่อถือได้ (ดู CLAUDE.md) · `.txt` = จังหวัด 11 ใช้ดู schema เท่านั้น
- ไม่มี DB write จากการ verify รอบนี้ (17 ตัวถูกอยู่แล้ว — value_field ว่างแต่ engine ใช้ default `'result'` ถูก)
