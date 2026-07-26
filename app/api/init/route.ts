import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { INITIAL_USERS, INITIAL_KPIS, INITIAL_MONTHLY_DATA, INITIAL_CATALOG } from '@/lib/initialData'
import { hashPassword } from '@/lib/password'
import { COOKIE_NAME, verifySession } from '@/lib/auth'

/** มี user ในระบบแล้วหรือยัง — ถ้ายัง = ยัง bootstrap ไม่เสร็จ (เปิดให้รัน init ได้) */
async function hasExistingUsers(): Promise<boolean> {
  try {
    const conn = await pool.getConnection()
    try {
      const [rows] = await conn.execute('SELECT COUNT(*) AS c FROM users')
      return (rows as { c: number }[])[0].c > 0
    } finally {
      conn.release()
    }
  } catch {
    return false // ตาราง users ยังไม่มี → ถือว่ายังไม่ bootstrap
  }
}

export async function POST(req: NextRequest) {
  // /api/init เป็น public (bootstrap DB ใหม่ที่ยังไม่มี user ให้ login)
  // แต่ถ้า bootstrap เสร็จแล้ว (มี user) → ต้องเป็น admin เท่านั้นจึงจะ re-run ได้ (กันคนนอกยิงซ้ำ)
  if (await hasExistingUsers()) {
    const token = req.cookies.get(COOKIE_NAME)?.value
    const session = token ? await verifySession(token) : null
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { ok: false, message: 'ระบบถูกตั้งค่าแล้ว — ต้องเป็นผู้ดูแลระบบ (admin) จึงจะรัน init ซ้ำได้' },
        { status: 403 },
      )
    }
  }

  const conn = await pool.getConnection()
  try {
    // ── categories (หมวดย่อย + กลุ่มหลัก ตามโครง HDC — docs/kpi-category-mapping-2569.md) ──
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        group_name VARCHAR(100) NULL,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    // migrate DB เดิมที่สร้างก่อนมี group_name (idempotent)
    await conn
      .execute('ALTER TABLE categories ADD COLUMN IF NOT EXISTS group_name VARCHAR(100) NULL AFTER name')
      .catch(() => {})

    // Seed หมวดหมู่เริ่มต้น [หมวดย่อย, กลุ่มหลัก] — ชื่อทางการจาก breadcrumb HDC
    const DEFAULT_CATEGORIES: [string, string][] = [
      ['การคัดกรอง', 'ส่งเสริมป้องกัน'],
      ['อนามัยแม่และเด็ก', 'ส่งเสริมป้องกัน'],
      ['สร้างเสริมภูมิคุ้มกัน', 'ส่งเสริมป้องกัน'],
      ['งานโภชนาการ', 'ส่งเสริมป้องกัน'],
      ['ข้อมูลเพื่อตอบสนอง Service Plan สาขาโรคไม่ติดต่อ (NCD DM,HT,CVD)', 'ข้อมูลตอบสนอง Service Plan'],
      ['ข้อมูลเพื่อตอบสนอง Service Plan สาขามะเร็ง', 'ข้อมูลตอบสนอง Service Plan'],
      ['การใช้บริการสาธารณสุข', 'การเข้าถึงบริการ'],
    ]
    for (const [name, groupName] of DEFAULT_CATEGORIES) {
      await conn.execute('INSERT IGNORE INTO categories (name, group_name) VALUES (?, ?)', [name, groupName])
    }

    // ── work_groups (กลุ่มงานใน รพ. — docs/kpi-work-groups-plan.md) ─────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS work_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_wg_name (name)
      ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    const DEFAULT_WORK_GROUPS = [
      'องค์กรแพทย์', 'แพทย์แผนไทย', 'เภสัชกรรม', 'เทคนิคการแพทย์', 'รังสีการแพทย์',
      'OPD', 'IPD', 'ER', 'ปฐมภูมิ', 'ประกันสุขภาพ', 'ทันตกรรม', 'บริหารทั่วไป', 'สุขภาพดิจิทัล',
      'กายภาพบำบัด', // กลุ่มที่ 14 — เพิ่ม 2026-07-23 (ตัวชี้วัดตรวจราชการ: น.ส.โสรญา น้อยเจริญ) docs/kpi-sets-plan.md §10.5
    ]
    for (let i = 0; i < DEFAULT_WORK_GROUPS.length; i++) {
      await conn.execute(
        'INSERT IGNORE INTO work_groups (name, sort_order) VALUES (?, ?)',
        [DEFAULT_WORK_GROUPS[i], i + 1],
      )
    }

    // ── users (department ผูก FK → work_groups.name — docs/kpi-work-groups-plan.md Phase E) ──
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role ENUM('admin','staff') DEFAULT 'staff',
        title ENUM('นาย','นาง','นางสาว') NULL,
        department VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_users_wg FOREIGN KEY (department) REFERENCES work_groups(name)
          ON UPDATE CASCADE ON DELETE SET NULL
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    // migrate DB เดิมที่สร้าง users ก่อนมี FK นี้ (idempotent — เงียบถ้ามี constraint แล้ว
    // หรือค่า department เดิมไม่ตรงกับ work_groups.name สักตัว ต้อง remap มือก่อนค่อยรันซ้ำ)
    await conn.execute('ALTER TABLE users MODIFY COLUMN department VARCHAR(100) NULL').catch(() => {})
    await conn.execute(
      `ALTER TABLE users ADD CONSTRAINT fk_users_wg FOREIGN KEY (department) REFERENCES work_groups(name)
         ON UPDATE CASCADE ON DELETE SET NULL`,
    ).catch(() => {})
    // migrate DB เดิมที่สร้าง users ก่อนมีคอลัมน์ title (idempotent)
    await conn.execute(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS title ENUM('นาย','นาง','นางสาว') NULL AFTER role`,
    ).catch(() => {})

    // ── kpi_reports ─────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS kpi_reports (
        id VARCHAR(50) PRIMARY KEY,
        name TEXT NOT NULL,
        category VARCHAR(100) NOT NULL,
        moph_url TEXT,
        moph_table VARCHAR(100),
        moph_value_field VARCHAR(100),
        moph_target_field VARCHAR(100),
        moph_calc_mode VARCHAR(20) DEFAULT 'percent',
        moph_report_id VARCHAR(64),
        evaluation_direction VARCHAR(10) DEFAULT 'gte',
        manual_entry TINYINT(1) DEFAULT 0,
        manual_scope VARCHAR(10) NOT NULL DEFAULT 'unit',
        data_source VARCHAR(50) NOT NULL DEFAULT 'HDC',
        measure_type VARCHAR(10) NOT NULL DEFAULT 'numeric',
        text_options TEXT NULL,
        owner VARCHAR(255) NOT NULL,
        deadline DATE NOT NULL,
        status ENUM('completed','in_progress','overdue') DEFAULT 'in_progress',
        target DECIMAL(10,2) NOT NULL,
        unit VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)

    // safe ALTER for existing DBs
    const alterCols = [
      "ALTER TABLE kpi_reports ADD COLUMN IF NOT EXISTS moph_table VARCHAR(100)",
      "ALTER TABLE kpi_reports ADD COLUMN IF NOT EXISTS moph_value_field VARCHAR(100)",
      "ALTER TABLE kpi_reports ADD COLUMN IF NOT EXISTS moph_target_field VARCHAR(100)",
      "ALTER TABLE kpi_reports ADD COLUMN IF NOT EXISTS moph_calc_mode VARCHAR(20) DEFAULT 'percent'",
      "ALTER TABLE kpi_reports ADD COLUMN IF NOT EXISTS moph_report_id VARCHAR(64)",
      "ALTER TABLE kpi_reports ADD COLUMN IF NOT EXISTS evaluation_direction VARCHAR(10) DEFAULT 'gte'",
      "ALTER TABLE kpi_reports ADD COLUMN IF NOT EXISTS manual_entry TINYINT(1) DEFAULT 0",
      "ALTER TABLE kpi_reports ADD COLUMN IF NOT EXISTS manual_scope VARCHAR(10) NOT NULL DEFAULT 'unit'",
      "ALTER TABLE kpi_reports ADD COLUMN IF NOT EXISTS data_source VARCHAR(50) NOT NULL DEFAULT 'HDC'",
      "ALTER TABLE kpi_reports ADD COLUMN IF NOT EXISTS measure_type VARCHAR(10) NOT NULL DEFAULT 'numeric'",
      "ALTER TABLE kpi_reports ADD COLUMN IF NOT EXISTS text_options TEXT NULL",
      "ALTER TABLE monthly_data ADD COLUMN IF NOT EXISTS source VARCHAR(10) DEFAULT 'auto'",
      "ALTER TABLE monthly_data ADD COLUMN IF NOT EXISTS entered_by VARCHAR(255) DEFAULT NULL",
      "ALTER TABLE monthly_data ADD COLUMN IF NOT EXISTS entered_at TIMESTAMP NULL DEFAULT NULL",
      "ALTER TABLE monthly_data ADD COLUMN IF NOT EXISTS value_text VARCHAR(255) NULL",
    ]
    for (const sql of alterCols) {
      await conn.execute(sql).catch(() => {})
    }

    // ── kpi_work_groups (junction: 1 KPI ↔ หลายกลุ่มงาน) ─────────────────────
    // ต้องสร้างหลัง kpi_reports + work_groups เพราะมี FK ผูกทั้งสองตาราง
    // FK อ้าง work_groups.name (ไม่ใช่ id) + ON UPDATE CASCADE → เปลี่ยนชื่อกลุ่มงานแล้วข้อมูลตามเอง
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS kpi_work_groups (
        kpi_id VARCHAR(50) NOT NULL,
        work_group VARCHAR(100) NOT NULL,
        PRIMARY KEY (kpi_id, work_group),
        KEY idx_kwg_group (work_group),
        CONSTRAINT fk_kwg_kpi FOREIGN KEY (kpi_id) REFERENCES kpi_reports(id) ON DELETE CASCADE,
        CONSTRAINT fk_kwg_group FOREIGN KEY (work_group) REFERENCES work_groups(name)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)

    // ── kpi_sets + kpi_set_items (แกน "ชุด/ประเภทตัวชี้วัด" — docs/kpi-sets-plan.md K1) ──
    // แกนที่ 3 (ต่างจากหมวดหมู่ HDC=เรื่องอะไร / กลุ่มงาน=ใครทำ) — ชุด = "ส่งใคร/พันธะไหน"
    // FK อ้าง id (ไม่ใช่ name เหมือน kpi_work_groups) เพราะไม่มี auth ผูก + ต้องมี slug สำหรับ URL อยู่แล้ว
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS kpi_sets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        slug VARCHAR(50) NOT NULL,
        fiscal_year VARCHAR(10) NULL,
        description TEXT NULL,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_set_name (name),
        UNIQUE KEY uk_set_slug (slug)
      ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    // junction: 1 KPI ↔ หลายชุด · set_code = เลขข้อในชุดนั้น (ของความสัมพันธ์ ไม่ใช่ของ KPI)
    // ต้องสร้างหลัง kpi_reports + kpi_sets เพราะ FK ผูกทั้งสอง
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS kpi_set_items (
        kpi_id VARCHAR(50) NOT NULL,
        set_id INT NOT NULL,
        set_code VARCHAR(20) NULL,
        target_region VARCHAR(100) NULL,
        target_province VARCHAR(100) NULL,
        target_hospital VARCHAR(100) NULL,
        sort_order INT DEFAULT 0,
        PRIMARY KEY (kpi_id, set_id),
        KEY idx_ksi_set (set_id),
        CONSTRAINT fk_ksi_kpi FOREIGN KEY (kpi_id) REFERENCES kpi_reports(id) ON DELETE CASCADE,
        CONSTRAINT fk_ksi_set FOREIGN KEY (set_id) REFERENCES kpi_sets(id) ON DELETE CASCADE
      ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    // L3: เป้า 3 ระดับต่อ (kpi,set) — migrate DB เดิมที่สร้างก่อน L3 (idempotent)
    await conn.execute('ALTER TABLE kpi_set_items ADD COLUMN IF NOT EXISTS target_region VARCHAR(100) NULL AFTER set_code').catch(() => {})
    await conn.execute('ALTER TABLE kpi_set_items ADD COLUMN IF NOT EXISTS target_province VARCHAR(100) NULL AFTER target_region').catch(() => {})
    await conn.execute('ALTER TABLE kpi_set_items ADD COLUMN IF NOT EXISTS target_hospital VARCHAR(100) NULL AFTER target_province').catch(() => {})
    // seed 5 ชุดเริ่มต้น [name, slug, fiscal_year] — ตรวจราชการ/Ranking ผูกปีงบ, ที่เหลือใช้ยาว (NULL)
    const DEFAULT_KPI_SETS: [string, string, string | null][] = [
      ['ตัวชี้วัดตรวจราชการ เขต 3', 'inspection-r3', '2569'],
      ['ตัวชี้วัดงานคุณภาพ (HA)', 'ha', null],
      ['ตัวชี้วัดร่วม อบจ.', 'pao', null],
      ['ตัวชี้วัดจังหวัด (Ranking)', 'ranking', '2569'],
      ['ตัวชี้วัด Smart Hospital', 'smart-hospital', null],
    ]
    for (let i = 0; i < DEFAULT_KPI_SETS.length; i++) {
      const [name, slug, fy] = DEFAULT_KPI_SETS[i]
      await conn.execute(
        'INSERT IGNORE INTO kpi_sets (name, slug, fiscal_year, sort_order) VALUES (?, ?, ?, ?)',
        [name, slug, fy, i + 1],
      )
    }

    // ── monthly_data ────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS monthly_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kpi_id VARCHAR(50) NOT NULL,
        month VARCHAR(7) NOT NULL,
        value DECIMAL(10,2) NOT NULL,
        target DECIMAL(10,2) NOT NULL,
        source VARCHAR(10) DEFAULT 'auto',
        entered_by VARCHAR(255) DEFAULT NULL,
        entered_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_kpi_month (kpi_id, month),
        FOREIGN KEY (kpi_id) REFERENCES kpi_reports(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)

    // ── kpi_targets (Phase 7A: เป้าหมายรายปีงบประมาณ + audit) ───────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS kpi_targets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kpi_id VARCHAR(50) NOT NULL,
        fiscal_year VARCHAR(10) NOT NULL,
        target DECIMAL(10,2) NOT NULL,
        source VARCHAR(255) DEFAULT NULL,
        confirmed_by VARCHAR(255) DEFAULT NULL,
        confirmed_at VARCHAR(20) DEFAULT NULL,
        note TEXT DEFAULT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_kpi_year (kpi_id, fiscal_year),
        FOREIGN KEY (kpi_id) REFERENCES kpi_reports(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)

    // ── moph_monthly_detail (Phase 4.8: detail snapshot ราย hospcode) ───────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS moph_monthly_detail (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kpi_id VARCHAR(50) NOT NULL,
        month VARCHAR(7) NOT NULL,
        hospcode VARCHAR(20) NOT NULL,
        areacode VARCHAR(20) DEFAULT '',
        data TEXT NOT NULL,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_detail (kpi_id, month, hospcode, areacode),
        FOREIGN KEY (kpi_id) REFERENCES kpi_reports(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)

    // ── data_change_log (audit การลบ/ทับค่ารายเดือน — เก็บค่าเก่าไว้กู้คืน) ───
    // ไม่ผูก FK cascade: ต้องเก็บ log ไว้แม้ KPI ถูกลบทิ้ง (ตามรอยย้อนหลังได้)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS data_change_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kpi_id VARCHAR(50) NOT NULL,
        month VARCHAR(7) NOT NULL,
        action VARCHAR(16) NOT NULL,
        old_data TEXT NOT NULL,
        changed_by VARCHAR(255) DEFAULT NULL,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_kpi_month (kpi_id, month)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)

    // ── cron_log (ประวัติการรัน full-batch — cron อัตโนมัติ / กดดึงทั้งหมด) ───
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS cron_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        trigger_by VARCHAR(16) NOT NULL,
        saved_month VARCHAR(7),
        total INT DEFAULT 0,
        saved INT DEFAULT 0,
        skipped INT DEFAULT 0,
        failed INT DEFAULT 0,
        KEY idx_run_at (run_at)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)

    // ── moph_report_catalog ─────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS moph_report_catalog (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        moph_table VARCHAR(100) NOT NULL,
        value_field VARCHAR(100) DEFAULT 'result',
        target_field VARCHAR(100) DEFAULT 'target',
        calc_mode VARCHAR(20) DEFAULT 'percent',
        category VARCHAR(100),
        province VARCHAR(10) DEFAULT '66',
        hospcode VARCHAR(20) DEFAULT '',
        areacode VARCHAR(20) DEFAULT '',
        description TEXT,
        active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    // safe alter for existing tables
    await conn.execute(
      "ALTER TABLE moph_report_catalog ADD COLUMN IF NOT EXISTS areacode VARCHAR(20) DEFAULT ''"
    ).catch(() => {})

    // ── moph_snapshot ────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS moph_snapshot (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_id VARCHAR(64) NOT NULL,
        year VARCHAR(10) NOT NULL,
        month VARCHAR(7) NOT NULL,
        province VARCHAR(10) NOT NULL,
        hospcode VARCHAR(20) DEFAULT '',
        rows_count INT DEFAULT 0,
        sum_value DECIMAL(12,4) DEFAULT 0,
        sum_target DECIMAL(12,4) DEFAULT 0,
        calc_value DECIMAL(10,2) DEFAULT 0,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_snapshot (report_id, year, month, province, hospcode)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)

    // ── Seed users (hash รหัสผ่านก่อนเก็บ — INSERT IGNORE จึงไม่ทับ/ไม่ re-hash ของเดิม) ──
    for (const u of INITIAL_USERS) {
      await conn.execute(
        `INSERT IGNORE INTO users (id, email, password, name, role, department) VALUES (?,?,?,?,?,?)`,
        [u.id, u.email, await hashPassword(u.password), u.name, u.role, u.department],
      )
    }

    // ── Seed KPIs ────────────────────────────────────────────────────────────
    for (const k of INITIAL_KPIS) {
      await conn.execute(
        `INSERT INTO kpi_reports
           (id, name, category, moph_url, moph_table, moph_value_field, moph_target_field, moph_calc_mode,
            moph_report_id, owner, deadline, status, target, unit, description)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           moph_table        = VALUES(moph_table),
           moph_value_field  = VALUES(moph_value_field),
           moph_target_field = VALUES(moph_target_field),
           moph_calc_mode    = VALUES(moph_calc_mode),
           moph_report_id    = VALUES(moph_report_id)`,
        [k.id, k.name, k.category,
         k.mophUrl ?? null, k.mophTable ?? null, k.mophValueField ?? null,
         k.mophTargetField ?? null, k.mophCalcMode ?? null,
         (k as { mophReportId?: string }).mophReportId ?? null,
         k.owner, k.deadline, k.status, k.target, k.unit, k.description ?? null],
      )
    }

    // ── Seed monthly data ────────────────────────────────────────────────────
    for (const m of INITIAL_MONTHLY_DATA) {
      await conn.execute(
        `INSERT IGNORE INTO monthly_data (kpi_id, month, value, target) VALUES (?,?,?,?)`,
        [m.kpiId, m.month, m.value, m.target],
      )
    }

    // ── Seed Report Catalog ──────────────────────────────────────────────────
    for (const c of INITIAL_CATALOG) {
      await conn.execute(
        `INSERT INTO moph_report_catalog
           (id, name, moph_table, value_field, target_field, calc_mode,
            category, province, hospcode, areacode, description)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           name         = VALUES(name),
           moph_table   = VALUES(moph_table),
           value_field  = VALUES(value_field),
           target_field = VALUES(target_field),
           calc_mode    = VALUES(calc_mode),
           category     = VALUES(category),
           hospcode     = VALUES(hospcode),
           areacode     = VALUES(areacode),
           description  = VALUES(description)`,
        [c.id, c.name, c.mophTable, c.valueField, c.targetField, c.calcMode,
         c.category, c.province ?? '66', c.hospcode ?? '', c.areacode ?? '', c.description ?? null],
      )
    }

    return NextResponse.json({ ok: true, message: 'Database initialized successfully' })
  } catch (err) {
    console.error('Init error:', err)
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function GET() {
  const conn = await pool.getConnection()
  try {
    const [users]    = await conn.execute('SELECT COUNT(*) as count FROM users')
    const [kpis]     = await conn.execute('SELECT COUNT(*) as count FROM kpi_reports')
    const [monthly]  = await conn.execute('SELECT COUNT(*) as count FROM monthly_data')
    const [catalog]  = await conn.execute('SELECT COUNT(*) as count FROM moph_report_catalog')
    const [snapshot] = await conn.execute('SELECT COUNT(*) as count FROM moph_snapshot')
    return NextResponse.json({
      ok: true,
      counts: {
        users:    (users    as { count: number }[])[0].count,
        kpis:     (kpis     as { count: number }[])[0].count,
        monthly:  (monthly  as { count: number }[])[0].count,
        catalog:  (catalog  as { count: number }[])[0].count,
        snapshot: (snapshot as { count: number }[])[0].count,
      },
    })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
