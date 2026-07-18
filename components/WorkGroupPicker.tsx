'use client'

import { useEffect, useState } from 'react'

/**
 * WorkGroupPicker — checkbox multi-select กลุ่มงาน (docs/kpi-work-groups-plan.md Phase C)
 * self-fetch /api/work-groups เอง (read-only, ไม่ต้อง admin) แยกจาก WorkGroupManager (Phase B, จัดการ CRUD)
 */
export default function WorkGroupPicker({
  value, onChange,
}: {
  value: string[]
  onChange: (groups: string[]) => void
}) {
  const [groups, setGroups] = useState<{ name: string; sortOrder: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/work-groups')
      .then((res) => (res.ok ? res.json() : []))
      .then(setGroups)
      .finally(() => setLoading(false))
  }, [])

  function toggle(name: string) {
    onChange(value.includes(name) ? value.filter((g) => g !== name) : [...value, name])
  }

  if (loading) return <p className="text-xs text-gray-400 italic">กำลังโหลดกลุ่มงาน...</p>
  if (groups.length === 0) return <p className="text-xs text-gray-400 italic">ยังไม่มีกลุ่มงาน — เพิ่มได้ที่แท็บ KPI &gt; จัดการกลุ่มงาน</p>

  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((g) => {
        const checked = value.includes(g.name)
        return (
          <label
            key={g.name}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer border transition-colors ${
              checked
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-white border-gray-300 text-gray-600 hover:border-emerald-400'
            }`}>
            <input type="checkbox" checked={checked} onChange={() => toggle(g.name)} className="hidden" />
            {g.name}
          </label>
        )
      })}
    </div>
  )
}
