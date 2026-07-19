import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { hashPassword } from '@/lib/password'

// DELETE /api/users/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const conn = await pool.getConnection()
  try {
    const [result] = await conn.execute('DELETE FROM users WHERE id = ?', [params.id])
    const affected = (result as { affectedRows: number }).affectedRows
    if (affected === 0) return NextResponse.json({ message: 'ไม่พบผู้ใช้' }, { status: 404 })
    return NextResponse.json({ ok: true, message: 'ลบผู้ใช้สำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

// PATCH /api/users/[id]  body: { password } | { role } | { name, department, role }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const conn = await pool.getConnection()
  try {
    if ('password' in body) {
      if (!body.password) return NextResponse.json({ message: 'รหัสผ่านห้ามว่าง' }, { status: 400 })
      await conn.execute('UPDATE users SET password=? WHERE id=?', [await hashPassword(body.password), params.id])
      return NextResponse.json({ ok: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' })
    }
    // General update (name / title / department / role)
    const { name, title, department, role } = body
    await conn.execute(
      'UPDATE users SET name=COALESCE(?,name), title=COALESCE(?,title), department=COALESCE(?,department), role=COALESCE(?,role) WHERE id=?',
      [name ?? null, title ?? null, department ?? null, role ?? null, params.id],
    )
    return NextResponse.json({ ok: true, message: 'อัปเดตผู้ใช้สำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
