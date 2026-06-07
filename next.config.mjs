/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // เปิด instrumentation.ts เพื่อสตาร์ท node-cron ตอน server boot (Next 14.2)
    instrumentationHook: true,
  },
}

export default nextConfig
