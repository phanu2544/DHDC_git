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
    // ── categories ─────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    // Seed หมวดหมู่เริ่มต้น
    const DEFAULT_CATEGORIES = ['NCD', 'แม่และเด็ก', 'โรคติดต่อ', 'ผู้สูงอายุ', 'สุขภาพจิต', 'อื่นๆ']
    for (const cat of DEFAULT_CATEGORIES) {
      await conn.execute('INSERT IGNORE INTO categories (name) VALUES (?)', [cat])
    }

    // ── users ──────────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role ENUM('admin','staff') DEFAULT 'staff',
        department VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)

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
    ]
    for (const sql of alterCols) {
      await conn.execute(sql).catch(() => {})
    }

    // ── monthly_data ────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS monthly_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kpi_id VARCHAR(50) NOT NULL,
        month VARCHAR(7) NOT NULL,
        value DECIMAL(10,2) NOT NULL,
        target DECIMAL(10,2) NOT NULL,
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
