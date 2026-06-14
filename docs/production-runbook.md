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

## Cron (แนวทาง A — in-process)

ระบบมี node-cron ในตัว (lib/scheduler.ts) รันทุกวัน 07:00 scope 6611 — **ทำงานเฉพาะตอน Next.js server เปิดอยู่**

production ต้องรัน server แบบถาวร:
```
npm run build && npm start      # next start -p 3002
```
ใช้ process manager ให้ restart อัตโนมัติ + รันตอน boot:
- Windows: pm2 (`pm2 start npm --name dhdc -- start`) + `pm2 startup` หรือ NSSM (ติดตั้งเป็น Windows Service)

ตรวจว่า cron ลงทะเบียน: ดู log `[cron] ตั้งเวลา MOPH auto-batch แล้ว: "0 7 * * *"`

> ถ้าเครื่องไม่ได้เปิดตลอด/restart บ่อย → พิจารณาแนวทาง B (Windows Task Scheduler ยิง /api/moph/batch) ภายหลัง โดยตั้ง `MOPH_CRON_DISABLED=1` กันซ้ำ

---

## Rollback
- config: PATCH moph_config=null + restore unit/dir/table จาก snapshot (ดู Apply Log)
- ทุกขั้น snapshot ก่อนเสมอ · ห้าม SQL update monthly_data.value ตรง
