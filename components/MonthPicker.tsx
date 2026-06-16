'use client'

/**
 * เลือกเดือนของกราฟ detail + แสดงแหล่งข้อมูล (snapshot/live)
 * ใช้ร่วมกันทุกหน้า drilldown ที่อ่านผ่าน lib/monthlyView
 */
export default function MonthPicker({
  month, source, availableMonths, onChange, disabled,
}: {
  month: string
  source?: 'snapshot' | 'live'
  availableMonths: string[]
  onChange: (m: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {source === 'snapshot'
        ? <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200" title="ข้อมูลที่ระบบบันทึกไว้รายเดือน">📅 ข้อมูลบันทึก</span>
        : <span className="text-xs px-2 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200" title="ดึงสดจาก MOPH ขณะนี้">🔴 สดจาก MOPH</span>}
      <select
        value={month}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
        {availableMonths.map((m) => (
          <option key={m} value={m}>เดือน {m}</option>
        ))}
        <option value="live">ล่าสุด (สดจาก MOPH)</option>
      </select>
    </div>
  )
}
