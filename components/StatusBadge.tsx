import type { KPIStatus } from '@/lib/types'

const MAP: Record<KPIStatus, { label: string; cls: string }> = {
  completed: { label: 'ดำเนินการเสร็จแล้ว', cls: 'bg-green-100 text-green-800' },
  in_progress: { label: 'กำลังดำเนินการ', cls: 'bg-blue-100 text-blue-800' },
  overdue: { label: 'เกินระยะเวลา', cls: 'bg-red-100 text-red-800' },
}

export default function StatusBadge({ status }: { status: KPIStatus }) {
  const { label, cls } = MAP[status]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}
