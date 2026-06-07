import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { name, category, mophUrl, mophTable, mophValueField, mophTargetField, mophCalcMode,
          owner, deadline, status, target, unit, description } = body
  const conn = await pool.getConnection()
  try {
    await conn.execute(
      `UPDATE kpi_reports SET
        name=?, category=?, moph_url=?, moph_table=?, moph_value_field=?, moph_target_field=?, moph_calc_mode=?,
        owner=?, deadline=?, status=?, target=?, unit=?, description=?
       WHERE id=?`,
      [name, category,
       mophUrl ?? null, mophTable ?? null, mophValueField ?? null, mophTargetField ?? null, mophCalcMode ?? 'percent',
       owner, deadline, status, target, unit, description ?? null, params.id],
    )
    return NextResponse.json({ message: 'แก้ไข KPI สำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const conn = await pool.getConnection()
  try {
    await conn.execute('DELETE FROM kpi_reports WHERE id = ?', [params.id])
    return NextResponse.json({ message: 'ลบ KPI สำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const conn = await pool.getConnection()
  try {
    if ('mophValueField' in body) {
      // อัปเดต MOPH field config (valueField / targetField / calcMode)
      await conn.execute(
        'UPDATE kpi_reports SET moph_value_field=?, moph_target_field=?, moph_calc_mode=? WHERE id=?',
        [body.mophValueField ?? null, body.mophTargetField ?? null, body.mophCalcMode ?? 'percent', params.id],
      )
      return NextResponse.json({ ok: true, message: 'บันทึก Field Config สำเร็จ' })
    }
    // อัปเดตสถานะ (เดิม)
    await conn.execute('UPDATE kpi_reports SET status=? WHERE id=?', [body.status, params.id])
    return NextResponse.json({ ok: true, message: 'อัปเดตสถานะสำเร็จ' })
  } catch (err) {
    return NextResponse.json({ message: String(err) }, { status: 500 })
  } finally {
    conn.release()
  }
}
