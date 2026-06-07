# Note สำหรับย้ายระบบ KPI กลับเครื่องหลัก

## 1. สถานะระบบ Local Dev ปัจจุบัน

ระบบบนเครื่อง Local Dev ทำงานปกติแล้ว

* Project Path: `D:\DHDC-KPI-DEV`
* Run Command: `npm run dev`
* URL: `http://localhost:3002`
* Database Host: `127.0.0.1`
* Database Name: `dhdc_dev`
* Database User: `root`
* Login Test: ผ่านแล้ว
* Login API: `POST /api/auth/login` ได้ HTTP 200

Dashboard/API ที่ทดสอบแล้ว:

* `/dashboard`
* `/api/kpis`
* `/api/monthly`
* `/api/categories`

---

## 2. สาเหตุปัญหาที่แก้แล้ว

ปัญหาเดิมคือระบบ Local Dev login ไม่ได้ และขึ้น error:

```text
connect ETIMEDOUT
POST /api/auth/login 500
```

สาเหตุคือไฟล์:

```text
lib/db.ts
```

ยังชี้ไปฐานข้อมูลเครื่องหลัก:

```text
host: 192.168.0.236
user: dong
database: dhdc
```

ทำให้เครื่อง Local Dev พยายามต่อฐานข้อมูลเครื่องหลัก และเกิด timeout

แก้ไขแล้วโดยเปลี่ยนให้ Local Dev ใช้ฐานข้อมูลในเครื่องตัวเอง:

```text
host: 127.0.0.1
user: root
database: dhdc_dev
```

---

## 3. ค่าที่ต้องจำ

### Local Dev

```text
host: 127.0.0.1
database: dhdc_dev
run: npm run dev
port: 3002
```

### เครื่องหลักเดิม

```text
host: 192.168.0.236
database: dhdc
user: dong
run: npm run dev
port: ตรวจสอบจากระบบเดิมก่อน deploy
```

หมายเหตุ: ห้ามบันทึก password production จริงในเอกสารนี้

---

## 4. ก่อนย้ายกลับเครื่องหลัก ต้อง Backup ก่อน

ก่อนเอาระบบกลับไปลงเครื่องหลัก ต้อง Backup อย่างน้อย 2 อย่าง

### 4.1 Backup Source Code เครื่องหลักเดิม

เก็บโฟลเดอร์ระบบเดิมไว้ก่อน เช่น:

```text
D:\backup\DHDC_old_before_update
```

ห้ามลบ source code เดิมจนกว่าจะทดสอบระบบใหม่ผ่านแล้ว

### 4.2 Backup Database เครื่องหลัก

Backup ฐานข้อมูล `dhdc` ก่อนทุกครั้ง

ตัวอย่างคำสั่ง:

```powershell
mysqldump -h 192.168.0.236 -u dong -p dhdc > backup_dhdc_before_update.sql
```

หลัง backup เสร็จ ควรตรวจว่าไฟล์ `.sql` ถูกสร้างจริงและมีขนาดไฟล์มากกว่า 0 KB

---

## 5. ก่อน Copy ระบบใหม่กลับเครื่องหลัก

ตรวจไฟล์นี้ก่อนเสมอ:

```text
lib/db.ts
```

ตอนอยู่ Local Dev ต้องเป็น:

```text
host: 127.0.0.1
database: dhdc_dev
```

แต่ตอนเอากลับเครื่องหลัก ต้องเปลี่ยนเป็น:

```text
host: 192.168.0.236
user: dong
database: dhdc
```

ห้ามเอา config local นี้ไปใช้บนเครื่องหลัก:

```text
host: 127.0.0.1
database: dhdc_dev
```

ถ้าเอา config local ไปลงเครื่องหลัก ระบบจริงอาจไม่เจอฐานข้อมูลจริง หรือไปใช้ฐานข้อมูลผิดตัว

---

## 6. ขั้นตอนย้ายกลับเครื่องหลักแบบปลอดภัย

1. แจ้งผู้ใช้หยุดใช้งานระบบชั่วคราว
2. หยุดระบบเดิมที่เครื่องหลัก
3. Backup source code เดิม
4. Backup database `dhdc`
5. Copy source code ใหม่ไปเครื่องหลัก
6. ห้าม copy โฟลเดอร์เหล่านี้ถ้าไม่จำเป็น:

   * `node_modules`
   * `.next`
7. ตรวจ `lib/db.ts` ให้ชี้ Production DB:

   * host: `192.168.0.236`
   * database: `dhdc`
   * user: `dong`
8. ตรวจว่าเครื่องหลักต่อ DB ได้:

```powershell
mysql -h 192.168.0.236 -u dong -p dhdc
```

แล้วรัน:

```sql
SHOW TABLES;
SELECT COUNT(*) FROM users;
```

9. ติดตั้ง package ถ้าจำเป็น:

```powershell
npm install
```

10. รันระบบแบบเดิมก่อน เพราะเครื่องหลักเดิมใช้ dev mode:

```powershell
npm run dev
```

11. ทดสอบ Login
12. ทดสอบ Dashboard
13. ทดสอบ Admin
14. ทดสอบ API หลัก:

* `/api/auth/login`
* `/api/kpis`
* `/api/monthly`
* `/api/categories`

---

## 7. ข้อห้ามตอนย้ายกลับเครื่องหลัก

ห้ามทำสิ่งต่อไปนี้ถ้ายังไม่ได้ Backup:

```text
Migrate & Seed
Drop Table
Truncate Table
Delete ข้อมูล
แก้ schema database
Restore SQL ทับ production
```

ห้ามใช้ฐาน local บนเครื่องหลัก:

```text
dhdc_dev
```

ห้าม commit password production จริงลง Git

---

## 8. Rollback Plan ถ้าระบบใหม่มีปัญหา

ถ้าหลังย้ายกลับแล้วระบบพัง ให้ทำตามนี้:

1. หยุดระบบใหม่
2. เอา source code เดิมที่ backup ไว้กลับมา
3. ถ้าข้อมูลใน DB ถูกกระทบ ให้ restore database backup
4. รันระบบเดิมกลับด้วยคำสั่งเดิม:

```powershell
npm run dev
```

5. ทดสอบ Login
6. ทดสอบ Dashboard
7. แจ้งผู้ใช้ว่าระบบกลับมาใช้งานเวอร์ชันเดิมแล้ว

---

## 9. สิ่งที่ควรปรับในอนาคต

ตอนนี้ระบบยังใช้การตั้งค่า DB ใน `lib/db.ts` โดยตรง

ระยะถัดไปควรปรับให้ใช้ `.env` เพื่อแยก Local กับ Production เช่น:

```text
.env.local
.env.production
```

ข้อดีคือไม่ต้องแก้ `lib/db.ts` กลับไปกลับมา และลดความเสี่ยงเอา DB ผิดตัวไปใช้งานจริง

---

## 10. สรุปสั้น ๆ

ตอนพัฒนา:

```text
ใช้ 127.0.0.1 / dhdc_dev
```

ตอนย้ายกลับเครื่องหลัก:

```text
ใช้ 192.168.0.236 / dhdc
```

ก่อนย้ายกลับ:

```text
Backup ก่อนเสมอ
ตรวจ lib/db.ts ก่อนเสมอ
ห้าม Migrate & Seed บน production
```
