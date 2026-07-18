# กลุ่มงาน (Work Groups) — Design Doc + Plan

> **สถานะ: ✅ ข้อมูลครบ ไม่มี blocker — กำลัง implement** · เขียน 2026-07-16 · §3 ตอบครบแล้วทุกข้อ
> เป้าหมาย: แบ่งตัวชี้วัดว่าอยู่ในกลุ่มงานไหนของ รพ. + ให้ staff เห็น KPI ของกลุ่มงานตัวเอง
> เกี่ยวข้อง: [`kpi-category-mapping-2569.md`](kpi-category-mapping-2569.md) (หมวดหมู่ HDC — **คนละแกนกัน** ดูหัวข้อ "2 แกนนี้ต่างกันยังไง")

---

## 1. บริบท / ที่มา

รพ. มี **13 กลุ่มงาน** ต้องการแท็กว่าตัวชี้วัดแต่ละตัวเป็นงานของกลุ่มไหน และให้ staff ที่ login เห็นเฉพาะ KPI ของกลุ่มงานตัวเอง

```
องค์กรแพทย์ · แพทย์แผนไทย · เภสัชกรรม · เทคนิคการแพทย์ · รังสีการแพทย์
OPD · IPD · ER · ปฐมภูมิ · ประกันสุขภาพ · ทันตกรรม · บริหารทั่วไป · สุขภาพดิจิทัล
```

### ทำไมต้องทำตอนนี้ (เหตุผลหลัก — owner ระบุ 2026-07-16)

**อนาคตจะมีตัวชี้วัดที่ไม่ได้มาจาก HDC** — ทั้งตัวที่มาจากแหล่งข้อมูลอื่น และตัวที่ รพ. กำหนดเอง/กรอกเอง (key-in)

นี่คือเหตุผลที่กลุ่มงานสำคัญกว่าที่คิด:

> **กลุ่มงาน = แกนเดียวที่ใช้ได้กับ KPI ทุกแหล่ง**
> หมวดหมู่ HDC ใช้ได้เฉพาะ KPI ที่มาจาก HDC — พอมีตัวชี้วัดนอก HDC เข้ามา แกนนั้นเอาไม่อยู่ทันที
> แต่คำถาม "**กลุ่มงานไหนรับผิดชอบ**" ตอบได้เสมอไม่ว่าข้อมูลจะมาจากไหน
> → เมื่อ KPI นอก HDC เยอะขึ้น **กลุ่มงานจะกลายเป็นแกนนำทางหลักของ staff** ไม่ใช่หมวด HDC

**สิ่งที่ระบบรองรับอยู่แล้ว (ไม่ต้องทำใหม่):**

| ความต้องการ | สถานะ |
|---|---|
| KPI กรอกเอง (key-in) | ✅ มีแล้ว — flag `kpi_reports.manual_entry` + ฟอร์มกรอกรายหน่วยบริการ (ใช้จริงกับ `s_epi_complete`) · `runBatchSave`/cron ข้ามให้อัตโนมัติ |
| KPI นอก HDC ต้องมีหมวดหมู่ | ✅ รองรับแล้ว — `categories.group_name` (self-service) สร้างกลุ่มหลักใหม่ เช่น `ตัวชี้วัดภายใน รพ.` ได้เองผ่าน `/admin` · ⚠️ `category` เป็น `NOT NULL` → KPI ทุกตัว**ต้อง**มีหมวด ถึงจะไม่ใช่ของ HDC ก็ตาม |
| แท็กกลุ่มงาน + staff เห็นงานตัวเอง | ⏳ = งานในเอกสารนี้ |
| KPI จาก **API แหล่งที่ 3** (ไม่ใช่ MOPH) | ⚠️ **ยังไม่รองรับ** — ดูด้านล่าง |

**ช่องว่างที่รู้ไว้ก่อน (ยังไม่ต้องทำ):** ตอนนี้ระบบรู้จัก "แหล่งข้อมูล" แค่ 2 แบบโดยปริยาย — มี `moph_table` = ดึงจาก MOPH · `manual_entry=1` = กรอกเอง ถ้าอนาคตมี API แหล่งที่ 3 จริง จะต้องเพิ่มคอลัมน์ `source` (เช่น `moph` / `manual` / `<ชื่อ api>`) แต่ **ยังไม่ต้องทำตอนนี้ (YAGNI)** — เป็นงานแยกที่ไม่กระทบ work group เลย

### 2 แกนนี้ต่างกันยังไง (สำคัญ — อย่าสับสน)

| | หมวดหมู่ HDC *(ทำเสร็จแล้ว)* | กลุ่มงาน *(ไฟล์นี้)* |
|---|---|---|
| ตอบคำถาม | "ตัวชี้วัดนี้**เรื่องอะไร**" | "**ใครใน รพ.** รับผิดชอบ" |
| มาจากไหน | เมนู HDC (มีหลักฐานยืนยัน) | โครงสร้างภายใน รพ. (**ไม่มีที่ไหนให้เช็ค**) |
| โครงสร้าง | 2 ชั้น (กลุ่มหลัก → หมวดย่อย) | 1 ชั้น (13 กลุ่ม) |
| ความสัมพันธ์ | 1 KPI = **1 หมวด** | 1 KPI = **หลายกลุ่ม** |
| เก็บที่ | `kpi_reports.category` | ตารางใหม่ `kpi_work_groups` |

**เป็นแกนอิสระต่อกัน** — เช่น "คัดกรองเบาหวาน 35+" = หมวด `ส่งเสริมป้องกัน › การคัดกรอง` และกลุ่มงาน `ปฐมภูมิ + OPD` พร้อมกันได้

---

## 2. สิ่งที่ยืนยันแล้ว (จาก Q&A)

| # | ประเด็น | คำตอบ |
|---|---|---|
| 1 | 1 KPI อยู่ได้กี่กลุ่มงาน | **หลายกลุ่ม** → ต้องมี junction table |
| 2 | ผูก `users.department` กับกลุ่มงานไหม | **ผูก** → staff login แล้วกรองอัตโนมัติได้ |
| 3 | 1 staff อยู่ได้กี่กลุ่มงาน | **1 กลุ่มเท่านั้น** → ใช้ FK บนคอลัมน์เดิมได้ ไม่ต้องทำ junction ฝั่ง user |
| 4 | ผูก `kpi_reports.owner` → ตาราง `users` | **แยกรอบทีหลัง** (ดูหัวข้อ 8) |

---

## 3. ⛔ สิ่งที่ผมต้องการจากคุณ (blocker — เริ่มไม่ได้ถ้าไม่มี)

### 3.1 remap `users.department` ✅ **ตอบแล้ว 2026-07-16**

| user | role | department เดิม | → กลุ่มงานใหม่ |
|---|---|---|---|
| ผู้ดูแลระบบ | admin | `ฝ่ายสารสนเทศ` | **`สุขภาพดิจิทัล`** |
| สมชาย ใจดี | staff | `งาน NCD` | **`ทันตกรรม`** (คง account ไว้ ไม่ลบ) |
| สมหญิง รักดี | staff | `งานอนามัยแม่และเด็ก` | **`IPD`** (คง account ไว้ ไม่ลบ) |

### 3.2 mapping 39 KPI → กลุ่มงาน ✅ **ตอบแล้ว 2026-07-16 — เลือกวิธี A**

**owner ทั้ง 4 คนอยู่กลุ่มงาน `ปฐมภูมิ` ทั้งหมด** → pre-fill ให้ **39 KPI → `ปฐมภูมิ`** ทุกตัว (1 กลุ่ม/KPI)

```
นุชสรา แก้วกัณหา  → ปฐมภูมิ   (27 KPI)
สุพัตรา บุญศรี     → ปฐมภูมิ   (7 KPI)
อัมพวัน รีสี       → ปฐมภูมิ   (4 KPI)
ดลยา จันทร์คณา    → ปฐมภูมิ   (1 KPI)
```

กลุ่มเสริม (เช่น FIT test → +เทคนิคการแพทย์, telemed → +สุขภาพดิจิทัล) → owner ติ๊กเพิ่มเองในหน้าเว็บทีหลังได้ (Phase C)

> ⚠️ **ผลที่ตามมาที่ต้องรู้:** ตอนนี้ **ไม่มี account ไหนอยู่กลุ่ม `ปฐมภูมิ`เลย** (admin=สุขภาพดิจิทัล, สมชาย=ทันตกรรม, สมหญิง=IPD) แต่ KPI ทั้ง 39 ตัวอยู่ `ปฐมภูมิ`
> → ฟีเจอร์ "KPI ของกลุ่มงานฉัน" (Phase F) จะ**ขึ้นว่างเปล่าสำหรับทุก account ที่มีตอนนี้** — ไม่ใช่บั๊ก เพราะคนที่อยู่ปฐมภูมิจริง (4 owner) ยังไม่มี account · admin ยังเห็นครบทุกตัวตามปกติ
> → มองอีกมุม: สมชาย(ทันตกรรม)/สมหญิง(IPD) ใช้เป็น **account ทดสอบว่าฟิลเตอร์กรองจริง** ได้ดี (ต้องเห็น 0 ตัว)

### 3.3 ~~ยืนยัน "พยาบาลบลู"~~ ✅ **ปิดแล้ว 2026-07-16**
เดิมเป็นข้อมูลทดสอบค้าง — owner แก้เป็น **ดลยา จันทร์คณา** เรียบร้อย (verify ใน DB แล้ว) ตอนนี้ owner เป็นชื่อคนจริงครบทั้ง 4 คน

### 3.4 ลำดับแสดงผล 13 กลุ่มงาน *(ไม่บังคับ)*
`sort_order` จะเรียงตามลำดับที่คุณพิมพ์มา — ถ้ามีลำดับทางการของ รพ. (เช่น ตามผังองค์กร) บอกได้

---

## 4. Schema ที่เสนอ

```sql
-- 1) ตารางกลุ่มงาน (lookup — จัดการเองผ่าน /admin ได้เหมือน categories)
CREATE TABLE work_groups (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_wg_name (name)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2) junction: 1 KPI ↔ หลายกลุ่มงาน
CREATE TABLE kpi_work_groups (
  kpi_id     VARCHAR(50)  NOT NULL,
  work_group VARCHAR(100) NOT NULL,
  PRIMARY KEY (kpi_id, work_group),          -- กันผูกซ้ำ
  KEY idx_kwg_group (work_group),            -- เร่ง query "KPI ของกลุ่มงานนี้"
  CONSTRAINT fk_kwg_kpi   FOREIGN KEY (kpi_id)     REFERENCES kpi_reports(id)  ON DELETE CASCADE,
  CONSTRAINT fk_kwg_group FOREIGN KEY (work_group) REFERENCES work_groups(name) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3) ผูก user → กลุ่มงาน (ใช้คอลัมน์ department เดิม ไม่สร้างใหม่)
ALTER TABLE users MODIFY department VARCHAR(100) NULL;   -- ย่อจาก 255 ให้ตรงชนิดกับ work_groups.name
ALTER TABLE users ADD CONSTRAINT fk_users_wg
  FOREIGN KEY (department) REFERENCES work_groups(name)
  ON UPDATE CASCADE      -- เปลี่ยนชื่อกลุ่มงาน → user ตามไปเอง
  ON DELETE SET NULL;    -- ลบกลุ่มงาน → user แค่ไม่มีสังกัด (ไม่ลบ user ทิ้ง)
```

### ทำไม FK ไปที่ `name` ไม่ใช่ `id`

| | FK → `name` *(เลือกอันนี้)* | FK → `id` |
|---|---|---|
| rename กลุ่มงาน | ต้องพึ่ง `ON UPDATE CASCADE` | ฟรี (id ไม่เปลี่ยน) ✅ |
| **`users.department`** | **ยังเป็น string → JWT/auth/Navbar ไม่ต้องแตะเลย** ✅ | ต้องรื้อ JWT + `/api/auth/me` + Navbar + ฟอร์ม + types ❌ |
| อ่านค่า | ได้ชื่อเลย ไม่ต้อง JOIN ✅ | ต้อง JOIN ทุกครั้ง |
| สอดคล้อง codebase | ตรง pattern เดิม (`kpi_reports.category` → `categories.name`) ✅ | ขัดของเดิม |
| ขนาด index | กว้างกว่า (VARCHAR100) ❌ | แคบ (INT) ✅ |

**เหตุผลชี้ขาด:** ถ้าใช้ `id` จะต้องรื้อ JWT/auth ซึ่งเป็นของที่ verify ผ่านแล้วและเสี่ยงพัง — แลกกับ index กว้างขึ้นนิดหน่อยที่ระดับข้อมูลจริง (39 KPI × 13 กลุ่ม = ไม่เกิน ~507 แถว) ถือว่าคุ้มมาก

⚠️ **ต้อง verify ตอน implement:** `ON UPDATE CASCADE` บนคอลัมน์ที่เป็นส่วนหนึ่งของ PK (`kpi_work_groups.work_group`) — InnoDB รองรับ แต่จะทดสอบ rename จริงก่อนปิดงาน ถ้าติดปัญหาจะถอยไปใช้ `id` เฉพาะ junction

---

## 5. Plan

| Phase | งาน | ติดอะไร | ประเมิน |
|---|---|---|---|
| ~~**A**~~ | ~~สร้าง 2 ตาราง + seed 13 กลุ่มงาน + เพิ่มใน `/api/init`~~ | ✅ **เสร็จ 2026-07-16** (ดูหัวข้อ 10) | เล็ก |
| ~~**B**~~ | ~~`/api/work-groups` (CRUD) + UI จัดการกลุ่มงานใน `/admin`~~ | ✅ **เสร็จ 2026-07-16** (ดูหัวข้อ 11) | กลาง |
| **C** | UI ติ๊กกลุ่มงานในฟอร์มแก้ไข KPI (เลือกได้หลายกลุ่ม) + แสดงในตาราง KPI | — | กลาง |
| **D** | ใส่ข้อมูล mapping จริง 39 KPI | **§3.2** | ขึ้นกับวิธี A/B |
| **E** | remap `users.department` + ใส่ FK + เปลี่ยนช่อง department เป็น dropdown | **§3.1** | เล็ก |
| **F** | ฟิลเตอร์ "KPI ของกลุ่มงานฉัน" ใน `/dashboard` + `/kpi` | หลัง D+E | เล็ก |

**A→C ทำได้เลยโดยไม่ต้องรอข้อมูลจากคุณ** · D/E คือจุดที่ติด

**ทุก DB op ทำตามกฎเดิม:** backup → preview(ROLLBACK) → gate(ROW_COUNT) → COMMIT → verify

---

## 6. ผลกระทบต่อระบบ

### DB
| สิ่งที่เปลี่ยน | ผลกระทบ |
|---|---|
| ตารางใหม่ `work_groups`, `kpi_work_groups` | additive ล้วน ไม่กระทบของเดิม |
| `users.department` VARCHAR(255)→(100) | ค่าปัจจุบันสั้นมาก ไม่มีข้อมูลหาย (จะ verify ก่อน ALTER) |
| FK บน `users.department` | **ต้อง remap ค่าให้ถูกก่อน ไม่งั้น ALTER fail** |
| `kpi_reports` | **ไม่แตะเลย** ในเฟสนี้ |

### ไฟล์ที่ต้องแก้
| ไฟล์ | แก้อะไร |
|---|---|
| `app/api/init/route.ts` | เพิ่ม CREATE TABLE 2 ตาราง + seed 13 กลุ่ม (**production ต้องรัน `/api/init` ใหม่**) |
| `app/api/work-groups/route.ts` | **ใหม่** — GET/POST/DELETE |
| `app/api/kpis/route.ts` + `[id]/route.ts` | อ่าน/เขียน `workGroups: string[]` (JOIN junction) |
| `app/admin/page.tsx` | 3 จุด: จัดการกลุ่มงาน · ติ๊กกลุ่มงานในฟอร์ม KPI · department เป็น dropdown |
| `lib/types.ts` | `KPIReport.workGroups?: string[]` |
| `app/dashboard/page.tsx`, `app/kpi/page.tsx` | ฟิลเตอร์กลุ่มงาน (Phase F) |
| `components/KpiWizard.tsx` | *(เลือกทำ)* เพิ่มขั้นตอนเลือกกลุ่มงานตอนสร้าง KPI |

### สิ่งที่ **ไม่** กระทบ (ตั้งใจออกแบบให้ไม่โดน)
- ✅ JWT / `middleware.ts` / `/api/auth/*` / `useAuth` / Navbar — `department` ยังเป็น string เหมือนเดิม
- ✅ engine ทั้งหมด (`mophEngine`, `kpiStatus`, `scorecard`, `mophBatch`, cron) — ไม่รู้จักกลุ่มงานเลย
- ✅ `monthly_data`, `moph_monthly_detail`, drilldown, manual KPI — ไม่แตะ
- ✅ หมวดหมู่ HDC ที่เพิ่งทำเสร็จ — คนละแกน ไม่ทับกัน

---

## 7. ผลดี / ผลเสีย

### ✅ ผลดี
1. **ตอบโจทย์ที่ขอ** — staff login → เห็นเฉพาะ KPI กลุ่มงานตัวเอง (ไม่ต้องเลื่อนหา 39 ตัว)
2. **แท็กได้ตรงความจริง** — many-to-many รองรับ KPI ที่หลายกลุ่มร่วมกันจริง (เช่น FIT test = ปฐมภูมิ + เทคนิคการแพทย์)
3. **กัน typo ด้วย FK** — ปัญหาที่มีอยู่จริง (`"สุพัตรา  บุญศรี"` เว้นวรรค 2 ครั้ง) จะไม่เกิดกับกลุ่มงาน
4. **rename ปลอดภัย** — เปลี่ยนชื่อกลุ่มงานทีเดียว ทั้ง KPI และ user ตามหมดอัตโนมัติ
5. **self-service** — owner เพิ่ม/ลบ/แก้กลุ่มงาน + ติ๊ก KPI เองได้ ไม่ต้องรอผมรัน SQL (ตรงแนวทางที่ทำมาตลอด)
6. **ไม่แตะ auth** — ความเสี่ยงพังต่ำ เพราะของที่ verify ผ่านแล้วไม่ถูกรื้อ
7. **ไม่ทับซ้อนแกน HDC** — ใช้คู่กันได้ ต่อยอด dashboard ได้ 2 มุม
8. **⭐ รองรับ KPI นอก HDC ในอนาคต** — เป็นแกนเดียวที่ยังใช้ได้เมื่อตัวชี้วัดไม่ได้มาจาก HDC (ดูหัวข้อ 1) → ยิ่งทำเร็วยิ่งดี เพราะถ้ารอจนมี KPI นอก HDC เยอะแล้วค่อยมาแท็กย้อนหลัง จะเหนื่อยกว่ามาก

### ❌ ผลเสีย / ต้นทุน
1. **ข้อมูล mapping ต้องกรอกด้วยมือ** — 39 KPI × N กลุ่ม ผมช่วยเดาไม่ได้เลย เป็นแรงงานคนล้วน
2. **production ต้องรัน `/api/init` ใหม่** — เพิ่มรายการที่ค้างอยู่แล้ว (`cron_log`, `data_change_log`) เป็น **4 ตาราง**
3. **FK = ข้อจำกัดใหม่** — เพิ่ม user แล้วพิมพ์ department มั่วไม่ได้อีก ต้องแก้ฟอร์มเป็น dropdown (งานเพิ่ม แต่ผลลัพธ์ดีกว่า)
4. **ถ้าอนาคต 1 staff ต้องอยู่หลายกลุ่ม → ต้องรื้อ** ทิ้ง FK แล้วทำ junction `user_work_groups` แทน (ตอนนี้ยืนบนคำตอบ "1 คน 1 กลุ่ม")
5. **`ON UPDATE CASCADE` บน PK component ต้อง verify** — มีความเสี่ยงเล็กน้อยว่าต้องถอยไปใช้ `id` เฉพาะ junction
6. **UI ซับซ้อนขึ้น** — ฟอร์ม KPI มี multi-select เพิ่ม, หน้า `/admin` ที่ยาว ~1550 บรรทัดอยู่แล้วจะยาวขึ้นอีก (ยิ่งควรแยกไฟล์ตาม PLAN.md ข้อ F)
7. **ยังไม่ได้ feature "KPI ที่ฉันรับผิดชอบ" รายคน** — ต้องรอ owner→user (หัวข้อ 8)

---

## 8. เรื่องที่กันออกไปก่อน (follow-up)

### 8.0 สร้าง account จริงให้ 4 owner — ⏸️ **ยังไม่ทำ (ตั้งใจ)**

**ข้อสรุป 2026-07-16:** owner รู้แค่ชื่อ 4 คน ยังไม่มี email จริง → **ไม่ต้องรีบสร้าง**

ตรวจโค้ดยืนยันแล้วว่าไม่มีอะไรบล็อก:
- ✅ **email ปลอมได้** — ระบบ**ไม่ส่งอีเมลเลยสักที่** (ไม่มี nodemailer/smtp ใน `package.json`) `email` เป็นแค่ "ชื่อผู้ใช้ตอน login" ข้อจำกัดเดียวคือห้ามซ้ำ (UNIQUE) → ใช้ `<ชื่อ>@dongcharoen.local` ไปก่อนได้
- ✅ **admin รีเซ็ตรหัสผ่านได้ตลอด ไม่มีเงื่อนไข** — [`app/api/users/[id]/route.ts:25-29`](../app/api/users/[id]/route.ts) `PATCH {password}` ไม่ต้องรู้รหัสเดิม ไม่ต้องให้เจ้าตัวยืนยัน (bcrypt hash อัตโนมัติ) → ตั้งรหัสชั่วคราวแล้วแก้ทีหลังได้เสมอ ไม่มีทางติดล็อก
- ✅ **ไม่บล็อก Phase ไหนเลย** — Phase A-F ทำได้ครบโดยใช้ 3 account เดิม · Phase F ยิ่งดีเพราะ สมชาย(ทันตกรรม)/สมหญิง(IPD) เป็น**ตัวทดสอบชั้นดีว่าฟิลเตอร์กรองจริง** (ต้องเห็น 0 ตัว)

**เหตุผลที่ไม่สร้างตอนนี้:** สร้างไปตอนนี้ = account ค้างเปล่าไม่มีคนใช้ = สร้าง "ข้อมูลทดสอบ" ชุดใหม่ซ้ำรอยปัญหาเดิม (พยาบาลบลู/สมชาย/สมหญิง) · รอสร้างทีเดียวตอนส่งมอบจริงจะได้ email จริงพอดี ไม่ต้องไล่แก้

### 8.1 เพิ่ม API แก้ email — 🔧 **งานเล็ก ยังไม่ทำ**

**ปัญหาที่เจอ:** `PATCH /api/users/[id]` รับแค่ `password` / `name` / `department` / `role` — [**ไม่มีทางแก้ `email` ผ่าน API เลย**](../app/api/users/[id]/route.ts) ต้องแก้ผ่าน SQL ตรงๆ

**เมื่อไหร่ถึงจำเป็น:** ตอนสร้าง account ด้วย email ปลอม (`@dongcharoen.local`) แล้วให้เจ้าตัวมาแก้เป็น email จริงทีหลัง → ถ้าไม่มี API นี้ owner แก้เองไม่ได้ ต้องมาขอ dev รัน SQL ทุกครั้ง (ขัดแนวทาง self-service)

**วิธีแก้ (~5 นาที):**
```ts
// app/api/users/[id]/route.ts — เพิ่ม email เข้า general update
const { name, email, department, role } = body
await conn.execute(
  'UPDATE users SET name=COALESCE(?,name), email=COALESCE(?,email), department=COALESCE(?,department), role=COALESCE(?,role) WHERE id=?',
  [name ?? null, email ?? null, department ?? null, role ?? null, params.id],
)
```
+ ดัก `ER_DUP_ENTRY` → 409 "อีเมลนี้มีอยู่ในระบบแล้ว" (เหมือนที่ POST ทำอยู่) + เพิ่มช่องแก้ email ในฟอร์ม `/admin`

**ทำตอนไหน:** พร้อมกับ Phase 8.0 (ตอนสร้าง account จริง) — ยังไม่ต้องทำตอนนี้

### 8.2 ผูก `owner` → `users`

**ทำไมไม่รวมรอบนี้:**
- **ไม่ช่วยเรื่องกลุ่มงานเลย** — 1 คน = 1 กลุ่ม แต่ 1 KPI = หลายกลุ่ม → ดึงกลุ่มงานจาก owner จะได้แค่ 1 กลุ่ม/KPI = ขัด requirement ข้อ 1 → **ยังต้องมี junction อยู่ดี**
- **ติด provisioning จริง** — ต้องมี email/รหัสผ่านจริงของ 3-4 คน และเขาต้องยอม login จริง = งานองค์กร ไม่ใช่งานโค้ด
- **สิ่งที่คุณขอทำได้แล้วโดยไม่ต้องผูก** — `user.department` → `kpi_work_groups` ก็ได้ "KPI ของกลุ่มงานฉัน" ครบ

**ถ้าจะทำภายหลัง** (คือข้อ D2-B ที่ค้างใน [`PLAN.md`](PLAN.md)):
```sql
ALTER TABLE kpi_reports ADD COLUMN owner_id VARCHAR(50) NULL,
  ADD CONSTRAINT fk_kpi_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;
-- เก็บคอลัมน์ owner (ข้อความ) ไว้ช่วง transition
```
จะได้เพิ่ม: ล้าง typo ชื่อคน · "KPI ที่ฉันรับผิดชอบ" รายคน · เปลี่ยนชื่อคนแล้ว cascade
**ตาราง `users` เองแทบไม่ต้องปรับ** — ที่ต้องปรับคือ `kpi_reports`

---

## 9. สรุป

**สิ่งที่จะทำ:** เพิ่ม 2 ตาราง (`work_groups` + junction `kpi_work_groups`) และผูก `users.department` เข้ากับกลุ่มงานด้วย FK แบบอ้างชื่อ — ทำให้แท็ก KPI ได้หลายกลุ่ม, staff เห็นเฉพาะงานตัวเอง, owner จัดการกลุ่มงานเองได้, และ**ไม่ต้องแตะ auth/engine/ข้อมูลรายเดือนเลย**

**ทำไมตอนนี้:** อนาคตจะมีตัวชี้วัดนอก HDC (แหล่งอื่น / กรอกเอง) ซึ่งหมวดหมู่ HDC เอาไม่อยู่ — **กลุ่มงานเป็นแกนเดียวที่ใช้ได้กับ KPI ทุกแหล่ง** และจะกลายเป็นแกนนำทางหลักของ staff · ทำก่อนที่ KPI จะเยอะ = ถูกกว่าแท็กย้อนหลัง

**ความเสี่ยงหลัก:** ต่ำ — เป็น additive ล้วน แกนกลางของระบบไม่ถูกรื้อ · จุดเดียวที่ต้องระวังคือ FK บน `users.department` ที่ต้อง remap ค่าให้ถูกก่อน

**ต้นทุนจริงไม่ใช่โค้ด แต่คือข้อมูล** — mapping 39 KPI → กลุ่มงาน ไม่มีใครเดาแทนคุณได้

**ผมเริ่ม Phase A→C ได้ทันทีโดยไม่ต้องรออะไร** (สร้างตาราง + UI จัดการ + UI ติ๊ก) แล้วค่อยเติมข้อมูลตอน D — หรือจะรอเคลียร์ §3 ให้ครบก่อนแล้วทำรวดเดียวก็ได้

### ✅ §3 เคลียร์ครบทุกข้อแล้ว — ไม่มี blocker เหลือ
1. ~~**§3.1** — 3 user remap~~ ✅ admin→สุขภาพดิจิทัล · สมชาย→ทันตกรรม · สมหญิง→IPD (คง account ทั้งคู่)
2. ~~**§3.2** — วิธี mapping~~ ✅ **วิธี A** — ทุก owner อยู่ `ปฐมภูมิ` → 39 KPI → ปฐมภูมิ
3. ~~**§3.3** — "พยาบาลบลู" คือใคร~~ ✅ → ดลยา จันทร์คณา

---

## 10. Log การรัน Phase A — ✅ เสร็จ 2026-07-16

### สิ่งที่ทำ
1. ✅ Backup: `_resync_backup/work-groups-phase-a/` (schema-before.sql + users-backup.sql)
2. ✅ ตรวจชนิด/collation ก่อนสร้าง FK — `kpi_reports.id` = `varchar(50)` utf8mb4_unicode_ci + InnoDB ตรงกันทั้งคู่
3. ✅ สร้าง `work_groups` + `kpi_work_groups` (`phase-a-schema.sql`)
4. ✅ Seed 13 กลุ่มงาน เรียงตามลำดับที่ owner ให้ (`phase-a-seed.sql`, `INSERT IGNORE` = idempotent)
5. ✅ **ทดสอบ FK cascade จริง** (`verify-cascade.sql` — ปิดความเสี่ยงที่ flag ไว้ใน §4)
6. ✅ เพิ่มทั้ง 2 ตาราง + seed เข้า `app/api/init/route.ts`
7. ✅ Typecheck ผ่าน (`tsc --noEmit` clean)
8. ✅ ทดสอบ init 2 สถานการณ์ (ดูล่าง)

### ผลทดสอบ FK cascade — **ผ่านครบ 5/5** (ความเสี่ยงใน §4 ปิดแล้ว)
| # | ทดสอบ | คาดหวัง | ผล |
|---|---|---|---|
| 1 | insert junction 2 แถว | 2 แถว | ✅ |
| 2 | **`ON UPDATE CASCADE` — rename กลุ่มงาน** (ทั้งที่ `work_group` เป็นส่วนหนึ่งของ PK) | ชื่อใน junction เปลี่ยนตาม | ✅ **ทำงานจริง** |
| 3 | `ON DELETE CASCADE` — ลบกลุ่มงาน | junction เหลือ 0 | ✅ |
| 4 | `ON DELETE CASCADE` — ลบ KPI | junction เหลือ 0 | ✅ |
| 5 | insert กลุ่มงานที่ไม่มีจริง | ต้อง error | ✅ `ERROR 1452` |

→ **ไม่ต้องถอยไปใช้ FK บน `id`** — ออกแบบเดิม (FK อ้าง `name`) ใช้ได้จริง

### ผลทดสอบ `/api/init` — ผ่านทั้ง 2 สถานการณ์
| สถานการณ์ | วิธีทดสอบ | ผล |
|---|---|---|
| **DB มีข้อมูลอยู่แล้ว** (= รัน init ซ้ำ) | `POST /api/init` บน `dhdc_dev` จริง | ✅ **idempotent** — categories 7, work_groups 13, kpi 39, users 3, monthly_data 73 **เท่าเดิมเป๊ะ** · ไม่มีหมวดขยะกลับมา · KPI ยังจัดหมวดถูกครบ |
| **DB เปล่า** (= production go-live) | สร้าง `dhdc_inittest` เปล่า → รัน server ชั่วคราวชี้ DB นั้นด้วย `DB_NAME` env → `POST /api/init` | ✅ สร้างครบ **12 ตาราง** รวม work_groups + kpi_work_groups · **FK ordering ถูก** · seed ครบถูกต้อง |

*(ล้าง `dhdc_inittest` + server ชั่วคราวทิ้งแล้ว — เหลือแค่ `dhdc_dev`)*

### 🔴 บั๊กที่เจอ + แก้แล้ว (ตกค้างจาก Phase 2 หมวดหมู่ HDC)

**บั๊ก 1 — `/api/init` สร้าง `categories` ไม่มีคอลัมน์ `group_name`**
- **สาเหตุ:** Phase 2 ผมเพิ่ม `group_name` เข้า `dhdc_dev` ด้วย `ALTER TABLE` ตรงๆ แต่**ลืมแก้ `/api/init`**
- **ผลถ้าไม่เจอ:** go-live → `/api/init` สร้าง categories ไม่มี `group_name` → `SELECT name, group_name FROM categories` **พังทันที** ทั้งหน้า `/admin` และ dropdown ทุกที่
- **แก้:** เพิ่ม `group_name` ใน `CREATE TABLE` + ใส่ `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` สำหรับ DB เดิมที่สร้างไปก่อนแล้ว

**บั๊ก 2 — seed หมวดหมู่ยังเป็นชุดเก่าที่เพิ่งลบทิ้ง**
- **สาเหตุ:** `DEFAULT_CATEGORIES` ยังเป็น `['NCD','แม่และเด็ก','โรคติดต่อ','ผู้สูงอายุ','สุขภาพจิต','อื่นๆ']` — คือหมวดขยะ 6 ตัวที่ Phase 2 เพิ่งลบออกไป
- **ผลถ้าไม่เจอ:** รัน `/api/init` ครั้งใด **หมวดขยะกลับมาทุกครั้ง** (ไม่มี group_name, ไม่มี KPI ใช้) — งาน Phase 2 พังย้อนหลัง
- **แก้:** เปลี่ยนเป็น 7 หมวดใหม่พร้อม `group_name` ตรงกับ [`kpi-category-mapping-2569.md`](kpi-category-mapping-2569.md)

> 💡 **บทเรียน:** เวลาแก้ schema ด้วย `ALTER TABLE` ตรงๆ ใน dev **ต้องแก้ `/api/init` ให้ตรงกันเสมอ** ไม่งั้น dev กับ production จะ schema ไม่ตรงกัน และจะไปเจอตอน go-live ซึ่งแพงที่สุด · ต่อไปทุก Phase ที่แตะ schema จะทดสอบ init บน DB เปล่าเป็นมาตรฐาน

### สถานะ production init
`/api/init` ตอนนี้สร้างครบ **4 ตารางที่ยังไม่เคยมีบน production**: `cron_log` · `data_change_log` · `work_groups` · `kpi_work_groups` (+ migrate `categories.group_name` ให้ DB เดิมอัตโนมัติ)

### 🔴 บั๊ก 3 (เจอก่อนเริ่ม Phase B) — `INITIAL_USERS.department` ไม่ตรงกับ 13 กลุ่มงาน → แก้แล้ว
- **สาเหตุ:** `lib/initialData.ts` seed user ด้วย `ฝ่ายสารสนเทศ` / `งาน NCD` / `งานอนามัยแม่และเด็ก` — ไม่มีตัวไหนอยู่ใน `work_groups` เลย
- **ผลถ้าไม่เจอ:** พอถึง Phase E (ใส่ FK บน `users.department`) → go-live รัน `/api/init` บน DB เปล่า → seed user ก่อน FK มาทีหลังจะ ALTER fail (มีแถวผิดค้างอยู่) หรือสลับลำดับก็ INSERT fail (`ERROR 1452`) → **init ตายทั้งก้อน**
- **แก้:** เปลี่ยน seed เป็นค่าที่ตัดสินไว้แล้วใน §3.1 — admin→`สุขภาพดิจิทัล`, สมชาย→`ทันตกรรม`, สมหญิง→`IPD`
- **Verify:** สร้าง DB เปล่าที่ 2 (`dhdc_inittest2`) → รัน init จริง → seed users ออกมาตรง 3 ค่าใหม่ครบ ✅ · typecheck ผ่าน ✅ · ล้าง DB ทดสอบ + dev server หลัก (3002) ปกติ ✅
- **หมายเหตุ:** นี่แก้แค่ **seed code** (`lib/initialData.ts`) — ตาราง `users` จริงใน `dhdc_dev` **ยังไม่ถูกแก้** (ยังเป็นค่าเดิม `ฝ่ายสารสนเทศ`/`งาน NCD`/`งานอนามัยแม่และเด็ก`) เพราะการ remap ค่าจริงคืองานของ **Phase E** ไม่ใช่ตอนนี้

---

## 11. Log การรัน Phase B — ✅ เสร็จ 2026-07-16

### สิ่งที่ทำ
1. ✅ ตรวจ `middleware.ts` ก่อนเขียน API — เจอว่า `/api/work-groups` ต้องเพิ่มเข้า `ADMIN_MUTATE` เอง (ไม่มี default ป้องกันให้) แก้ก่อนเขียน route
2. ✅ `app/api/work-groups/route.ts` — GET (list, ทุกคนที่ login), POST (admin only, auto sort_order = MAX+1), DELETE (admin only, **guard 2 ชั้น**: บล็อกถ้ามี KPI หรือ user สังกัดอยู่ — แม้ FK จะ cascade ได้จริงก็ไม่ปล่อยให้ข้อมูลหายเงียบๆ)
3. ✅ `components/WorkGroupManager.tsx` — component แยกไฟล์ใหม่ (ตาม pattern KpiWizard/FieldChipBuilder) ไม่ยัดเข้า `admin/page.tsx` โดยตรง — mount ในแท็บ KPI ต่อจาก Category Management
4. ✅ Typecheck ผ่าน + verify ผ่าน browser จริงครบ:
   - เพิ่ม/ลบกลุ่มงานปกติ ✅
   - **guard เคส 1** (ลบกลุ่มที่มี KPI ผูกอยู่) → `409 "ลบไม่ได้ — มี 1 KPI สังกัดกลุ่มงานนี้อยู่"` ✅
   - **guard เคส 2** (ลบกลุ่มที่มี user สังกัดอยู่) → `409 "ลบไม่ได้ — มี 1 ผู้ใช้ สังกัดกลุ่มงานนี้อยู่"` ✅
   - **role-guard** (staff) → GET 200 (เห็นได้) / POST 403 "ต้องเป็นผู้ดูแลระบบ (admin)" ✅ ทดสอบผ่าน `fetch()` จริงในหน้าเว็บด้วย session staff
   - ข้อมูลทดสอบ (junction row + department ชั่วคราว) cleanup ครบ คืนสภาพเดิม

### 🔴 บั๊กที่เจอระหว่างทดสอบ (ไม่ใช่ตัวบล็อก แต่ทำให้ช้า)
Dev server หยุดเองกลางทดสอบ 2 รอบ (ตรงกับที่ CLAUDE.md เตือนไว้ว่าเครื่องนี้หยุดบ่อย) + เจอว่า **`curl` จาก Bash tool เข้าไม่ถึง preview server ที่เปิดผ่าน Browser pane** (คนละ network context กัน) — ต้องเปลี่ยนวิธีทดสอบ role-guard จาก curl+cookie เป็น `javascript_tool` (`fetch()` ในหน้าเว็บจริง ให้ browser แนบ cookie ให้เอง) แทน — **บทเรียน: ทดสอบ API ที่รันผ่าน Browser pane preview ต้องใช้ `javascript_tool`/`computer` ไม่ใช่ `curl` จาก Bash**

## 12. System-wide bug sweep — ✅ เสร็จ 2026-07-16 (หลัง Phase B)

ตรวจทั้งระบบตามที่ owner ขอ ("ตรวจระบบอีกครั้ง มีบั๊กตรงไหนเสนอวิธีแก้เลย") — เจอ 2 บั๊กจริง แก้แล้วทั้งคู่ + 1 ข้อสังเกต (ไม่แก้ ต้องตัดสินใจ):

### 🔴 บั๊กที่ 4 — ค่า category `'NCD'` ที่ถูกลบไปแล้ว (Phase 2) ยังฝังเป็น fallback ในโค้ด
- **จุดที่เจอ:** `components/KpiWizard.tsx:68` `useState(categories[0] ?? 'NCD')` และ `app/admin/page.tsx` `emptyForm()`
- **สถานการณ์ที่พัง:** ถ้า `categories` ว่าง (เช่น ลบหมวดหมู่ทั้งหมดผ่าน self-service ที่เพิ่งทำ) → wizard default เป็น `'NCD'` ซึ่งไม่มีอยู่ใน `categories` table แล้ว → **ไม่มี validation กันไว้** → สร้าง KPI ด้วยหมวดผีได้เงียบๆ → KPI ตัวนั้นหายจาก dropdown filter ทุกที่ (filter ดึงจาก `categories` table ไม่ใช่ distinct `kpi_reports.category`)
- **แก้:** เปลี่ยน fallback เป็น `''` ทั้ง 2 จุด (fail แบบเห็นได้ชัดแทนที่จะ fail แบบดูสมเหตุสมผลแต่ผิด)
- **Verify:** เปิด wizard จริงหลังแก้ → category select ได้ค่าจริง (`อนามัยแม่และเด็ก`) ไม่ใช่ `'NCD'` ✅

### 🔴 บั๊กที่ 5 — `/api/kpis` POST + PUT ไม่เคย validate ว่า `category` ต้องไม่ว่าง
- **จุดที่เจอ:** `app/api/kpis/route.ts` POST เช็คแค่ `name`/`owner`/`deadline`, `app/api/kpis/[id]/route.ts` PUT **ไม่เช็คอะไรเลย**
- **ผลกระทบ:** เดิมเป็นช่องโหว่ที่ไม่มีใครสังเกตเพราะ category ไม่ได้สำคัญมาก — แต่ Phase 2 ทำให้ category ขับ grouped dashboard ทั้งระบบ ตอนนี้ KPI ที่ไม่มีหมวดจะ "หาย" จากมุมมองกลุ่มทันที
- **แก้:** เพิ่ม `!category` เข้าเงื่อนไข required-field check ทั้ง 2 endpoint (ตรง pattern เดิมที่มีอยู่แล้วสำหรับ name/owner/deadline)
- **Verify:** typecheck ผ่าน · wizard error path ที่มีอยู่แล้ว (`if (!createRes.ok) setResult({error: ...})`) โชว์ error นี้ให้ user เห็นได้ทันทีถ้าเกิดขึ้นจริง

### 📝 ข้อสังเกต (ไม่แก้ — ต้อง owner ตัดสินใจ)
**พบตารางที่ไม่มีใครอ่านอีก 1 ตาราง: `moph_report_catalog`** (แยกจาก `moph_snapshot` ที่ตัดไปแล้ว 2 ก.ค.) — grep ทั้ง repo เจอแค่ `/api/init` (schema+seed) กับ `lib/types.ts` (type def) อ้างถึง ไม่มี route/หน้าไหนอ่านจริง เข้าข่าย dead code เดียวกับที่เคยเจอ (`moph_snapshot`) แต่**ยังไม่ตัด** เพราะเป็นการลบ table/schema (ไม่ใช่ bug fix ตรงๆ) ควรทำเป็นงานแยกถ้า owner ต้องการ

## 13. ตรวจ Phase C ซ้ำตามคำขอ owner — ✅ เจอบั๊กร้ายแรง 1 ตัว แก้แล้ว (2026-07-16)

owner ถามตรงๆ "Phase C มีบั๊กไหม มีจุดไหนทำให้ระบบพังไหม" — ไล่โค้ดทุกจุดที่ Phase C แตะ แล้วทดสอบจำลองสถานการณ์จริง (สร้าง DB `dhdc_bugtest`: รัน `/api/init` เต็มแล้ว DROP เฉพาะ `kpi_work_groups` ทิ้ง — จำลอง "production ก่อนรัน `/api/init` รอบใหม่" ซึ่งเป็นสถานการณ์จริงที่จะเกิดตอน go-live)

### 🔴 บั๊กร้ายแรง — `GET`/`PUT /api/kpis` พังทั้งเส้นถ้ายังไม่มีตาราง `kpi_work_groups`
- **`GET /api/kpis`:** `attachWorkGroups()` โยน error เมื่อตารางไม่มี แต่ error ถูก catch ผิดที่ (block ที่ตั้งใจไว้จับปัญหา column `evaluation_direction` เท่านั้น) → retry ซ้ำ → throw รอบสองไม่มีอะไรจับ → **500 ทั้งเส้น**
- **ผลจริงในเบราว์เซอร์:** `/dashboard` ขึ้น **"⚠️ Error: โหลด KPI ไม่สำเร็จ"** รายการ KPI (0) ทั้ง Scorecard ว่างเปล่า — ยืนยัน **ทั้งแอปใช้ไม่ได้** (`/dashboard`, `/kpi`, `/admin` พึ่ง endpoint นี้เหมือนกันหมด)
- **`PUT /api/kpis/[id]`:** sync `kpi_work_groups` อยู่ในทรานแซกชันเดียวกับ UPDATE หลัก → sync fail → **rollback ทั้งก้อน** → แก้ไข KPI (ชื่อ/เจ้าของ/กำหนดเสร็จ) ไม่ได้เลยแม้แต่ตัวเดียว เพราะฟอร์มส่ง `workGroups:[]` ติดมาด้วยเสมอแม้ไม่ได้ติ๊กอะไร — verify ด้วย curl พิสูจน์ว่าชื่อ KPI ไม่เปลี่ยนเลยตอนพัง
- **เมื่อไหร่ถึงเจอจริง:** ถ้า production deploy โค้ดนี้ก่อนรัน `/api/init` รอบใหม่ (ลำดับผิดพลาดตอน go-live) — โอกาสเกิดจริงไม่ต่ำ เพราะเป็นขั้นตอนที่ต้องจำทำเอง

**แก้:** ทั้ง `GET`/`PUT` แยก try เฉพาะส่วน work-groups ออกจากส่วนหลัก — `GET` fallback เป็น `workGroups:[]` ต่อแถวถ้า query ล้มเหลว, `PUT` แยก try ของ sync ออกจาก UPDATE (commit field หลักได้เสมอ พร้อมข้อความเตือนบอกสถานะจริงถ้ากลุ่มงาน sync ไม่สำเร็จ) — commit `d88193e`

**Verify หลังแก้:** จำลอง DB เดิม (ไม่มี `kpi_work_groups`) → `GET` 200 (`workGroups:[]`) ✅ · `PUT` 200 + field หลักบันทึกจริง (ทดสอบด้วยชื่อ ASCII กัน encoding ปัญหาจาก shell) ✅ · dashboard โหลดปกติไม่มี error banner ✅ · regression check `dhdc_dev` (มีตารางครบ) ยังทำงาน 100% ไม่กระทบ ✅

### จุดที่ตรวจแล้วไม่มีปัญหา (คู่ขนานกับจุดที่พัง)
- `WorkGroupManager.tsx` / `WorkGroupPicker.tsx` — ถ้า `/api/work-groups` fail (เช่น ตาราง `work_groups` หาย) ฝั่ง frontend **ทนอยู่แล้ว** (`res.ok ? ... : []`) ไม่ทำให้หน้าอื่นพังตาม เพราะ fetch แยกอิสระในแต่ละ component ไม่ผูกกับ `loadData()` หลักของหน้า — ไม่ต้องแก้เพิ่ม

### สรุป bug sweep (สิ่งที่ตรวจแล้วไม่พบปัญหา)
- Middleware role-guard: ครบทุก 23 API routes เทียบกับ 3 guard list (`PUBLIC_API`/`ADMIN_ALL`/`ADMIN_MUTATE`) — ไม่มีช่องโหว่
- FK cascade (`kpi_work_groups`, `users.department`→Phase E): ทดสอบจริงแล้วใน §10
- `/api/categories` DELETE guard: ยังทำงานถูกต้อง ไม่ถูกกระทบจาก Phase A/B
- Drilldown/read-only API routes (anemia, aged9, screen-risk, vaccines, ageing, colon-fit, detail): ไม่ต้อง admin gate ถูกต้องตามดีไซน์ (อ่านอย่างเดียว)
- `/api/targets`, `/api/monthly/detail`: ไม่อยู่ใน ADMIN_MUTATE ตามดีไซน์ตั้งใจ (self-service staff / manual entry admin-only ตามที่ CLAUDE.md ระบุ) — ไม่ใช่บั๊ก

### ❓ ตัดสินใจ
- เอา schema ตามนี้ไหม?
- ให้เริ่ม **Phase A→C เลย** หรือ **รอ §3 ครบก่อน**?
