'use client'

import { useState } from 'react'

/** สีตามประเภท field (จาก classifyFields) — ใช้ทั้งใน Mapping Builder และ preview chips */
export const FIELD_TYPE_COLOR: Record<string, string> = {
  dimension: 'bg-red-50 text-red-700 border-red-300',
  time:      'bg-amber-50 text-amber-700 border-amber-300',
  target:    'bg-green-50 text-green-700 border-green-300',
  measure:   'bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-400',
}

/**
 * Chip-based field selector สำหรับ Mapping Builder
 * - แสดง chip ของ field ที่เลือกแล้ว (กด × เพื่อเอาออก)
 * - พิมพ์ชื่อ field เพิ่มเองหรือคลิกจาก availableFields
 * - multiSelect=false → เลือกได้ 1 field (แทนที่เดิม)
 * - multiSelect=true  → เลือกได้หลาย field (เพิ่มเข้าไป)
 */
export default function FieldChipBuilder({
  fields, onChange, availableFields, fieldTypes, color, placeholder, multiSelect,
}: {
  fields: string[]
  onChange: (fields: string[]) => void
  availableFields: string[]
  fieldTypes: Record<string, string>
  color: 'blue' | 'green'
  placeholder: string
  multiSelect: boolean
}) {
  const [input, setInput] = useState('')

  function add(f: string) {
    const trimmed = f.trim()
    if (!trimmed) return
    if (multiSelect) {
      if (!fields.includes(trimmed)) onChange([...fields, trimmed])
    } else {
      onChange([trimmed])
    }
    setInput('')
  }

  function remove(f: string) {
    onChange(fields.filter((x) => x !== f))
  }

  const chipClass     = color === 'blue' ? 'bg-blue-100 text-blue-800 border-blue-300'    : 'bg-green-100 text-green-800 border-green-300'
  const selectedClass = color === 'blue' ? 'bg-blue-700 text-white border-blue-700'        : 'bg-green-700 text-white border-green-700'
  const isBlocked     = (f: string) => ['dimension', 'time'].includes(fieldTypes[f] ?? '')

  return (
    <div className="space-y-2">
      {/* Selected field chips */}
      <div className="flex flex-wrap gap-1 min-h-[34px] p-1.5 border rounded-lg bg-gray-50">
        {fields.length === 0
          ? <span className="text-xs text-gray-400 italic px-1">ยังไม่ได้เลือก</span>
          : fields.map((f) => (
            <span key={f} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-mono border ${chipClass}`}>
              {f}
              <button onClick={() => remove(f)} className="ml-0.5 hover:text-red-500 font-bold leading-none" title={`เอา ${f} ออก`}>×</button>
            </span>
          ))
        }
      </div>

      {/* Text input */}
      <div className="flex gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { add(input); e.preventDefault() } }}
          placeholder={placeholder}
          className="flex-1 border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button onClick={() => add(input)} disabled={!input.trim()}
          className="bg-gray-200 hover:bg-gray-300 disabled:opacity-40 text-xs px-2.5 py-1.5 rounded-lg">+</button>
      </div>

      {/* Available fields from preview — click to add/toggle */}
      {availableFields.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {availableFields.map((f) => {
            const blocked  = isBlocked(f)
            const selected = fields.includes(f)
            const ftype    = fieldTypes[f] ?? 'measure'
            const typeColor = FIELD_TYPE_COLOR[ftype] ?? FIELD_TYPE_COLOR.measure
            return (
              <button key={f}
                onClick={() => {
                  if (blocked) return
                  if (multiSelect && selected) remove(f)
                  else add(f)
                }}
                disabled={blocked}
                title={
                  blocked  ? `${ftype} field — ใช้เป็น value/target ไม่ได้` :
                  selected ? `คลิกซ้ำเพื่อถอด "${f}"` :
                  `เพิ่ม "${f}"`
                }
                className={`text-xs px-1.5 py-0.5 rounded font-mono border transition-colors
                  ${selected ? selectedClass : typeColor}
                  ${blocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                {f}{selected && ' ✓'}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
