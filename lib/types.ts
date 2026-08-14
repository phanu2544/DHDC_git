export type UserRole = 'admin' | 'staff'
export type KPIStatus = 'completed' | 'in_progress' | 'overdue'
export type KPICategory = string

export type UserTitle = 'นาย' | 'นาง' | 'นางสาว'

export interface User {
  id: string
  email: string
  password: string
  name: string
  role: UserRole
  title?: UserTitle
  department: string
}

/** แท็กชุด/ประเภทที่ผูกกับ KPI (จาก kpi_set_items JOIN kpi_sets) — set_code = เลขข้อในชุดนั้น */
export interface KpiSetTag {
  id: number          // kpi_sets.id
  name: string        // ชื่อชุด
  slug: string        // สำหรับลิงก์ /sets/<slug>
  setCode: string | null  // เลขข้อในชุด เช่น '1.5' (nullable)
  // L3: เป้า 3 ระดับต่อชุด (ข้อมูลอ้างอิง — ยึดเป้า รพ. ตัดสิน · เขต/จังหวัดแสดงประกอบ)
  targetRegion?: string | null    // เป้าเขต เช่น '≥ ร้อยละ 95'
  targetProvince?: string | null  // เป้าจังหวัด
  targetHospital?: string | null  // เป้า รพ.
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
  direction?: EvalDirection // Phase 4: ทิศทางประเมิน (default 'gte') — column evaluation_direction
  manualEntry?: boolean     // true = กรอกค่าเอง (ไม่ดึง MOPH อัตโนมัติ) — column manual_entry
  manualScope?: 'unit' | 'single' // เฉพาะเมื่อ manualEntry=true: 'unit'=ราย รพ.สต. 7 หน่วย (default) · 'single'=ค่าเดียว — column manual_scope
  dataSource?: string       // แหล่งที่มาข้อมูล (provenance) เช่น 'HDC' — column data_source · ต่างจาก manualEntry (กลไกดึง)
  workGroups?: string[]     // กลุ่มงานที่ผูกไว้ (many-to-many ผ่าน kpi_work_groups) — docs/kpi-work-groups-plan.md
  sets?: KpiSetTag[]        // ชุด/ประเภทที่ผูกไว้ (many-to-many ผ่าน kpi_set_items) — docs/kpi-sets-plan.md K3
  measureType?: 'numeric' | 'text' | 'level'  // ชนิดการวัด (default 'numeric') · 'text'=ข้อความ ไม่ประเมิน · 'level'=ระดับ เรียงลำดับ ตัดสินผ่าน/ไม่ผ่าน — column measure_type (L1/L1b)
  textOptions?: string | null       // text=ตัวเลือก dropdown · level=ระดับเรียงต่ำ→สูง (บรรทัดละ 1) — column text_options · เป้าของ level = kpi.target (index 1-based ของระดับที่ถือว่าผ่าน)
  reportFreq?: 'monthly' | 'quarterly' // รอบส่ง/ความถี่เตือน (default 'monthly') — column report_freq (L4)
                                       // ⚠️ ข้อมูลเก็บ "รายเดือน" เสมอทั้ง 2 แบบ · 'quarterly' แค่บอกว่าส่งเป็นรอบไตรมาส (เตือนตอนเดือนปิดไตรมาส) · ดู lib/fiscalQuarter.ts
  ratePer?: number  // Phase 3: ตัวคูณ A/B ก่อนแสดงผล (manualScope='single' เท่านั้น) — 100=ร้อยละ (default) · 100000=ต่อแสนประชากร ฯลฯ — column rate_per
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
  valueText?: string | null   // ผลงานข้อความ (เมื่อ KPI measure_type='text') — column monthly_data.value_text (L1)
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

// ── Phase 4: Executive Scorecard evaluation ─────────────────────────────────
// EvalDirection: ทิศทางการประเมิน KPI
//   gte = ยิ่งมากยิ่งดี (value >= target ผ่าน)
//   lte = ยิ่งน้อยยิ่งดี (value <= target ผ่าน — รองรับ target=0 เช่น เสียชีวิต 0)
//   eq  = ต้องเท่ากับเป้า (|value - target| < tolerance)
//   none = ไม่ประเมิน / ติดตามเฉยๆ (noTarget)
export type EvalDirection = 'gte' | 'lte' | 'eq' | 'none'

// KpiEvalStatus: สถานะประเมินรายเดือน (Phase 4)
//   pass/watch/fail = ประเมินได้ (อยู่ในตัวหาร passRate)
//   no_data      = value=null ไม่มีข้อมูลเดือนนั้น (แยกจาก fail)
//   no_target    = direction='none' ติดตามเฉยๆ ไม่ประเมิน
//   invalid      = target<0 หรือ value=NaN (ข้อมูลผิด)
//   needs_review = target=0 + direction='gte' (เป้ากำกวม ผ่านเสมอ — ต้องตรวจสอบ)
//   narrative    = measure_type='text' ผลงานเป็นข้อความ (ท้าทาย/อยู่ระหว่างดำเนินการ) ไม่ตัดสินผ่าน/ไม่ผ่าน — L1
export type KpiEvalStatus =
  | 'pass' | 'watch' | 'fail'
  | 'no_data' | 'no_target' | 'invalid' | 'needs_review'
  | 'narrative'

/** ผลการประเมิน KPI หนึ่งตัวสำหรับเดือนหนึ่ง — pure ไม่มี side-effect */
export interface KpiEvalResult {
  status: KpiEvalStatus
  message?: string                   // คำอธิบาย (เช่น "ตรวจสอบเป้าหมาย KPI")
}
