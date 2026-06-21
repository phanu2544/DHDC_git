import type { User, KPIReport, MonthlyData } from './types'

export interface CatalogEntry {
  id: string
  name: string
  mophTable: string
  valueField: string
  targetField: string
  calcMode: string
  category: string
  province?: string
  hospcode?: string   // กรองตาม hospcode (ตรงกัน)
  areacode?: string   // กรองตาม areacode prefix เช่น '6611' = จังหวัด66 อำเภอ11
  description?: string
}

export const INITIAL_USERS: User[] = [
  { id: 'u1', email: 'admin@hospital.go.th', password: 'admin123', name: 'ผู้ดูแลระบบ', role: 'admin', department: 'ฝ่ายสารสนเทศ' },
  { id: 'u2', email: 'staff@hospital.go.th', password: 'staff123', name: 'สมชาย ใจดี', role: 'staff', department: 'งาน NCD' },
  { id: 'u3', email: 'staff2@hospital.go.th', password: 'staff123', name: 'สมหญิง รักดี', role: 'staff', department: 'งานอนามัยแม่และเด็ก' },
]

// KPI จริงทั้งหมดอยู่ใน DB (เพิ่มผ่านหน้า /admin) — seed ไม่ต้องมี KPI ตัวอย่าง
// (เดิมมี kpi-01 = KPI ทดสอบซ้ำ s_dm_control · ลบ 18 มิ.ย. แต่ init ปลุกกลับ → ลบจาก seed 21 มิ.ย.)
export const INITIAL_KPIS: KPIReport[] = []

export const INITIAL_MONTHLY_DATA: MonthlyData[] = []

// ─── Catalog เริ่มต้น (รายงาน MOPH จังหวัด 66 อำเภอ 11) ─────────────────────
// areacode prefix '6611' = จังหวัดพิจิตร(66) + อำเภอ(11)
export const INITIAL_CATALOG: CatalogEntry[] = [
  // ─── NCD ───────────────────────────────────────────────────────────────────
  {
    id: '137a726340e4dfde7bbbc5d8aeee3ac3',
    name: 'ผู้ป่วยเบาหวานที่ควบคุมระดับน้ำตาลได้ดี (HbA1c < 7%)',
    mophTable: 's_dm_control', valueField: 'hba1c', targetField: 'target', calcMode: 'percent',
    category: 'NCD', province: '66', hospcode: '', areacode: '6611',
    description: 'ร้อยละผู้ป่วย DM ที่ HbA1c < 7% (field: hba1c) | areacode ขึ้นต้น 6611',
  },
  {
    id: 'rpt-dm-control-result',
    name: 'ผู้ป่วยเบาหวานควบคุมน้ำตาลได้ดี (FBS)',
    mophTable: 's_dm_control', valueField: 'result', targetField: 'target', calcMode: 'percent',
    category: 'NCD', province: '66', hospcode: '', areacode: '6611',
    description: 'ร้อยละผู้ป่วย DM ที่ FBS ควบคุมได้ (field: result)',
  },
  {
    id: 'rpt-ht-control',
    name: 'ผู้ป่วยความดันโลหิตสูงที่ควบคุมความดันได้ดี',
    mophTable: 's_ht_control', valueField: 'result', targetField: 'target', calcMode: 'percent',
    category: 'NCD', province: '66', hospcode: '', areacode: '6611',
    description: 'ร้อยละผู้ป่วย HT ที่ BP < 140/90 mmHg',
  },
  {
    id: 'rpt-dm-ckd',
    name: 'ผู้ป่วยเบาหวานไม่มีภาวะแทรกซ้อนทางไต (CKD)',
    mophTable: 's_dm_ckd', valueField: 'result', targetField: 'target', calcMode: 'percent',
    category: 'NCD', province: '66', hospcode: '', areacode: '6611',
    description: 'ร้อยละผู้ป่วย DM ที่ไม่เป็น CKD',
  },
  // ─── แม่และเด็ก ─────────────────────────────────────────────────────────────
  {
    id: 'rpt-anc-early',
    name: 'หญิงตั้งครรภ์ฝากครรภ์ก่อน 12 สัปดาห์',
    mophTable: 's_anc', valueField: 'result', targetField: 'target', calcMode: 'percent',
    category: 'แม่และเด็ก', province: '66', hospcode: '', areacode: '6611',
    description: 'ฝากครรภ์ครั้งแรก < 12 สัปดาห์ อำเภอ 11',
  },
  {
    id: 'rpt-child-growth',
    name: 'เด็ก 0-5 ปี มีส่วนสูงระดับดีและรูปร่างสมส่วน',
    mophTable: 's_child', valueField: 'result', targetField: 'target', calcMode: 'percent',
    category: 'แม่และเด็ก', province: '66', hospcode: '', areacode: '6611',
    description: 'ส่วนสูง/น้ำหนักเด็ก 0-5 ปี อำเภอ 11',
  },
]
