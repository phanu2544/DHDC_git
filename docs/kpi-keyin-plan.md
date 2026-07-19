# Key-in ผลงานโดย staff เจ้าของ KPI — Starter Doc (ทำในแชทใหม่)

> **สถานะ: ยังไม่เริ่มโค้ด** — เอกสารส่งต่อสำหรับแชทใหม่ (แชทเดิมยาวมาก) · เขียน 2026-07-19
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

## ❓ ยังไม่ตัดสินใจ (ถามใน chat ใหม่ก่อนเริ่ม)
- **ความละเอียดของ "ผลงาน":**
  - (ก) ตัวเลขเดียวต่อเดือน (เป้า + ผลงาน อย่างละ 1 ค่า) — ง่าย เหมาะ KPI ที่ไม่มีตัวเลขราย รพ.สต.
  - (ข) ราย รพ.สต. 7 หน่วย (B/A ต่อหน่วย) — เหมือน manual เดิม ระบบรวมให้ + drilldown ราย รพ.สต. ได้
  - (ค) มีทั้งสองแบบ ให้เลือกตอนตั้ง KPI
- (ตอน owner ถูกถามรอบก่อน ตอบว่า "ยกไปแชทใหม่" — ยังไม่เคาะข้อนี้)

## ⚠️ จุดที่ต้องระวัง (บทเรียนจากงานที่ผ่านมาในโปรเจกต์)
1. **Authorization ฝั่ง server (สำคัญสุด):** ตอนนี้ `middleware.ts` → `/api/monthly` mutation = **admin-only** (`ADMIN_MUTATE`) · ต้องเปิดให้ staff **แต่เฉพาะ KPI ในกลุ่มงานตัวเองเท่านั้น** ไม่ใช่เปิดหมด → เช็คที่ route ว่า `kpi_work_groups` ของ KPI นั้นตรงกับ `users.department` ของคน login (อ่านจาก signed JWT ไม่เชื่อ client) — ระวังช่องโหว่ staff กรอกทับ KPI กลุ่มอื่น
2. **ฟอร์ม `/kpi/[id]` เดิม gate ด้วย `user.role === 'admin'` หลายจุด** (บรรทัดราวๆ 72, 316, 335, 341, 358, 392) → ต้องเปลี่ยน logic เป็น "admin **หรือ** (staff && เป็นเจ้าของกลุ่มของ KPI นี้)"
3. **reuse `/api/monthly/detail` เดิม** — มี transaction + audit + `data_change_log` + orphan-fix ครบแล้ว อย่าเขียน write path ใหม่
4. **ต่อยอด Phase F ได้** — มีฟิลเตอร์ "เฉพาะกลุ่มงานของฉัน" อยู่แล้ว · อาจทำหน้า/แท็บ "KPI ของกลุ่มฉันที่ต้องกรอกผลงาน" ให้ staff เข้ามากรอกสะดวก
5. **charset:** ทุกคำสั่ง SQL ที่มีภาษาไทย ใช้ **SQL file** เท่านั้น อย่าใช้ `mysql -e "..."` inline (ค่าไทยเพี้ยน — เจอซ้ำหลายรอบ)
6. **`/api/init` sync:** ถ้าแตะ schema ต้องแก้ `/api/init` ให้ตรง + ทดสอบ init บน DB เปล่า (มาตรฐานที่ตั้งไว้)

## ไฟล์ที่เกี่ยวข้อง
- `app/kpi/[id]/page.tsx` — ฟอร์ม manual entry (ที่ต้องปลดล็อกให้ staff)
- `app/api/monthly/detail/route.ts` — write path (reuse)
- `middleware.ts` — `ADMIN_MUTATE` (ต้องปรับ authorization)
- `lib/manualKpi.ts` — flag helper
- `lib/useAuth.ts` — `user.department` / `user.role` (มีพร้อมแล้ว)

## เริ่มแชทใหม่ยังไง
บอกแชทใหม่ว่า: *"ทำต่อจาก `docs/kpi-keyin-plan.md` — ฟีเจอร์ให้ staff กรอกผลงาน KPI ของกลุ่มตัวเอง"* แล้วตอบข้อ ❓ ความละเอียดข้างบน
