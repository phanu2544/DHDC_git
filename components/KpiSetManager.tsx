'use client'

import { useEffect, useState } from 'react'

/**
 * KpiSetManager — จัดการ "ชุด/ประเภทตัวชี้วัด" ใน /admin (docs/kpi-sets-plan.md K2)
 * แกนที่ 3 (ต่างจากหมวดหมู่ HDC = เรื่องอะไร / กลุ่มงาน = ใครทำ) — ชุด = "ส่งใคร/พันธะไหน"
 * แยกไฟล์ตาม pattern WorkGroupManager/KpiWizard · CRUD ชุด (ผูก KPI เข้าชุดทำใน K3)
 */
type KpiSet = {
  id: number
  name: string
  slug: string
  fiscalYear: string | null
  description: string | null
  sortOrder: number
  itemCount: number
}

const emptyForm = { name: '', slug: '', fiscalYear: '', description: '' }

export default function KpiSetManager({
  onMessage,
}: {
  onMessage: (text: string, type?: 'success' | 'error') => void
}) {
  const [sets, setSets] = useState<KpiSet[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/kpi-sets')
      if (res.ok) setSets(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function addSet() {
    if (!form.name.trim() || !form.slug.trim()) { onMessage('กรุณาระบุชื่อชุดและ slug', 'error'); return }
    const res = await fetch('/api/kpi-sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { onMessage(data.message, 'error'); return }
    setForm(emptyForm); setShowAdd(false)
    await load()
    onMessage(`เพิ่มชุด "${form.name.trim()}" สำเร็จ`)
  }

  function startEdit(s: KpiSet) {
    setEditId(s.id)
    setEditForm({ name: s.name, slug: s.slug, fiscalYear: s.fiscalYear ?? '', description: s.description ?? '' })
  }

  async function saveEdit(id: number) {
    const res = await fetch(`/api/kpi-sets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    const data = await res.json()
    if (!res.ok) { onMessage(data.message, 'error'); return }
    setEditId(null)
    await load()
    onMessage('แก้ไขชุดสำเร็จ')
  }

  async function deleteSet(s: KpiSet) {
    if (!confirm(`ลบชุด "${s.name}"?`)) return
    const res = await fetch(`/api/kpi-sets/${s.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { onMessage(data.message, 'error'); return }
    setSets((prev) => prev.filter((x) => x.id !== s.id))
    onMessage(`ลบชุด "${s.name}" สำเร็จ`)
  }

  const inputCls = 'border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-700">🎯 จัดการชุด/ประเภทตัวชี้วัด</h3>
        <span className="text-xs text-gray-400">{sets.length} ชุด</span>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        ชุด = ตัวชี้วัดนี้ <b>ส่งใคร/ผูกกับพันธะไหน</b> (ตรวจราชการ, HA, อบจ., Ranking, Smart Hospital) —
        คนละแกนกับ &quot;หมวดหมู่&quot; (เรื่องอะไร) และ &quot;กลุ่มงาน&quot; (ใครทำ) · ผูกตัวชี้วัดเข้าชุดทำที่ฟอร์มแก้ไข KPI
      </p>

      {loading ? (
        <span className="text-xs text-gray-400 italic">กำลังโหลด...</span>
      ) : (
        <div className="space-y-2">
          {sets.map((s) => (
            <div key={s.id} className="border rounded-lg px-3 py-2">
              {editId === s.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input className={inputCls} value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="ชื่อชุด" />
                    <input className={inputCls} value={editForm.slug}
                      onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })} placeholder="slug (a-z, 0-9, -)" />
                    <input className={inputCls} value={editForm.fiscalYear}
                      onChange={(e) => setEditForm({ ...editForm, fiscalYear: e.target.value })} placeholder="ปีงบ เช่น 2569 (ว่าง=ใช้ทุกปี)" />
                    <input className={inputCls} value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="คำอธิบาย (ไม่บังคับ)" />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditId(null)} className="text-xs px-3 py-1 rounded-lg border text-gray-600 hover:bg-gray-50">ยกเลิก</button>
                    <button onClick={() => saveEdit(s.id)} className="text-xs px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium">บันทึก</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800 text-sm">{s.name}</span>
                      {s.fiscalYear && <span className="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-medium">ปีงบ {s.fiscalYear}</span>}
                      <span className="text-[10px] text-gray-400 font-mono">/sets/{s.slug}</span>
                    </div>
                    {s.description && <div className="text-xs text-gray-500 mt-0.5">{s.description}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500">{s.itemCount} ตัวชี้วัด</span>
                    <button onClick={() => startEdit(s)} className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50">แก้ไข</button>
                    <button onClick={() => deleteSet(s)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">ลบ</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {sets.length === 0 && (
            <span className="text-xs text-gray-400 italic">ยังไม่มีชุด — กด Migrate &amp; Seed หรือเพิ่มด้านล่าง</span>
          )}
        </div>
      )}

      {showAdd ? (
        <div className="mt-3 border-t pt-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className={inputCls} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ชื่อชุด เช่น ตัวชี้วัดตรวจราชการ เขต 3" />
            <input className={inputCls} value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="slug เช่น inspection-r3" />
            <input className={inputCls} value={form.fiscalYear}
              onChange={(e) => setForm({ ...form, fiscalYear: e.target.value })} placeholder="ปีงบ เช่น 2569 (ว่าง=ใช้ทุกปี)" />
            <input className={inputCls} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="คำอธิบาย (ไม่บังคับ)" />
          </div>
          <p className="text-[11px] text-gray-400">slug = ชื่อในลิงก์ /sets/&lt;slug&gt; ต้องเป็นภาษาอังกฤษพิมพ์เล็ก ตัวเลข และขีด (-) เท่านั้น</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowAdd(false); setForm(emptyForm) }} className="text-xs px-3 py-1.5 rounded-lg border text-gray-600 hover:bg-gray-50">ยกเลิก</button>
            <button onClick={addSet} disabled={!form.name.trim() || !form.slug.trim()}
              className="text-xs px-4 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-300 text-white font-medium">+ เพิ่มชุด</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="mt-3 text-xs text-indigo-700 hover:text-indigo-900 font-medium">+ เพิ่มชุดตัวชี้วัด</button>
      )}
    </div>
  )
}
