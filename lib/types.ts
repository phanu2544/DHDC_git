export type UserRole = 'admin' | 'staff'
export type KPIStatus = 'completed' | 'in_progress' | 'overdue'
export type KPICategory = string

export interface User {
  id: string
  email: string
  password: string
  name: string
  role: UserRole
  department: string
}

export interface KPIReport {
  id: string
  name: string
  category: KPICategory
  mophUrl?: string
  mophTable?: string       // tableName สำหรับ MOPH API เช่น s_dm_hba1c
  mophValueField?: string  // field ที่ใช้เป็นค่า เช่น hba1c, result
  mophTargetField?: string // field ที่ใช้เป็น target เช่น target
  mophCalcMode?: string    // percent | sum | raw
  mophReportId?: string    // FK → moph_report_catalog.id
  mophConfig?: MophMapping // Phase 2: JSON mapping เก็บใน moph_config column
  owner: string
  deadline: string
  status: KPIStatus
  target: number
  unit: string
  description?: string
}

export interface MophCatalogEntry {
  id: string
  name: string
  mophTable: string
  valueField: string
  targetField: string
  calcMode: string
  category: string
  province: string
  hospcode: string
  description?: string
  active: number
  created_at: string
}

export interface MophSnapshot {
  id: number
  reportId: string
  reportName: string
  mophTable: string
  year: string
  month: string
  province: string
  hospcode: string
  rowsCount: number
  sumValue: number
  sumTarget: number
  calcValue: number
  fetchedAt: string
  category?: string
}

export interface MonthlyData {
  kpiId: string
  month: string
  value: number
  target: number
}

// ── MOPH Engine types (Phase 1) ─────────────────────────────────────────────
// FieldMode: วิธีรวม value fields — singleField (เดิม) | sumFields (รวมหลาย column) | none
export type FieldMode = 'singleField' | 'sumFields' | 'none'
// CalcMode: percent (ตัวเศษ/ตัวส่วน×100) | sum (ผลรวม) | raw (ค่าดิบ) | noTarget (ติดตามเฉยๆ ไม่ประเมิน)
export type CalcMode = 'percent' | 'sum' | 'raw' | 'noTarget'
// FieldType: ใช้จัดประเภท field จาก MOPH เพื่อ guard การเลือกผิด
export type FieldType = 'measure' | 'target' | 'dimension' | 'time'

/** นิยามการ map field ของ KPI หนึ่งตัว (Phase 1 ใช้ภายใน engine; Phase 2 จะ persist เป็น JSON) */
export interface MophMapping {
  fieldMode: FieldMode
  valueFields: string[]              // ตัวเศษ (numerator) — 1 field หรือหลาย field เมื่อ sumFields
  targetMode: 'field' | 'constant' | 'none'
  targetFields?: string[]            // ตัวส่วน (denominator) — รองรับหลาย field
  constantTarget?: number
  calcMode: CalcMode
  aggregate?: 'sum' | 'avg'          // สำหรับ raw mode
}

/** ผลลัพธ์จาก computeMoph — pure ไม่มี side-effect */
export interface MophResult {
  calcValue: number | null           // ค่าที่คำนวณได้ (null = ประเมินไม่ได้ / noTarget)
  sumValue: number                   // ผลรวมตัวเศษข้ามแถว
  sumTarget: number | null           // ผลรวมตัวส่วนข้ามแถว (null = ไม่มี target)
  evaluated: boolean                 // true = มีการประเมินผ่าน/ไม่ผ่านได้
  warnings: string[]
  errors: string[]
}
