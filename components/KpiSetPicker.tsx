'use client'

import { useEffect, useState } from 'react'

/**
 * KpiSetPicker — เลือกว่า KPI นี้อยู่ชุด/ประเภทไหน (docs/kpi-sets-plan.md K3)
 * self-fetch /api/kpi-sets (read-only, ทุกคนที่ login) แยกจาก KpiSetManager (K2, CRUD ชุด)
 * ต่างจาก WorkGroupPicker: ติ๊กแล้วมีช่องกรอก "เลขข้อ" (set_code) ต่อชุด เช่น ตรวจราชการ "1.5"
 * value = { setId, setCode }[] — ส่งเข้า PUT /api/kpis/[id] field `sets`
 */
type PickItem = { setId: number; setCode: string }
type ApiSet = { id: number; name: string; slug: string; fiscalYear: string | null }

export default function KpiSetPicker({
  value, onChange,
}: {
  value: PickItem[]
  onChange: (items: PickItem[]) => void
}) {
  const [sets, setSets] = useState<ApiSet[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/kpi-sets')
      .then((res) => (res.ok ? res.json() : []))
      .then(setSets)
      .finally(() => setLoading(false))
  }, [])

  const picked = (id: number) => value.find((v) => v.setId === id)

  function toggle(id: number) {
    if (picked(id)) onChange(value.filter((v) => v.setId !== id))
    else onChange([...value, { setId: id, setCode: '' }])
  }
  function setCode(id: number, code: string) {
    onChange(value.map((v) => (v.setId === id ? { ...v, setCode: code } : v)))
  }

  if (loading) return <p className="text-xs text-gray-400 italic">กำลังโหลดชุดตัวชี้วัด...</p>
  if (sets.length === 0) return <p className="text-xs text-gray-400 italic">ยังไม่มีชุด — เพิ่มได้ที่แท็บ KPI &gt; จัดการชุด/ประเภทตัวชี้วัด</p>

  return (
    <div className="space-y-1.5">
      {sets.map((s) => {
        const p = picked(s.id)
        return (
          <div key={s.id} className="flex items-center gap-2">
            <label
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer border transition-colors flex-1 min-w-0 ${
                p ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400'
              }`}>
              <input type="checkbox" checked={!!p} onChange={() => toggle(s.id)} className="hidden" />
              <span className="truncate">{s.name}</span>
              {s.fiscalYear && <span className={`shrink-0 text-[10px] ${p ? 'text-indigo-100' : 'text-amber-600'}`}>({s.fiscalYear})</span>}
            </label>
            {p && (
              <input
                value={p.setCode}
                onChange={(e) => setCode(s.id, e.target.value)}
                placeholder="เลขข้อ เช่น 1.5"
                className="w-28 shrink-0 border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            )}
          </div>
        )
      })}
      <p className="text-[11px] text-gray-400">ติ๊กชุดที่ตัวชี้วัดนี้สังกัด (เลือกได้หลายชุด) · &quot;เลขข้อ&quot; = เลขที่ชุดนั้นใช้เรียก (ไม่มีก็เว้นว่าง)</p>
    </div>
  )
}
