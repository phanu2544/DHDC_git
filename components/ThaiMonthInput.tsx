'use client'

// ชื่อเดือนไทย — คำนวณจาก locale เดียวกับ lib/formatMonth.ts (toLocaleDateString('th-TH')) กันชื่อไม่ตรงกัน
const THAI_MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString('th-TH', { month: 'long' }))

/**
 * ตัวเลือกเดือน/ปี แบบไทย (เดือนไทย + ปี พ.ศ.) แทน <input type="month"> ของเบราว์เซอร์
 * (ของเดิมโชว์ปี ค.ศ. + ชื่อเดือนตาม locale เครื่อง ไม่ใช่ไทยเสมอไป)
 *
 * value/onChange/min/max ยังเป็นรูปแบบ "YYYY-MM" (ค.ศ.) เหมือน input เดิมทุกประการ
 * — เปลี่ยนแค่ UI ไม่กระทบ logic ที่เรียกใช้อยู่แล้วทั้งระบบ
 */
export default function ThaiMonthInput({
  value, onChange, min, max, disabled, className,
}: {
  value: string
  onChange: (v: string) => void
  min?: string
  max?: string
  disabled?: boolean
  className?: string
}) {
  const [yStr, mStr] = value ? value.split('-') : ['', '']
  const y = yStr ? Number(yStr) : null
  const m = mStr ? Number(mStr) : null

  const [minY, minM] = min ? min.split('-').map(Number) : [null, null]
  const [maxY, maxM] = max ? max.split('-').map(Number) : [null, null]

  const thisYear = new Date().getFullYear()
  const yearStart = minY ?? (y ?? thisYear) - 5
  const yearEnd = maxY ?? (y ?? thisYear) + 1
  const years: number[] = []
  for (let yy = yearStart; yy <= yearEnd; yy++) years.push(yy)

  function set(newY: number, newM: number) {
    onChange(`${newY}-${String(newM).padStart(2, '0')}`)
  }

  const monthDisabled = (yy: number, mm: number) => {
    if (minY != null && (yy < minY || (yy === minY && mm < (minM ?? 1)))) return true
    if (maxY != null && (yy > maxY || (yy === maxY && mm > (maxM ?? 12)))) return true
    return false
  }

  return (
    <div className={`flex gap-1.5 ${className ?? ''}`}>
      <select
        value={m ?? ''}
        disabled={disabled}
        onChange={(e) => set(y ?? thisYear, Number(e.target.value))}
        className="border rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-100"
      >
        {THAI_MONTHS.map((name, i) => (
          <option key={i} value={i + 1} disabled={monthDisabled(y ?? thisYear, i + 1)}>{name}</option>
        ))}
      </select>
      <select
        value={y ?? ''}
        disabled={disabled}
        onChange={(e) => set(Number(e.target.value), m ?? 1)}
        className="border rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-100"
      >
        {years.map((yy) => (
          <option key={yy} value={yy}>{yy + 543}</option>
        ))}
      </select>
    </div>
  )
}
