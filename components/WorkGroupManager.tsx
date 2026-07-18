'use client'

import { useEffect, useState } from 'react'

/**
 * WorkGroupManager — จัดการกลุ่มงานใน รพ. (docs/kpi-work-groups-plan.md)
 * แยกเป็น component ต่างหาก (ตาม pattern KpiWizard/FieldChipBuilder) ไม่ยัดเข้า admin/page.tsx
 * Phase B: CRUD กลุ่มงานเท่านั้น — ผูกเข้า KPI (multi-select) เป็น Phase C
 */
export default function WorkGroupManager({
  onMessage,
}: {
  onMessage: (text: string, type?: 'success' | 'error') => void
}) {
  const [groups, setGroups] = useState<{ name: string; sortOrder: number }[]>([])
  const [newInput, setNewInput] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/work-groups')
      if (res.ok) setGroups(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function addGroup() {
    const name = newInput.trim()
    if (!name) return
    const res = await fetch('/api/work-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await res.json()
    if (!res.ok) { onMessage(data.message, 'error'); return }
    setNewInput('')
    await load()
    onMessage(`เพิ่มกลุ่มงาน "${name}" สำเร็จ`)
  }

  async function deleteGroup(name: string) {
    const res = await fetch(`/api/work-groups?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { onMessage(data.message, 'error'); return }
    setGroups((prev) => prev.filter((g) => g.name !== name))
    onMessage(`ลบกลุ่มงาน "${name}" สำเร็จ`)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">🏢 จัดการกลุ่มงาน</h3>
        <span className="text-xs text-gray-400">{groups.length} กลุ่มงาน</span>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {loading ? (
          <span className="text-xs text-gray-400 italic">กำลังโหลด...</span>
        ) : groups.length === 0 ? (
          <span className="text-xs text-gray-400 italic">ยังไม่มีกลุ่มงาน — กด Migrate &amp; Seed หรือเพิ่มด้านล่าง</span>
        ) : (
          groups.map((g) => (
            <span key={g.name} className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium px-2.5 py-1 rounded-full">
              {g.name}
              <button
                onClick={() => deleteGroup(g.name)}
                className="ml-0.5 text-emerald-400 hover:text-red-500 transition-colors font-bold leading-none"
                title={`ลบ ${g.name}`}>
                ×
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={newInput}
          onChange={(e) => setNewInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addGroup()}
          placeholder="ชื่อกลุ่มงานใหม่ เช่น เวชระเบียน"
          className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          onClick={addGroup}
          disabled={!newInput.trim()}
          className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-300 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition-colors">
          + เพิ่ม
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1.5">ลบไม่ได้ถ้ายังมี KPI หรือผู้ใช้สังกัดกลุ่มงานนี้อยู่</p>
    </div>
  )
}
