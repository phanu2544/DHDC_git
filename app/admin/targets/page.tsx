'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { getSession } from '@/lib/storage'
import { DIRECTION_LABEL } from '@/lib/scorecard'
import type { User, EvalDirection } from '@/lib/types'

interface TargetRow {
  id: string
  name: string
  category: string
  unit: string
  direction: EvalDirection
  reports_target: number | string | null
  year_target: number | string | null
  source: string | null
  confirmed_by: string | null
  confirmed_at: string | null
  note: string | null
  current_value: number | string | null
  current_month: string | null
}

const YEARS = ['2569', '2570']
const num = (v: unknown): number | null => (v === null || v === '' ? null : Number(v))

export default function TargetsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [year, setYear] = useState('2569')
  const [rows, setRows] = useState<TargetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ mode: 'evaluate', direction: 'gte', target: '', source: '', confirmedBy: '', confirmedAt: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async (y: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/targets?year=${y}`)
      const j = await res.json()
      setRows(j.rows ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const session = getSession()
    if (!session) { router.push('/login'); return }
    // D2: เปิดให้ผู้รับผิดชอบ (staff) เข้ามากรอก/แก้เป้าได้ ไม่ใช่แค่ admin (audit เก็บชื่อผู้กรอก)
    setUser(session)
    load(year)
  }, [router, load, year])

  function effectiveTarget(r: TargetRow): number | null {
    const yt = num(r.year_target)
    return yt !== null ? yt : num(r.reports_target)
  }
  function statusOf(r: TargetRow): 'tracking' | 'set' | 'unset' {
    if (r.direction === 'none') return 'tracking'
    const t = effectiveTarget(r)
    return t !== null && t > 0 ? 'set' : 'unset'
  }

  const setCount = rows.filter((r) => statusOf(r) === 'set').length
  const unsetCount = rows.filter((r) => statusOf(r) === 'unset').length
  const trackingCount = rows.filter((r) => statusOf(r) === 'tracking').length

  function startEdit(r: TargetRow) {
    setEditingId(r.id)
    setMsg('')
    setForm({
      mode: r.direction === 'none' ? 'track' : 'evaluate',
      direction: r.direction && r.direction !== 'none' ? r.direction : 'gte',
      target: effectiveTarget(r)?.toString() ?? '',
      source: r.source ?? '',
      confirmedBy: r.confirmed_by ?? user?.name ?? '',
      confirmedAt: r.confirmed_at ?? new Date().toISOString().slice(0, 10),
      note: r.note ?? '',
    })
  }

  async function save(kpiId: string) {
    const isTrack = form.mode === 'track'
    if (!isTrack && (form.target === '' || isNaN(Number(form.target)) || Number(form.target) < 0)) {
      setMsg('⚠️ กรุณากรอกเป้าหมายเป็นตัวเลข ≥ 0'); return
    }
    setSaving(true); setMsg('')
    try {
      const body = isTrack
        ? { kpiId, fiscalYear: year, mode: 'track',
            source: form.source || null, confirmedBy: form.confirmedBy || null,
            confirmedAt: form.confirmedAt || null, note: form.note || null }
        : { kpiId, fiscalYear: year, mode: 'evaluate', direction: form.direction, target: Number(form.target),
            source: form.source || null, confirmedBy: form.confirmedBy || null,
            confirmedAt: form.confirmedAt || null, note: form.note || null }
      const res = await fetch('/api/targets', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.message || 'บันทึกไม่สำเร็จ')
      setEditingId(null)
      await load(year)
      setMsg(isTrack ? '✅ เปลี่ยนเป็นติดตามเฉยๆ แล้ว' : '✅ บันทึกเป้าหมายสำเร็จ — รอบ batch ถัดไปจะ stamp ลง monthly_data')
    } catch (e) {
      setMsg('❌ ' + String(e))
    } finally {
      setSaving(false)
    }
  }

  async function importPrevYear() {
    const prev = String(Number(year) - 1)
    if (!confirm(`นำเข้าเป้าหมายจากปีงบ ${prev} มาเป็นค่าตั้งต้นของปี ${year}? (เฉพาะตัวที่ปี ${year} ยังไม่ได้ตั้ง)`)) return
    setSaving(true); setMsg('')
    try {
      const res = await fetch(`/api/targets?year=${prev}`)
      const j = await res.json()
      const prevRows: TargetRow[] = j.rows ?? []
      let copied = 0
      for (const pr of prevRows) {
        const pt = num(pr.year_target)
        if (pt === null) continue
        const cur = rows.find((r) => r.id === pr.id)
        if (cur && num(cur.year_target) !== null) continue // ไม่ทับของที่ตั้งแล้ว
        await fetch('/api/targets', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kpiId: pr.id, fiscalYear: year, target: pt,
            source: pr.source, confirmedBy: pr.confirmed_by, confirmedAt: pr.confirmed_at,
            note: `นำเข้าจากปี ${prev}` }),
        })
        copied++
      }
      await load(year)
      setMsg(`✅ นำเข้าจากปี ${prev} แล้ว ${copied} ตัวชี้วัด`)
    } catch (e) {
      setMsg('❌ ' + String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  const STATUS_BADGE = {
    set: { label: 'ตั้งเป้าแล้ว', cls: 'bg-green-100 text-green-700' },
    unset: { label: 'ยังไม่ตั้งเป้า', cls: 'bg-amber-100 text-amber-700' },
    tracking: { label: 'ติดตาม (ไม่ประเมิน)', cls: 'bg-slate-100 text-slate-600' },
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🎯 จัดการเป้าหมาย KPI</h1>
            <p className="text-gray-500 text-sm mt-1">
              อำเภอดงเจริญ • ตั้ง/แก้ไขเป้าหมายรายปีงบประมาณ พร้อมบันทึกแหล่งอ้างอิงและผู้ยืนยัน
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">ปีงบ</label>
            <select value={year} onChange={(e) => { setEditingId(null); setYear(e.target.value) }}
              className="border rounded-lg px-3 py-2 text-sm bg-white">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={importPrevYear} disabled={saving}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 disabled:opacity-50">
              ↧ นำเข้าจากปีก่อน
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card label="ตั้งเป้าแล้ว" value={setCount} color="text-green-700" />
          <Card label="ยังไม่ตั้งเป้า" value={unsetCount} color="text-amber-600" />
          <Card label="ตัวติดตาม (ไม่ประเมิน)" value={trackingCount} color="text-slate-600" />
        </div>

        {msg && <div className="mb-4 text-sm px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-800">{msg}</div>}

        {loading ? (
          <div className="text-center py-20 text-gray-400">กำลังโหลด...</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">ตัวชี้วัด</th>
                    <th className="text-right px-3 py-2 font-medium">ค่าปัจจุบัน</th>
                    <th className="text-center px-3 py-2 font-medium">ทิศทาง</th>
                    <th className="text-right px-3 py-2 font-medium">เป้าหมาย {year}</th>
                    <th className="text-center px-3 py-2 font-medium">สถานะ</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => {
                    const st = statusOf(r)
                    const eff = effectiveTarget(r)
                    const cv = num(r.current_value)
                    const isEditing = editingId === r.id
                    return (
                      <Fragment key={r.id}>
                        <tr className={`hover:bg-gray-50 ${st === 'unset' ? 'bg-amber-50' : ''}`}>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-gray-900">{r.name.trim()}</div>
                            <div className="text-xs text-gray-400">{r.category}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                            {cv === null ? '—' : `${cv}${r.unit ? ' ' + r.unit : ''}`}
                          </td>
                          <td className="px-3 py-2.5 text-center text-xs text-gray-500">{DIRECTION_LABEL[r.direction]}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                            {r.direction === 'none' ? '—' : eff !== null && eff > 0 ? eff : <span className="text-amber-500">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[st].cls}`}>
                              {STATUS_BADGE[st].label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button onClick={() => isEditing ? setEditingId(null) : startEdit(r)}
                              className="text-blue-600 hover:underline text-xs">
                              {isEditing ? 'ปิด' : (st === 'unset' ? 'ตั้งเป้า' : 'แก้ไข')}
                            </button>
                          </td>
                        </tr>
                        {isEditing && (
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="px-4 py-4">
                              {/* สลับโหมด: ประเมิน (ตั้งเป้า) / ติดตามเฉยๆ */}
                              <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden mb-3 text-sm">
                                <button onClick={() => setForm({ ...form, mode: 'evaluate' })}
                                  className={`px-4 py-1.5 ${form.mode === 'evaluate' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
                                  ประเมิน (ตั้งเป้า)
                                </button>
                                <button onClick={() => setForm({ ...form, mode: 'track' })}
                                  className={`px-4 py-1.5 border-l border-gray-300 ${form.mode === 'track' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
                                  ติดตามเฉยๆ
                                </button>
                              </div>

                              {form.mode === 'evaluate' ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                  <div>
                                    <label className="text-xs text-gray-500">เป้าหมาย ({r.unit || '%'})</label>
                                    <input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}
                                      placeholder="เช่น 80" className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500">ทิศทาง</label>
                                    <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}
                                      className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white">
                                      <option value="gte">ยิ่งมากยิ่งดี</option>
                                      <option value="lte">ยิ่งน้อยยิ่งดี</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500">แหล่งอ้างอิง</label>
                                    <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}
                                      placeholder="เกณฑ์กระทรวง/จังหวัด" className="w-full border rounded-lg px-2 py-1.5 text-sm" list="src-list" />
                                    <datalist id="src-list">
                                      <option value="เกณฑ์กระทรวง" /><option value="เกณฑ์จังหวัด" /><option value="มติ คปสอ." />
                                    </datalist>
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500">ผู้ยืนยัน</label>
                                    <input value={form.confirmedBy} onChange={(e) => setForm({ ...form, confirmedBy: e.target.value })}
                                      className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500">วันที่ยืนยัน</label>
                                    <input value={form.confirmedAt} onChange={(e) => setForm({ ...form, confirmedAt: e.target.value })}
                                      placeholder="YYYY-MM-DD" className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500">หมายเหตุ</label>
                                    <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                                      className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <div className="md:col-span-3 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                                    ℹ️ โหมดติดตาม = ไม่ต้องตั้งเป้า เครื่องจะไม่ตัดสินผ่าน/ไม่ผ่าน · บันทึกเหตุผล + ผู้ตัดสินไว้เป็นหลักฐาน (สลับกลับมาประเมินได้)
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500">ผู้ตัดสิน</label>
                                    <input value={form.confirmedBy} onChange={(e) => setForm({ ...form, confirmedBy: e.target.value })}
                                      className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500">วันที่</label>
                                    <input value={form.confirmedAt} onChange={(e) => setForm({ ...form, confirmedAt: e.target.value })}
                                      placeholder="YYYY-MM-DD" className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500">เหตุผลที่ไม่ประเมิน</label>
                                    <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                                      placeholder="เช่น เป็นค่าติดตาม ไม่มีเกณฑ์" className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                                  </div>
                                </div>
                              )}

                              <div className="flex gap-2 mt-3">
                                <button onClick={() => save(r.id)} disabled={saving}
                                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg">
                                  {saving ? 'กำลังบันทึก...' : (form.mode === 'track' ? 'บันทึก (ติดตามเฉยๆ)' : 'บันทึกเป้าหมาย')}
                                </button>
                                <button onClick={() => setEditingId(null)}
                                  className="border border-gray-300 text-sm px-4 py-1.5 rounded-lg hover:bg-gray-100">ยกเลิก</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3 leading-relaxed">
          บันทึกแล้วระบบ stamp เป้าลง monthly_data รอบ batch ถัดไป (07:00 scope 6611) · ปีงบใหม่กด "นำเข้าจากปีก่อน" แล้วแก้เฉพาะที่เปลี่ยน · ตัวติดตาม (ไม่ประเมิน) ไม่ต้องตั้งเป้า
        </p>
      </div>
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  )
}
