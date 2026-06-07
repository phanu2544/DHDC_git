import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DHDC - ระบบติดตาม KPI',
  description: 'ระบบติดตามตัวชี้วัด HDC กระทรวงสาธารณสุข',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  )
}
