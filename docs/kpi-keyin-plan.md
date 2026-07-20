# Key-in ผลงานโดย staff เจ้าของ KPI — Starter Doc (ทำในแชทใหม่)

> **สถานะ: H1+H2+H3+I เสร็จหมดแล้ว 2026-07-19** 🎉 · เขียน 2026-07-19
> อ่านคู่กับ [`kpi-work-groups-plan.md`](kpi-work-groups-plan.md) (ฟีเจอร์กลุ่มงานที่เป็นฐานของงานนี้ เสร็จหมดแล้ว)

## เป้าหมาย
ให้ **staff (เจ้าของ KPI ตามกลุ่มงาน) กรอก "ผลงาน" ของ KPI ตัวเองได้** — ต่อยอดจากระบบ manual entry เดิมที่ตอนนี้ **admin เท่านั้น**ที่กรอกได้ · owner (2026-07-19) ยืนยันว่าอยากได้โหมด key-in นี้ก่อน go-live (ไม่รีบ go-live)

## บริบท — ระบบมีอะไรอยู่แล้ว (⚠️ อย่าทำซ้ำ)
| ส่วน | มีแล้วไหม | ใครกรอกได้ตอนนี้ |
|---|---|---|
| **เป้าหมาย (target)** | ✅ `/admin/targets` (`PUT /api/targets`) | **staff กรอกเองได้แล้ว** (self-service ตั้งแต่ 18 มิ.ย. · `/api/targets` ไม่อยู่ใน ADMIN_MUTATE) |
| **ผลงาน (result) แบบ manual** | ✅ ติ๊ก `manual_entry` → กรอกราย รพ.สต. `{target,result}` ที่ `/kpi/[id]` → `POST /api/monthly/detail` (มี transaction + audit `source/entered_by/entered_at` + `data_change_log` + ล็อกฟอร์มหลังบันทึก) | ⚠️ **admin เท่านั้น** (staff อ่านอย่างเดียว) · ใช้จริงกับวัคซีน fully immunized |
| **ผลงานดึง HDC** | ✅ อัตโนมัติ (cron/batch) | ระบบดึงเอง |
| **work groups** | ✅ เสร็จหมด (A-F) | staff ↔ `users.department` ↔ `kpi_work_groups` ↔ KPI · ใช้เป็น**ฐานสิทธิ์**ว่า staff เป็นเจ้าของ KPI ตัวไหน |

**สรุปช่องว่าง:** เป้าหมาย staff กรอกเองได้แล้ว — ที่ยังขาดคือ **"ผลงาน" ที่ยังเปิดให้แค่ admin** ยังไม่เปิดให้ staff เจ้าของ KPI กรอกของตัวเอง

## ✅ ตัดสินใจแล้ว
- **ใครกรอกผลงาน:** staff เจ้าของ KPI (ผ่าน work group) — ขยายจาก admin-only · admin ยังเห็น/แก้ได้ทุกกลุ่ม · audit เก็บชื่อคนกรอก (คอลัมน์มีอยู่แล้ว)
- **ความละเอียดของ "ผลงาน":** ✅ **owner เลือก (ข) ราย รพ.สต. 7 หน่วย (B/A ต่อหน่วย)** — เหมือน manual เดิมทุกประการ (19 ก.ค.) → **ไม่ต้องสร้าง write path ใหม่** งานนี้เป็นเรื่อง authorization ล้วนๆ (ดู Log Phase H1 ด้านล่าง)

## ❓ ไม่มีข้อค้างแล้ว — เริ่มโค้ดได้เต็มที่

## ⚠️ จุดที่ต้องระวัง (บทเรียนจากงานที่ผ่านมาในโปรเจกต์)
1. **Authorization ฝั่ง server (สำคัญสุด):** ตอนนี้ `middleware.ts` → `/api/monthly` mutation = **admin-only** (`ADMIN_MUTATE`) · ต้องเปิดให้ staff **แต่เฉพาะ KPI ในกลุ่มงานตัวเองเท่านั้น** ไม่ใช่เปิดหมด → เช็คที่ route ว่า `kpi_work_groups` ของ KPI นั้นตรงกับ `users.department` ของคน login (อ่านจาก signed JWT ไม่เชื่อ client) — ระวังช่องโหว่ staff กรอกทับ KPI กลุ่มอื่น
2. **ฟอร์ม `/kpi/[id]` เดิม gate ด้วย `user.role === 'admin'` หลายจุด** (บรรทัดราวๆ 72, 316, 335, 341, 358, 392) → ต้องเปลี่ยน logic เป็น "admin **หรือ** (staff && เป็นเจ้าของกลุ่มของ KPI นี้)"
3. **reuse `/api/monthly/detail` เดิม** — มี transaction + audit + `data_change_log` + orphan-fix ครบแล้ว อย่าเขียน write path ใหม่
4. **ต่อยอด Phase F ได้** — มีฟิลเตอร์ "เฉพาะกลุ่มงานของฉัน" อยู่แล้ว · อาจทำหน้า/แท็บ "KPI ของกลุ่มฉันที่ต้องกรอกผลงาน" ให้ staff เข้ามากรอกสะดวก
5. **charset:** ทุกคำสั่ง SQL ที่มีภาษาไทย ใช้ **SQL file** เท่านั้น อย่าใช้ `mysql -e "..."` inline (ค่าไทยเพี้ยน — เจอซ้ำหลายรอบ)
6. **`/api/init` sync:** ถ้าแตะ schema ต้องแก้ `/api/init` ให้ตรง + ทดสอบ init บน DB เปล่า (มาตรฐานที่ตั้งไว้)

## ไฟล์ที่เกี่ยวข้อง
- `app/kpi/[id]/page.tsx` — ฟอร์ม manual entry (ที่ต้องปลดล็อกให้ staff — **H2**)
- `app/api/monthly/detail/route.ts` — write path (reuse) + ownership gate (**H1 ✅**)
- `app/api/detail/route.ts` — GET ที่ frontend เรียกโหลดฟอร์ม (ต้องเติม `canEdit` — **H2**)
- `middleware.ts` — `STAFF_OWNED_WRITE` ยกเว้น `/api/monthly/detail` จาก `ADMIN_MUTATE` (**H1 ✅**)
- `lib/kpiOwnership.ts` — **ใหม่ (H1)** `canEditManualKpi()` single source of truth ของกฎสิทธิ์ (ใช้ทั้ง H1 บังคับ + H2 บอก UI)
- `lib/manualKpi.ts` — flag helper (ไม่แตะ)
- `lib/useAuth.ts` — `user.department` / `user.role` (มีพร้อมแล้ว)

## Log การรัน Phase H1 — ✅ เสร็จ 2026-07-19

ปลดล็อก authorization ฝั่ง server ให้ staff เขียน `/api/monthly/detail` ได้เฉพาะ KPI กลุ่มงานตัวเอง — **ไม่แตะ schema เลย** (owner เลือกความละเอียดแบบ "ราย รพ.สต. 7 หน่วย" = ใช้ write path เดิม 100%)

### สิ่งที่ทำ
1. ✅ `lib/kpiOwnership.ts` (ใหม่) — `canEditManualKpi(conn, session, kpiId)`: admin=ทุกตัว · staff=เช็ก `kpi_work_groups.work_group = session.department` (จาก JWT ไม่เชื่อ client) · **fail-closed** (department ว่าง/query พลาด → ไม่ให้แก้) — ตั้งใจทำเป็น single source of truth เดียว เผื่อ H2 (ฝั่ง UI) เรียกใช้กฎชุดเดียวกัน กันสองที่หลุดไม่ตรงกัน
2. ✅ `middleware.ts` — เพิ่ม `STAFF_OWNED_WRITE = ['/api/monthly/detail']` ยกเว้นออกจาก `ADMIN_MUTATE` เฉพาะ path นี้ (path อื่นใต้ `/api/monthly` เช่น root POST/DELETE ยัง admin-only เหมือนเดิม) — middleware ทำได้แค่ "ต้อง login" เพราะรันบน edge แตะ DB ไม่ได้ ส่วนเช็ก ownership จริงอยู่ที่ route
3. ✅ `app/api/monthly/detail/route.ts` — เติม ownership gate ก่อนเขียนทุกครั้ง (เรียก `canEditManualKpi`) + แยกข้อความ 403 เป็น 2 แบบ ("ยังไม่มีกลุ่มงาน" vs "มีกลุ่มงานแต่ไม่ใช่เจ้าของ KPI นี้") · ที่เหลือ (transaction/audit/data_change_log/validate hospcode) **ไม่แตะ** reuse 100%

### Verify — ผ่าน browser จริงครบ (`javascript_tool` fetch, ไม่ใช่ curl — บทเรียนจาก Phase B เพราะ curl เข้าไม่ถึง preview server)
| เคส | คาดหวัง | ผล |
|---|---|---|
| typecheck (`tsc --noEmit`) | ผ่าน | ✅ (2 รอบ — หลัง H1 core + หลังแยกข้อความ 403) |
| นุชสรา (staff, ปฐมภูมิ) POST `s_epi_complete` (KPI manual เดียวที่มีจริง, กลุ่ม=ปฐมภูมิ) | 200 | ✅ + audit เก็บชื่อเธอถูกต้อง (`entered_by`) |
| สมชาย (staff, ทันตกรรม) POST KPI เดียวกัน (ไม่ใช่กลุ่มตัวเอง) | 403 "ไม่มีสิทธิ์...กลุ่มงานที่รับผิดชอบ" | ✅ + ค่าเดิมไม่ถูกทับ (verify ด้วย GET) |
| สมชาย DELETE `/api/monthly` (root, **ไม่ใช่** `/detail`) | ยัง 403 admin-only | ✅ พิสูจน์ว่า exclude เฉพาะ path `/detail` จริง ไม่หลุดทั้งกลุ่ม `/api/monthly/*` |
| admin POST (regression) | 200 | ✅ |
| POST KPI ที่ไม่ได้ตั้ง manual (regression เดิม, ไม่เกี่ยวกับ H1) | 400 | ✅ ไม่เปลี่ยน |
| สมชาย (department='ทันตกรรม' ไม่ว่าง) หลังแยกข้อความ 403 | ต้องได้ข้อความ "not owner" ไม่ใช่ "no department" | ✅ ยืนยัน branch logic ถูก |
| ข้อมูลทดสอบ (เดือน `2099-01`) | ลบคืนสภาพหลังทุก verify | ✅ กลับเป็น 1 แถวเดิม (86.67% มิ.ย.) · console สะอาดทุกรอบ |

### หมายเหตุความครอบคลุมการทดสอบ
กิ่ง "ยังไม่มีกลุ่มงาน" (department ว่าง/NULL) **ยังไม่มี account จริงให้ทดสอบสด** (4 staff จริง + admin ทุกคนมี department) — ตรวจผ่าน code review แทน (ตรรกะง่าย: `session.role !== 'admin' && !session.department.trim()`) ไม่ได้สร้าง test account เปล่าเพิ่มเพราะไม่คุ้มกับ DB churn สำหรับแค่ข้อความ error

### ข้อเสนอที่พิจารณาแล้วก่อนเริ่ม H2
1. **แยกข้อความ 403 "ไม่มีกลุ่มงาน" vs "ไม่ใช่เจ้าของ"** — ✅ ทำแล้ว (ด้านบน) ต้นทุนต่ำ คุณค่าจริง
2. **ทำ `STAFF_OWNED_WRITE` ให้ generalize รองรับหลาย endpoint ล่วงหน้า** — ❌ ข้าม (YAGNI) ตอนนี้มี use case เดียว ถ้า H3/อนาคตมี endpoint ที่สองค่อยเพิ่ม (มี comment อธิบายไว้ในโค้ดแล้วว่าจะเพิ่มยังไง)

## Log การรัน Phase H2 — ✅ เสร็จ 2026-07-19

ปลดล็อกฝั่ง frontend — ส่ง `canEdit` จาก `/api/detail` (คำนวณด้วย `canEditManualKpi` ตัวเดียวกับ H1) แล้วเปลี่ยนฟอร์ม `/kpi/[id]` ให้ gate ด้วยค่านี้แทน `role==='admin'`

### สิ่งที่ทำ
1. ✅ `app/api/detail/route.ts` — อ่าน session (cookie เดียวกับที่อื่นใช้) + คำนวณ `canEdit = manual && session ? await canEditManualKpi(conn, session, kpiId) : false` (non-manual KPI = `canEdit: false` เสมอ ไม่มี edit UI ให้ตรงอยู่แล้ว) · ใส่ `canEdit` ใน response ทั้ง 2 จุด (early-return ตอนยังไม่มีข้อมูล + return หลัก) · แก้ข้อความ early-return ที่เขียน "admin กรอก..." ให้เป็นกลาง
2. ✅ `app/kpi/[id]/page.tsx` — เพิ่ม `canEdit?: boolean` ใน `DetailResp` · เปลี่ยน 5 จุดที่ gate ด้วย `user.role === 'admin'` → `data.canEdit` (หัวตาราง, input ฐาน B, input ผลงาน A, ปุ่มบันทึก/ยกเลิก, footnote) · แก้ footnote จาก "เฉพาะผู้ดูแลระบบ (admin)" → "เฉพาะผู้ดูแลระบบ หรือเจ้าหน้าที่กลุ่มงานที่รับผิดชอบ"

### Verify — ผ่าน browser จริงครบ (คลิก/พิมพ์ผ่าน UI จริง ไม่ใช่แค่ fetch)
| เคส | คาดหวัง | ผล |
|---|---|---|
| typecheck (`tsc --noEmit`) | ผ่าน | ✅ |
| สมชาย (staff, ทันตกรรม — ไม่ใช่เจ้าของ) เปิด `/kpi/kpi-1780811100432` | read-only เต็มหน้า ไม่มี input/ปุ่มบันทึก + footnote ใหม่ | ✅ ยืนยันด้วย `read_page` ไม่มี stray input |
| นุชสรา (staff, ปฐมภูมิ — เจ้าของ) เปิดหน้าเดิม | เห็น 🔒 ล็อก + ✏️ แก้ไข เหมือน admin | ✅ |
| นุชสรา คลิก "แก้ไข" → เปลี่ยนเดือนเป็น `2099-01` (ว่าง) → กรอกตัวเลขจริงในตาราง (คลิก+พิมพ์) → กด "บันทึกรายหน่วยบริการ" | บันทึกสำเร็จผ่าน UI จริง, ล็อกฟอร์มอัตโนมัติ | ✅ "✅ บันทึกสำเร็จ" + "🔒 บันทึกแล้ว โดย นุชสรา แก้วกัณหา" ตรง audit |
| admin เปิดหน้าเดิม (regression) | `canEdit: true` | ✅ |
| KPI ที่ไม่ใช่ manual (regression) | `canEdit: false` ทุกคนรวม admin | ✅ ถูกตามดีไซน์ |
| ข้อมูลทดสอบ (`2099-01`) | ลบคืนสภาพหลัง verify | ✅ กลับเป็น 1 แถวเดิม (86.67% มิ.ย.) · console สะอาดทุกรอบ |

### สรุป
**ฟีเจอร์หลัก key-in โดย staff ใช้งานได้จริงครบวงจรแล้ว** (auth → UI → save → audit)

## Log การรัน Phase H3 — ✅ เสร็จ 2026-07-19

แบนเนอร์ "KPI กลุ่มฉันที่ยังไม่ได้กรอกเดือนนี้" ใน `/dashboard` — discoverability ต่อยอด Phase F

### สิ่งที่ตรวจก่อนเขียนโค้ด (สำคัญ — เปลี่ยนขอบเขตงาน)
ตรวจ `app/kpi/page.tsx` (รายการ KPI) ก่อนเริ่ม พบว่า **ไม่ได้ fetch `monthly_data` เลย** และปุ่ม "ดูรายละเอียด" เปิด **modal กราฟแนวโน้ม** ไม่ได้ลิงก์ไปหน้า `/kpi/[id]` ที่แก้ไขได้จริง → จุดเข้าฟอร์มแก้ไขจริงมีทางเดียวคือผ่านตาราง Executive Scorecard ใน `/dashboard` (ผ่าน `detailViewHref`) เท่านั้น → **ตัดสินใจทำแค่ `/dashboard`** ไม่แตะ `/kpi` list (จะต้องเพิ่ม data-fetching ที่ไม่มีอยู่เดิม แลกกับคุณค่าที่ไม่มี เพราะไม่มีทางลิงก์ต่อไปหน้าที่แก้ไขได้อยู่ดี)

### สิ่งที่ทำ
1. ✅ `app/dashboard/page.tsx` — เพิ่ม `myPendingManual` (useMemo, ไม่ผูกกับ toggle onlyAttention/onlyMyGroup — เตือนเสมอไม่ว่าจะเปิดฟิลเตอร์ไหน): กรองจาก `scorecard.rows` ที่ `kpi.manualEntry && kpi.workGroups?.includes(user.department) && r.value === null` (reuse นิยาม "ยังไม่กรอกเดือนนี้" เดิมทุกตัวอักษร — ตัวเดียวกับ badge `✍️ ยังไม่กรอกเดือนนี้` ที่มีอยู่แล้วในตาราง ไม่ได้คิดนิยามใหม่)
2. ✅ แบนเนอร์สีฟ้าเหนือตาราง Scorecard (ก่อน needs_review banner เดิม) — แสดงจำนวน + ลิงก์ตรงไปแต่ละ KPI ด้วย `detailViewHref` (component/route เดิม) — ไม่มี state ใหม่, ไม่มี API endpoint ใหม่, ล้วนเป็น derived data จาก `scorecard.rows` ที่ fetch มาอยู่แล้ว

### Verify — ผ่าน browser จริงครบ
| เคส | คาดหวัง | ผล |
|---|---|---|
| typecheck | ผ่าน | ✅ |
| นุชสรา (ปฐมภูมิ) เปิด `/dashboard` (default `selectedMonth`=ก.ค. แต่ `s_epi_complete` มีข้อมูลถึงแค่มิ.ย.) | เห็นแบนเนอร์ "มี 1 ตัวชี้วัดกลุ่ม ปฐมภูมิ ที่ยังไม่ได้กรอกผลงานเดือนนี้" + ลิงก์ | ✅ |
| คลิกลิงก์ในแบนเนอร์ | ไปหน้า `/kpi/kpi-1780811100432` ตรงตัว, เห็น "⚠️ ยังไม่ได้กรอกข้อมูลเดือนนี้" ตรงกับที่แบนเนอร์บอก | ✅ |
| admin (สุขภาพดิจิทัล, 0 KPI ในกลุ่ม) เปิด `/dashboard` (regression) | ไม่เห็นแบนเนอร์ | ✅ |
| สมชาย (ทันตกรรม, 0 KPI ในกลุ่ม) เปิด `/dashboard` (regression) | ไม่เห็นแบนเนอร์ | ✅ |
| console ทุกรอบ | สะอาด | ✅ |

**H1+H2+H3 ครบทั้ง 3 phase — ฟีเจอร์ key-in โดย staff เจ้าของกลุ่มงานสมบูรณ์ พร้อมใช้งานจริง**

## Log การรัน Phase I — ✅ เสร็จ 2026-07-19

owner ขอเพิ่ม (หลัง H1-H3 เสร็จ): รองรับ KPI manual ที่ **ไม่มีข้อมูลราย รพ.สต. จริงๆ** (เช่น ตัวชี้วัดเฉพาะโรงพยาบาลดงเจริญ) — เดิมบังคับกรอกตาราง 7 หน่วยเสมอ ตอนนี้เลือกได้ตอนตั้ง KPI ว่าจะใช้ตาราง 7 หน่วย (`unit`, เดิม) หรือค่าเดียว (`single`, ใหม่) — ตรงกับตัวเลือก (ค) "มีทั้งสองแบบ" จากคำถามความละเอียดตอนต้น (ตอนนั้นเลือก (ข) อย่างเดียวก่อน)

### สิ่งที่ทำ
1. ✅ **Schema** — เพิ่ม `kpi_reports.manual_scope VARCHAR(10) NOT NULL DEFAULT 'unit'` (backup `_resync_backup/manual-scope-phase-i/` → ALTER ผ่าน SQL file → verify 39/39 KPI เดิม default `'unit'` ถูกต้อง) + อัปเดต `/api/init` (CREATE TABLE + `ADD COLUMN IF NOT EXISTS`) + **ทดสอบ init บน DB เปล่า** (`dhdc_inittest_manualscope`) ผ่านครบ (คอลัมน์ถูกต้อง, idempotent, ล้างทิ้งแล้ว)
2. ✅ `lib/manualKpi.ts` — เพิ่ม `manualScopeOf()` (fallback `'unit'` ปลอดภัยไว้ก่อนถ้าค่าแปลก) คู่กับ `isManualEntry()` เดิม
3. ✅ **เขียนค่า** — endpoint ใหม่ `app/api/monthly/single/route.ts` (`POST {kpiId,month,target,result}` → คำนวณ % อัตโนมัติ, ownership gate เดียวกับ H1, audit + `data_change_log` เหมือนเดิม) — **ไม่เขียน `moph_monthly_detail`** (ไม่มีอะไรให้ drilldown รายหน่วย) · แยก endpoint จาก `/api/monthly/detail` เจตนา: กัน `STAFF_OWNED_WRITE` ไปกระทบ path `/api/monthly` (root, DELETE ยัง admin-only) โดยไม่ตั้งใจ
4. ✅ **อ่านค่า** — `app/api/detail/route.ts` แยก branch `manual && manualScope==='single'` อ่านจาก `monthly_data` ล้วน (ไม่แตะ `moph_monthly_detail`/hospcode) คืน `months`/`savedMonthly`/`stale` รูปแบบเดียวกับโหมดเดิม
5. ✅ **UI** — `app/kpi/[id]/page.tsx` เพิ่มโหมดที่ 3 (การ์ดกรอกค่าเดียว: ฐาน B + ผลงาน A + %auto + lock/edit เหมือนเดิม) · `app/admin/page.tsx` เพิ่ม dropdown "รูปแบบการกรอก" (โชว์เมื่อติ๊ก manual)
6. ⚠️ **ข้อจำกัดที่ตั้งใจรับ:** `monthly_data` เก็บแค่ `value`(%)+`target` ไม่มี `result`(A) ดิบแยก → เปิดฟอร์มซ้ำ "ผลงาน (A)" คำนวณย้อนจาก % (ปัดเศษ 2 ตำแหน่ง) อาจคลาดเคลื่อนเล็กน้อยในบางค่า ผู้กรอกปรับก่อนบันทึกทับได้เสมอ — เลือกทางนี้แทนการเพิ่ม column ใหม่ใน `monthly_data` (ตารางกลางที่ใช้ทั้งระบบ) เพื่อลดความเสี่ยง

### Verify — ผ่าน browser จริงครบ (สร้าง/กรอก/ลบผ่าน UI จริง ไม่ใช่แค่ fetch)
| เคส | คาดหวัง | ผล |
|---|---|---|
| typecheck | ผ่าน | ✅ |
| init บน DB เปล่า (`dhdc_inittest_manualscope`) | คอลัมน์ `manual_scope` ถูกต้อง, 13 ตารางครบ | ✅ |
| สร้าง KPI ทดสอบผ่าน KpiWizard (manual=true) → default scope | `manualScope:'unit'` | ✅ |
| แก้ไขผ่านฟอร์ม `/admin` → ตั้ง scope='single' + กลุ่มงาน=ปฐมภูมิ | บันทึกถูกต้อง | ✅ |
| นุชสรา (ปฐมภูมิ) เปิดหน้า KPI ทดสอบ | เห็นการ์ดกรอกค่าเดียว (ไม่ใช่ตาราง 7 หน่วย) | ✅ |
| นุชสรา กรอก B=120, A=108 → กด "บันทึกผลงาน" (คลิกจริงผ่าน UI) | 90% ถูกต้อง, ล็อกอัตโนมัติ, audit ถูกชื่อ | ✅ "อัปเดตล่าสุดโดย นุชสรา แก้วกัณหา" |
| Reload หน้า | ค่ายังอยู่ 108/120=90% เป๊ะ (ไม่มี drift จากการปัดเศษในเคสนี้) | ✅ |
| สมชาย (ทันตกรรม, ไม่ใช่เจ้าของ) เปิดหน้าเดิม | read-only, ไม่มี input | ✅ + POST ตรง API → 403 |
| admin เปิดหน้าเดิม (regression) | `canEdit:true` | ✅ |
| ลบ KPI ทดสอบ (`DELETE /api/kpis/[id]`) | cascade `monthly_data`/`kpi_work_groups` หมด, กลับเป็น 39 KPI | ✅ ยืนยัน `orphanMonthly:0` |
| console ทุกรอบ | สะอาด | ✅ |

### 🔴 บั๊กที่เจอหลัง verify — พบระหว่าง owner ถามเรื่อง validation เพิ่ม (แก้แล้ว)
**`/api/monthly/single` เขียน `monthly_data.target` ผิด** — ใช้ค่า "ฐาน (B)" ที่ผู้ใช้กรอก (ตัวหารของสูตร %) แทนที่จะเป็น `kpi_reports.target` (เป้าหมายจริงที่ใช้ประเมินผ่าน/ไม่ผ่าน) ทั้งที่ `/api/monthly/detail` (endpoint พี่น้อง) ดึง `kpiTarget` แยกต่างหากถูกต้องอยู่แล้ว — จุดที่พลาดคือตอนเขียน `/single` ใหม่ ลืม SELECT `target` มาจาก `kpi_reports` เลยเผลอใช้ตัวแปรเดียวกับ B

**ผลกระทบจริง:** Dashboard Scorecard (`lib/scorecard.ts`) ตั้งใจใช้ `monthly_data.target` ของเดือนนั้น**เท่านั้น** (ไม่ใช้ `kpi.target` ปัจจุบัน — กันเป้าที่เปลี่ยนภายหลังไปกระทบเดือนเก่า) → ทุกครั้งที่กรอกผ่านโหมด "ค่าเดียว" สถานะผ่าน/ไม่ผ่านบน Dashboard จะ**ผิด** (ใช้ B ที่ไม่เกี่ยวกับเป้าจริงไปตัดสิน) — ทดสอบ Phase I ตอนแรกไม่เจอเพราะหน้า `/kpi/[id]` เอง**ไม่ได้บั๊ก** (อ่าน `kpi.target` สดจาก `kpi_reports` ตรงๆ ไม่ผ่าน `monthly_data`) จึงบังหน้าไว้ — เจอตอนไล่เช็คเคส "อัตราการตาย" (lte) แล้วดู Dashboard เทียบ

**แก้:** `app/api/monthly/single/route.ts` — SELECT `target` เพิ่มจาก `kpi_reports` → ใช้ `kpiTarget` (ไม่ใช่ `t`/ฐาน B) ตอน INSERT `monthly_data` (ตรงกับ pattern `/detail` เป๊ะ) · **Verify ซ้ำผ่าน Dashboard จริง**: กรณี lte เป้า 5 — ค่า 3% → "ผ่าน" ✅ · ค่า 7% → "ไม่ผ่าน" ✅ (ก่อนแก้ทั้งคู่จะพลาดเพราะเทียบกับ B แทนเป้าจริง) · ลบ KPI ทดสอบ cleanup แล้ว

### 🔴 บั๊กที่ 2 — ค่ากรอกแปลกๆ (`"90%"`, `"abc"`) เงียบๆ กลายเป็น 0 แล้วบันทึกสำเร็จ (แก้แล้ว)
เจอตอน owner ขอให้ทดสอบ validation เพิ่ม — `Number(x) || 0` เดิมแปลงค่าที่แปลงเป็นตัวเลขไม่ได้ให้เป็น 0 เงียบๆ แทนที่จะปฏิเสธ ทั้ง `/api/monthly/single` และ `/api/monthly/detail` (pattern เดิมที่มีอยู่ก่อน Phase I อยู่แล้ว ไม่ใช่บั๊กใหม่ แต่ endpoint ใหม่ทำตาม pattern เดิมเลยติดไปด้วย)

**แก้:** เพิ่ม `lib/manualKpi.ts::parseManualNumber(v, label)` — ว่าง/null/undefined = 0 (ยังไม่กรอก, ปกติ) · ไม่ว่างแต่ไม่ใช่ตัวเลขจริง → throw `ManualNumberError` (route จับแล้วตอบ 400 พร้อมชื่อ field + ค่าที่ส่งมา) — ใช้ร่วมกันทั้ง 2 endpoint (กันโค้ดซ้ำ)

**Verify:** `"90%"`/`"abc"` → 400 ข้อความชัดเจน (ระบุ field + ค่าที่ส่ง) ทั้ง 2 endpoint ✅ · `null`/`""` (ยังไม่กรอก) ยังเป็น 0 ตามเดิม ไม่ถูกบล็อก ✅ · ค่าจริงปกติ (120/108) ยังบันทึกได้ถูกต้อง (regression) ✅ · ลบข้อมูล/KPI ทดสอบ cleanup ครบ ✅

### ❓→✅ ปิดคำถาม — validation "ผลงาน (A) ต้องไม่เกินฐาน (B)" กับ KPI แบบ lte (เช่น อัตราการตาย)
ทดสอบแล้วพบ **2 แบบตีความที่ให้ผลต่างกัน** สำหรับ KPI ทิศทาง lte (ยิ่งน้อยยิ่งดี):
- **แบบ coverage-ratio** (B=ฐานประชากรทั้งหมด, A=จำนวนที่เกิดเหตุ เช่น เสียชีวิต) — A จะไม่มีทางเกิน B จริง (ตายไม่เกินคนทั้งหมด) → validation เดิมไม่ขวางอะไร ใช้งานได้ปกติ (ทดสอบ B=1000,A=30→3% ผ่าน / B=1000,A=70→7% ไม่ผ่าน — ถูกทั้งคู่)
- **แบบ "จำนวนเทียบเพดาน"** (B=เพดานที่ตั้งไว้ เช่น "ไม่เกิน 5 ราย", A=จำนวนจริงที่เกิด) — ถ้าผลงานแย่กว่าเป้า (เช่น เกิดจริง 7 ราย เพดาน 5) validation ปัจจุบันจะบล็อกไม่ให้บันทึกเลย (ทดสอบแล้ว: ส่ง `{target:5,result:7}` → 400 "ผลงาน (A) ต้องไม่เกินฐาน (B)")

**owner ยืนยัน 2026-07-19: "อัตราการตาย" เป็นแค่ตัวอย่างสมมติตอนถาม ไม่มี KPI จริงแบบ "จำนวนเทียบเพดาน" ในระบบตอนนี้** → **ปิดเป็น YAGNI ไม่ทำโหมดที่ 3 ตอนนี้** โมเดล B/A→% ปัจจุบันรองรับ KPI ทุกตัวที่มีอยู่จริง (coverage-ratio ทั้งหมด) ครบ — ถ้าอนาคตมี KPI แบบ "จำนวนเทียบเพดาน" จริงๆ ค่อยกลับมาออกแบบโหมดใหม่ตอนนั้น (ห้ามเดา field/สเกลล่วงหน้า)

## Log การรัน Phase J — ✅ เสร็จ 2026-07-20 — ล็อก staff ให้แก้ได้เฉพาะเดือนปัจจุบัน

owner ขอ 2026-07-20: staff ต้องแก้ข้อมูลย้อนหลังไม่ได้ (เดิมแก้เดือนไหนก็ได้เท่ากับ admin) + เวลากดเข้าไปกรอกให้ auto-filter เป็นเดือนปัจจุบันเลย — **admin ยกเว้น ยังแก้ย้อนหลังได้เหมือนเดิม** (ยืนยันกับ owner แล้ว)

### สิ่งที่ทำ
1. ✅ `lib/kpiOwnership.ts` — เพิ่ม `isEditableMonth(session, month)` (pure function แยกจาก `canEditManualKpi` — คนละความรับผิดชอบ: อันหนึ่งเช็ก "เป็นเจ้าของ KPI ไหม" อีกอันเช็ก "เดือนนี้แก้ได้ไหม") — admin=true เสมอ, staff=ต้องตรงเดือนปัจจุบัน (คำนวณจากเวลาเซิร์ฟเวอร์ ไม่เชื่อ client)
2. ✅ **บังคับจริงฝั่งเขียน** — `/api/monthly/detail` + `/api/monthly/single` เพิ่มเช็ก `isEditableMonth` ต่อจาก ownership check เดิม → 403 ข้อความชัดเจนถ้า staff พยายามแก้เดือนอื่น
3. ✅ **UI ฝั่งอ่าน** — `/api/detail`'s `canEdit` field **เปลี่ยนความหมายกลับเป็น "เจ้าของ KPI เท่านั้น" (ไม่ผูกกับเดือน)** — เหตุผล: `entryMonth` (state ฝั่ง frontend) เปลี่ยนได้โดยไม่ re-fetch จาก server (เช่นตอน auto-jump ไปเดือนว่าง) ทำให้ `data.canEdit` ที่คำนวณตามเดือนที่ server ส่งมาค้างเป็นค่าเก่า → ย้ายการเช็ก "เดือนนี้แก้ได้ไหม" ไปทำที่ frontend แทน (`app/kpi/[id]/page.tsx`: `const canEdit = data.canEdit && !monthLocked` โดย `monthLocked` เทียบ `entryMonth` กับ `thisMonth` สด) — การเขียนจริงยัง enforce ที่ POST เสมอไม่ว่า UI จะคำนวณผิดยังไง
4. ✅ **ตัวเลือกเดือน (picker)** — staff (ไม่ใช่ admin) ได้ `min=max=thisMonth` บน `<input type="month">` → เลือกเดือนอื่นไม่ได้เลยจากหน้าเว็บ (admin ไม่ผูก ยังเลือกได้อิสระ)
5. ✅ **Auto-jump ไปเดือนปัจจุบัน** — staff เปิดหน้า KPI ที่ยังไม่มีข้อมูลเดือนนี้ (server default โชว์เดือนล่าสุดที่มีข้อมูล ซึ่งอาจเป็นเดือนก่อน) → useEffect ใหม่เด้ง `entryMonth` ไปเดือนปัจจุบันอัตโนมัติ (ฟอร์มว่างพร้อมกรอกทันที ไม่ต้องกดเปลี่ยนเดือนเอง)

### 🔴 บั๊กระหว่างทำ (เจอจาก verify เข้ม — แก้แล้วก่อนจบ)
**รอบแรก:** ผูก `canEdit` กับเดือนไว้ที่ server (คำนวณแยก 3 จุดใน `/api/detail`) — ทดสอบจริงพบว่าหลัง auto-jump ไปเดือนปัจจุบัน (ข้อ 5) `data.canEdit` ยังเป็นค่าของเดือนเก่า (เพราะ auto-jump ไม่ได้ re-fetch จาก server) → ปุ่มกรอก/บันทึกไม่โผล่ทั้งที่ควรกรอกได้ → **แก้ด้วยการย้าย month-check มาทำที่ frontend** (ข้อ 3 ด้านบน) ทำให้ `canEdit` ที่ render จริงอิงจาก `entryMonth` สดเสมอ

### Verify — ผ่าน browser จริงครบ (ทั้ง unit mode และ single mode)
| เคส | คาดหวัง | ผล |
|---|---|---|
| typecheck | ผ่าน | ✅ |
| นุชสรา เปิด KPI วัคซีน (มีแค่ข้อมูล มิ.ย.) | auto-jump ไปกรกฎาคม (เดือนปัจจุบัน) ฟอร์มว่างพร้อมกรอกทันที | ✅ |
| นุชสรา กรอก+บันทึกเดือนกรกฎาคม (คลิกจริงผ่าน UI) | สำเร็จ 9/10=90% "ผ่าน" audit ถูกชื่อ | ✅ |
| นุชสรา POST ตรง API ไปเดือนมิถุนายน (ย้อนหลัง, bypass UI) | 403 "เจ้าหน้าที่กรอก/แก้ไขได้เฉพาะเดือนปัจจุบันเท่านั้น" | ✅ + มิถุนายนไม่ถูกแตะ (86.67% เดิม) |
| single mode (KPI ทดสอบ) — เหมือนกันทุกเคสข้างบน | auto-jump + กรอกเดือนปัจจุบันได้ + POST เดือนเก่าถูกบล็อก | ✅ |
| admin เปิด KPI เดิม | `canEdit:true` ทุกเดือน ไม่ถูกล็อก (regression) | ✅ |
| ลบข้อมูล/KPI ทดสอบ cleanup | คืนสภาพเดิมครบ | ✅ |
| console ทุกรอบ | สะอาด (เจอ error ค้างจาก HMR ระหว่างแก้ 1 ครั้ง — ตรวจแล้วเป็นของเก่าจาก build ก่อนแก้เสร็จ ไม่ใช่บั๊กจริง ยืนยันด้วย tab ใหม่ + server log สะอาด) | ✅ |

## เริ่มแชทใหม่ยังไง (ประวัติ — ใช้ไปแล้วตอนเริ่ม H1)
บอกแชทใหม่ว่า: *"ทำต่อจาก `docs/kpi-keyin-plan.md` — ฟีเจอร์ให้ staff กรอกผลงาน KPI ของกลุ่มตัวเอง"* แล้วตอบข้อ ❓ ความละเอียดข้างบน
