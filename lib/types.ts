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
