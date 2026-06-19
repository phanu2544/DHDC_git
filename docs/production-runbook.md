# DHDC KPI — Production Runbook (dev → production)

> ทุก config/การแก้ mapping ทำบน **dhdc_dev** เท่านั้น · production DB (192.168.0.236 / dhdc) ยังไม่มี
> เอกสารนี้คือขั้นตอน go-live · **ต้องมี owner sign-off ก่อนแตะ production DB**

---

## 1. ตั้ง environment (ไม่ commit ค่าจริง)

คัดลอก `.env.example` → `.env.local` (ถูก gitignore) แล้วใส่ค่าจริงบนเครื่อง production:

```
DB_HOST=192.168.0.236
DB_PORT=3306
DB_USER=<prod user>
DB_PASSWORD=<prod password>
DB_NAME=dhdc
NEXT_PUBLIC_DB_LABEL=production
```

> ถ้าไม่ตั้ง env ระบบ default = local dev (dhdc_dev) อัตโนมัติ — เครื่อง dev จึงไม่ต้องทำอะไร
> `lib/db.ts` อ่านจาก env เท่านั้น ไม่มีค่า production hardcode

ตรวจ: เปิดหน้า login ต้องเห็น "MariaDB: production" (ถ้ายัง "local dev" = env ไม่ถูกโหลด)

## 2. สร้างตาราง/คอลัมน์บน production

```
POST /api/init    (บน production)
```
- CREATE TABLE IF NOT EXISTS: kpi_reports, monthly_data, kpi_targets, moph_monthly_detail, moph_snapshot, ฯลฯ
- ALTER ADD COLUMN IF NOT EXISTS: evaluation_direction
- ปลอดภัย: ไม่ทับ/ลบของเดิม · seed เฉพาะ INSERT IGNORE/ON DUPLICATE

## 3. Replay config (ใช้ runbook เดิมที่ทำบน dev — snapshot→preview→gate→COMMIT→verify)

⚠️ **owner sign-off ก่อน:** โลหิตจาง (result/target), NCD BP (a1/b1) — ดู `docs/owner-packet-kpi-2569.md` หมวด 3

| KPI | การแก้ |
|-----|--------|
| telemed | config sum/result, unit=ครั้ง, dir=none |
| โลหิตจาง | table→s_child_hct, result/target, dir=lte, target=20 |
| NCD BP | config a1/b1 |
| TEDA4I 0-5/9-60 | config 1b270+1b271..275+1b27x+stimulate / target |
| มะเร็งปากมดลูก | config sum/result, unit=ราย, dir=none |
| DM รายใหม่ | dir=none |
| Healthy Ageing | config sumFields result1q1+result1q2 / targetq1+targetq2 |

วิธีปลอดภัย: PATCH /api/kpis/[id] (config) + SQL UPDATE (unit/dir/table) แบบ transaction + ROW_COUNT gate

## 4. ตั้ง target ปีงบ

ทางเลือก:
- (ก) owner กรอกผ่าน `/admin/targets` บน production โดยตรง
- (ข) export `kpi_targets` จาก dev → import เข้า prod (ถ้าต้องการ migrate ค่าที่ตั้งไว้)

## 5. Batch เก็บข้อมูล (scope ดงเจริญ)

```
POST /api/moph/batch  body: { year:'2569', province:'66', areacode:'6611', month:'<YYYY-MM>' }
```
verify distribution บน /dashboard ให้ตรงกับ dev

---

## Process manager — ให้ cron/snapshot รันถาวร (แนวทาง A — in-process)

ระบบมี node-cron ในตัว (lib/scheduler.ts) รันทุกวัน 07:00 scope 6611 — **ทำงานเฉพาะตอน Next.js server (next start) เปิดอยู่** · **ปมจริง:** dev/app + MariaDB หยุดเอง → ไม่มีประวัติรายเดือนสะสม (กราฟ trend ใช้ไม่ได้) → ต้องมี process manager ดูแล **2 ตัว: app + MariaDB**

### A1. App ผ่าน PM2 (มี `ecosystem.config.js` ให้แล้วใน repo)
```
npm install -g pm2                 # ครั้งแรก
npm run build                      # PM2 รัน next start = production build เท่านั้น (dev ไม่นับ)
pm2 start ecosystem.config.js      # ชื่อ process = dhdc-kpi (port 3002)
pm2 save                           # บันทึก process list
pm2 startup                        # ตั้งให้ PM2 ฟื้นเองตอน boot (ทำตามคำสั่งที่ขึ้นมา)
```
ดู log / สถานะ: `pm2 logs dhdc-kpi` · `pm2 status` · restart: `pm2 restart dhdc-kpi`

### A2. MariaDB service auto-start (ต้องสิทธิ์ admin/UAC — **user ทำเอง**)
service ชื่อ **`MariaDB`** (ห้ามแตะ service `MySQL` ของ BMS) — ตั้ง Automatic + auto-restart เมื่อ crash:
```
sc.exe config MariaDB start= auto                       # เริ่มอัตโนมัติตอน boot
sc.exe failure MariaDB reset= 86400 actions= restart/5000/restart/5000/restart/5000
```
(หรือ services.msc → MariaDB → Startup type = Automatic, แท็บ Recovery = Restart the Service)

### A3. ตรวจว่าทำงาน
- cron ลงทะเบียน: `pm2 logs dhdc-kpi` เห็น `[cron] ตั้งเวลา MOPH auto-batch แล้ว: "0 7 * * *"`
- หลังขึ้นเดือนใหม่ (เช่น 1 ก.ค.) cron รอบ 07:00 จะเพิ่มแถวเดือนใหม่ใน `monthly_data` → กราฟ trend มี ≥2 จุด
- ตรวจเร็ว: `SELECT month, COUNT(*) FROM monthly_data GROUP BY month;` ควรเห็นหลายเดือน

> **แนวทาง B (สำรอง):** ถ้าไม่อยากรัน server ถาวร → Windows Task Scheduler ยิง `POST /api/moph/batch` รายวันแทน + ตั้ง `MOPH_CRON_DISABLED=1` ใน `.env.local` กัน cron ซ้ำ

---

## Phase 8 — snapshot รายเดือน (drilldown)

หน้า drilldown (`/kpi/anemia`, `/kpi/aged9`, `/kpi/screen-risk`, `/kpi/vaccines`) อ่านจาก **`moph_monthly_detail`** (snapshot) เป็นหลัก แล้วมี fallback เป็น live ผ่าน `lib/monthlyView.getMonthlyRows` (DB ล่ม/ไม่มี snapshot → live เสมอ)

ผลต่อ production:
- **`moph_monthly_detail` กลายเป็น UI-critical** (ไม่ใช่แค่ analytics) → cron/batch ต้องเก็บ detail ต่อเนื่อง ไม่งั้น drilldown จะ fallback เป็น live ตลอด (ใช้ได้ แต่ไม่มีประวัติ/เดือนให้เลือก)
- **วัคซีน `s_epi2`**: field เป็นรายเดือน (`dtp4_10`…`target09`) — `lib/mophDetail.ts` มี `KEEP_MONTHLY_TABLES={s_epi2}` เก็บ field พวกนี้ไว้ (ตารางอื่นยังตัด field ลงท้าย 01-12 ตามเดิม) ถ้าเพิ่มกราฟใหม่ที่ใช้ field รายเดือน ต้องเพิ่มชื่อตารางใน set นี้
- **Re-sync** (เมื่อค่า Scorecard/snapshot ค้าง stale): รัน batch (หัวข้อ 5) ซ้ำ scope 6611 → เขียนทับ `monthly_data` + `moph_monthly_detail` เดือนปัจจุบันด้วยค่าสด · backup 2 ตารางก่อนเสมอ (`mysqldump dhdc_dev monthly_data moph_monthly_detail`)

## Rollback
- config: PATCH moph_config=null + restore unit/dir/table จาก snapshot (ดู Apply Log)
- data (re-sync/batch): restore จาก `mysqldump` backup ของ `monthly_data` + `moph_monthly_detail`
- ทุกขั้น snapshot ก่อนเสมอ · ห้าม SQL update monthly_data.value ตรง
