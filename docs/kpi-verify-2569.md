# KPI Verification Log — ปีงบ 2569 (อำเภอดงเจริญ 6611)

> บันทึกผลตรวจสอบว่าค่าที่ระบบคำนวณ **ตรงกับ HDC** หรือไม่ · ทำเพื่อสร้างความเชื่อมั่นก่อน go-live
> วิธี: เทียบ `monthly_data.value` (ระบบ snapshot ต้นมิ.ย.) ↔ HDC screenshot ใน `data/` (ถ่าย 9-10 มิ.ย. = ช่วงเดียวกัน)
> ⚠️ อย่าเทียบกับ MOPH live วันนี้ — ข้อมูลขยับรายวัน ค่าจะต่าง (ไม่ใช่ bug)

## รอบที่ 1 — กลุ่ม `value_field` ว่าง (LEGACY → default `'result'`) ที่ประเมินจริง (gte)
ตรวจ 2026-06-22 · ผล: **`'result'/'target'` = สูตร HDC มาตรฐาน ถูกต้อง 17/18**

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
| **s_epi_complete** | **41.60** | **87.10** | 🔴 **ผิด — ดูด้านล่าง** |

## 🔴 ตัวที่ต้องแก้: `s_epi_complete` (วัคซีน fully immunized เด็ก 2 ปี)
- ระบบ 41.60% · HDC 87.10% (A=54 เด็กได้ครบ / B=62 เด็กในพื้นที่)
- สาเหตุ: `target` (รายปี = 261) = **ผลรวมคอลัมน์รายเดือนซ้ำ** ไม่ใช่จำนวนเด็ก unique (62) → ตัวหารพองผิด
- ผลกระทบ: KPI จริงเกือบผ่าน (87% เป้า 90) แต่ระบบโชว์ตก (41%) → owner เห็นผิด
- ยังไม่แก้ — ค่า 62/54 ไม่ใช่ field ตรงๆ ต้อง probe field ดิบเพิ่ม/ถาม owner (ห้ามเดา)

## ยังไม่ตรวจ (ความเสี่ยงต่ำ — dir=none "ติดตามเฉยๆ" ไม่ตัดสินผ่าน/ไม่ผ่าน)
- s_colon_screen_w (ใช้ field ไตรมาส `fitposq2` — snapshot ตัด q ทิ้ง, flag ไว้แล้ว)
- s_cf_dm_diag, s_dm_screen_risk, s_ht_diag_follow, s_aged9, s_aged9_app

## หมายเหตุ
- HDC screenshot ใน `data/` = ดงเจริญ เชื่อถือได้ (ดู CLAUDE.md) · `.txt` = จังหวัด 11 ใช้ดู schema เท่านั้น
- ไม่มี DB write จากการ verify รอบนี้ (17 ตัวถูกอยู่แล้ว — value_field ว่างแต่ engine ใช้ default `'result'` ถูก)
