import type { KPIReport } from '@/lib/types'

/**
 * Registry: mophTable → href ของหน้า drilldown
 * เพิ่ม KPI drilldown ใหม่ = เพิ่ม 1 entry ที่นี่ (ไม่ต้องแก้ app/dashboard)
 * KPI ที่ไม่มี entry → generic /kpi/[id]
 */
const aged9 = (k: KPIReport) => `/kpi/aged9?table=${k.mophTable}`

const DETAIL_VIEW: Record<string, (kpi: KPIReport) => string> = {
  // s_epi2 ใช้ร่วมกันหลาย KPI คนละวัคซีน (เช่น #5 MMR2 กับตัวรายชนิดเดิม DTP4) — ส่ง kpiId
  // ไปด้วยเสมอ ให้หน้า /kpi/vaccines รู้ว่ากำลังเข้าจาก KPI ตัวไหน แสดงชื่อ/เป้า/สถานะของตัวนั้นถูก
  s_epi2: (k) => `/kpi/vaccines?kpiId=${k.id}`,
  s_aged9: aged9,
  s_aged9_app: aged9,
  s_dm_screen_risk: () => '/kpi/screen-risk?disease=dm',
  s_ht_screen_risk: () => '/kpi/screen-risk?disease=ht',
  s_child_hct: () => '/kpi/anemia',
  s_kpi_ageing: () => '/kpi/ageing',
  s_colon_screen_w: () => '/kpi/colon-fit',
}

/** href ของหน้า drilldown สำหรับ KPI หนึ่งตัว (registry → fallback generic /kpi/[id]) */
export function detailViewHref(kpi: KPIReport): string {
  const builder = kpi.mophTable ? DETAIL_VIEW[kpi.mophTable] : undefined
  return builder ? builder(kpi) : `/kpi/${kpi.id}`
}
