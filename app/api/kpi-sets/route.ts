import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { SLUG_RE } from '@/lib/kpiSets'

/**
 * /api/kpi-sets — แกน "ชุด/ประเภทตัวชี้วัด" (docs/kpi-sets-plan.md K2)
 * GET  = list (ทุกคนที่ login) · POST = create (admin — บังคับที่ middleware ADMIN_MUTATE)
 * ต่างจาก work-groups: ชุดมี slug (URL) + fiscal_year + description + แก้ไขได้ → มี [id]/route.ts (PUT/DELETE)
 */

type SetRow = {
  id: number
  name: string
  slug: string
  fiscal_year: string | null
  description: string | null
  sort_order: number
  item_count: number
}

// GET /api/kpi-sets → { id, name, slug, fiscalYear, description, sortOrder, itemCount }[]
export async function GET() {
  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.execute(
      `SELECT s.id, s.name, s.slug, s.fiscal_year, s.description, s.sort_order,
              COUNT(i.kpi_id) AS item_count
         FROM kpi_sets s
         LEFT JOIN kpi_set_items i ON i.set_id = s.id
         GROUP BY s.id, s.name, s.slug, s.fiscal_year, s.description, s.sort_order
         ORDER BY s.sort_order ASC, s.id ASC`,
    )
    return NextResponse.json(
      (rows as SetRow[]).map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        fiscalYear: r.fiscal_year,
        description: r.description,
        sortOrder: r.sort_order,
        itemCount: Number(r.item_count),
      })),
    )
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

// POST /api/kpi-sets  body: { name, slug, fiscalYear?, description? }
export async function POST(req: NextRequest) {
  const { name, slug, fiscalYear, description } = await req.json()
  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ message: 'กรุณาระบุชื่อชุดและ slug' }, { status: 400 })
  }
  const slugVal = String(slug).trim().toLowerCase()
  if (!SLUG_RE.test(slugVal)) {
    return NextResponse.json(
      { message: 'slug ต้องเป็นภาษาอังกฤษพิมพ์เล็ก ตัวเลข และขีด (-) เท่านั้น เช่น inspection-r3' },
      { status: 400 },
    )
  }
  const fyVal = fiscalYear?.toString().trim() || null
  const descVal = description?.toString().trim() || null
  const conn = await pool.getConnection()
  try {
    const [maxRow] = await conn.execute('SELECT COALESCE(MAX(sort_order), 0) AS m FROM kpi_sets')
    const nextOrder = (maxRow as { m: number }[])[0].m + 1
    const [result] = await conn.execute(
      'INSERT INTO kpi_sets (name, slug, fiscal_year, description, sort_order) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), slugVal, fyVal, descVal, nextOrder],
    )
    return NextResponse.json({ ok: true, id: (result as { insertId: number }).insertId, message: 'เพิ่มชุดตัวชี้วัดสำเร็จ' })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      const msg = String((err as { message?: string }).message ?? '')
      const dupField = msg.includes('uk_set_slug') ? 'slug' : 'ชื่อชุด'
      return NextResponse.json({ message: `${dupField}นี้มีอยู่แล้ว` }, { status: 409 })
    }
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
