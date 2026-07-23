import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { SLUG_RE } from '@/lib/kpiSets'

/**
 * /api/kpi-sets/[id] — แก้/ลบชุดตัวชี้วัด (admin — บังคับที่ middleware ADMIN_MUTATE)
 * ต่างจาก work-groups (ลบตาม name): ชุดใช้ id เป็น PK → แก้ชื่อ/slug/ปีงบได้อิสระ
 */

// PUT /api/kpi-sets/[id]  body: { name?, slug?, fiscalYear?, description?, sortOrder? }
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ message: 'id ไม่ถูกต้อง' }, { status: 400 })

  const body = await req.json()
  const { name, slug, fiscalYear, description, sortOrder } = body

  // slug ถ้าส่งมาต้องผ่าน format (ปล่อยไม่ส่ง = ไม่แก้)
  let slugVal: string | null = null
  if (slug !== undefined) {
    slugVal = String(slug).trim().toLowerCase()
    if (!SLUG_RE.test(slugVal)) {
      return NextResponse.json(
        { message: 'slug ต้องเป็นภาษาอังกฤษพิมพ์เล็ก ตัวเลข และขีด (-) เท่านั้น' },
        { status: 400 },
      )
    }
  }
  if (name !== undefined && !String(name).trim()) {
    return NextResponse.json({ message: 'ชื่อชุดห้ามว่าง' }, { status: 400 })
  }

  const conn = await pool.getConnection()
  try {
    // COALESCE = ส่ง field ไหนมาแก้เฉพาะ field นั้น (ไม่ส่ง = คงค่าเดิม)
    // fiscalYear/description ส่ง '' ตั้งใจล้างเป็น NULL ได้ (ต่างจาก undefined = ไม่แตะ)
    const [result] = await conn.execute(
      `UPDATE kpi_sets SET
         name        = COALESCE(?, name),
         slug        = COALESCE(?, slug),
         fiscal_year = ${fiscalYear === undefined ? 'fiscal_year' : '?'},
         description = ${description === undefined ? 'description' : '?'},
         sort_order  = COALESCE(?, sort_order)
       WHERE id = ?`,
      [
        name !== undefined ? String(name).trim() : null,
        slugVal,
        ...(fiscalYear === undefined ? [] : [fiscalYear?.toString().trim() || null]),
        ...(description === undefined ? [] : [description?.toString().trim() || null]),
        sortOrder ?? null,
        id,
      ],
    )
    if ((result as { affectedRows: number }).affectedRows === 0) {
      return NextResponse.json({ message: 'ไม่พบชุดตัวชี้วัด' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, message: 'แก้ไขชุดตัวชี้วัดสำเร็จ' })
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

// DELETE /api/kpi-sets/[id] — กันลบถ้ายังมีตัวชี้วัดผูกอยู่ (ไม่ปล่อยให้ tag หายเงียบๆ แม้ FK cascade ได้)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ message: 'id ไม่ถูกต้อง' }, { status: 400 })

  const conn = await pool.getConnection()
  try {
    const [itemRows] = await conn.execute(
      'SELECT COUNT(*) AS count FROM kpi_set_items WHERE set_id = ?', [id],
    )
    const itemCount = (itemRows as { count: number }[])[0].count
    if (itemCount > 0) {
      return NextResponse.json(
        { message: `ลบไม่ได้ — มี ${itemCount} ตัวชี้วัดผูกอยู่ในชุดนี้ (นำตัวชี้วัดออกจากชุดก่อน)` },
        { status: 409 },
      )
    }
    const [result] = await conn.execute('DELETE FROM kpi_sets WHERE id = ?', [id])
    if ((result as { affectedRows: number }).affectedRows === 0) {
      return NextResponse.json({ message: 'ไม่พบชุดตัวชี้วัด' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, message: 'ลบชุดตัวชี้วัดสำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
