'use client'

import { useEffect, useMemo, useState } from 'react'
import Navbar from '@/components/Navbar'
import FieldChipBuilder, { isBlockedFieldType } from '@/components/FieldChipBuilder'
import KpiWizard from '@/components/KpiWizard'
import WorkGroupManager from '@/components/WorkGroupManager'
import KpiSetManager from '@/components/KpiSetManager'
import WorkGroupPicker from '@/components/WorkGroupPicker'
import KpiSetPicker from '@/components/KpiSetPicker'
import ThaiMonthInput from '@/components/ThaiMonthInput'
import { useAuth } from '@/lib/useAuth'
import { formatThaiMonth } from '@/lib/formatMonth'
import { ratePerMismatch } from '@/lib/ratePerCheck'
import type { User, UserTitle, KPIReport, KPIStatus, KPICategory, MophMapping, CalcMode, EvalDirection } from '@/lib/types'

// หมวดหมู่จะถูกโหลดจาก DB ผ่าน /api/categories (ดูใน state)
const STATUSES: KPIStatus[] = ['in_progress', 'completed', 'overdue']
const STATUS_TH: Record<KPIStatus, string> = {
  in_progress: 'กำลังดำเนินการ',
  completed: 'ดำเนินการเสร็จแล้ว',
  overdue: 'เกินระยะเวลา',
}
const CALC_MODES = [
  { value: 'percent', label: 'ร้อยละ (valueField/targetField × 100)' },
  { value: 'sum', label: 'ผลรวม (sum valueField)' },
  { value: 'raw', label: 'ค่าดิบ (ค่าแรกที่พบ)' },
  { value: 'noTarget', label: 'ติดตามเฉยๆ (ไม่ประเมินผ่าน/ไม่ผ่าน)' },
]

// Phase 4: ทิศทางการประเมิน KPI (evaluation_direction)
const DIRECTIONS: { value: EvalDirection; label: string }[] = [
  { value: 'gte',  label: '≥ ยิ่งมากยิ่งดี (ผ่านเมื่อ value ≥ เป้า)' },
  { value: 'lte',  label: '≤ ยิ่งน้อยยิ่งดี (ผ่านเมื่อ value ≤ เป้า เช่น เสียชีวิต 0)' },
  { value: 'eq',   label: '= ต้องเท่ากับเป้า' },
  { value: 'none', label: '– ไม่ประเมิน / ติดตามเฉยๆ' },
]

// Buddhist year list (2567-2569)
const BY_YEARS = ['2569', '2568', '2567', '2566', '2565']

// เกณฑ์ badge "สด/เก่า" ของ "ดึงล่าสุด" — cron รายวัน (07:00) → เผื่อ ~1 รอบ + slack (30 ชม.)
// ปรับที่นี่ถ้าเปลี่ยนความถี่ cron (เช่น รายชั่วโมง = ลดลง)
const FRESH_THRESHOLD_HOURS = 30

// Table names ที่รู้จัก (quick-pick — ใช้ทั้ง MOPH tab และ KpiWizard)
const KNOWN_TABLES: [string, string][] = [
  ['s_dm_control', 'เบาหวาน - ควบคุมได้ (hba1c/result)'],
  ['s_ht_control', 'ความดัน - ควบคุมได้'],
  ['s_dm_ckd', 'เบาหวาน - ภาวะแทรกซ้อนไต'],
  ['s_dm_hba1c', 'เบาหวาน - HbA1c (ทดสอบ)'],
  ['s_anc', 'ฝากครรภ์ (ทดสอบก่อนใช้)'],
  ['s_child', 'เด็ก - ส่วนสูง/น้ำหนัก'],
  ['s_tb_success', 'วัณโรค (ทดสอบก่อนใช้)'],
  ['s_hiv_arv', 'HIV ARV (ทดสอบก่อนใช้)'],
]

// Province codes
const PROVINCES = [
  { code: '66', name: 'พิจิตร' },
  { code: '10', name: 'กรุงเทพมหานคร' },
  { code: '11', name: 'สมุทรปราการ' },
  { code: '12', name: 'นนทบุรี' },
  { code: '13', name: 'ปทุมธานี' },
  { code: '14', name: 'พระนครศรีอยุธยา' },
  { code: '15', name: 'อ่างทอง' },
  { code: '16', name: 'ลพบุรี' },
  { code: '17', name: 'สิงห์บุรี' },
  { code: '18', name: 'ชัยนาท' },
  { code: '19', name: 'สระบุรี' },
  { code: '20', name: 'ชลบุรี' },
  { code: '21', name: 'ระยอง' },
  { code: '22', name: 'จันทบุรี' },
  { code: '23', name: 'ตราด' },
  { code: '24', name: 'ฉะเชิงเทรา' },
  { code: '25', name: 'ปราจีนบุรี' },
  { code: '26', name: 'นครนายก' },
  { code: '27', name: 'สระแก้ว' },
  { code: '30', name: 'นครราชสีมา' },
  { code: '31', name: 'บุรีรัมย์' },
  { code: '32', name: 'สุรินทร์' },
  { code: '33', name: 'ศรีสะเกษ' },
  { code: '34', name: 'อุบลราชธานี' },
  { code: '35', name: 'ยโสธร' },
  { code: '36', name: 'ชัยภูมิ' },
  { code: '37', name: 'อำนาจเจริญ' },
  { code: '38', name: 'บึงกาฬ' },
  { code: '39', name: 'หนองบัวลำภู' },
  { code: '40', name: 'ขอนแก่น' },
  { code: '41', name: 'อุดรธานี' },
  { code: '42', name: 'เลย' },
  { code: '43', name: 'หนองคาย' },
  { code: '44', name: 'มหาสารคาม' },
  { code: '45', name: 'ร้อยเอ็ด' },
  { code: '46', name: 'กาฬสินธุ์' },
  { code: '47', name: 'สกลนคร' },
  { code: '48', name: 'นครพนม' },
  { code: '49', name: 'มุกดาหาร' },
  { code: '50', name: 'เชียงใหม่' },
  { code: '51', name: 'ลำพูน' },
  { code: '52', name: 'ลำปาง' },
  { code: '53', name: 'อุตรดิตถ์' },
  { code: '54', name: 'แพร่' },
  { code: '55', name: 'น่าน' },
  { code: '56', name: 'พะเยา' },
  { code: '57', name: 'เชียงราย' },
  { code: '58', name: 'แม่ฮ่องสอน' },
  { code: '60', name: 'นครสวรรค์' },
  { code: '61', name: 'อุทัยธานี' },
  { code: '62', name: 'กำแพงเพชร' },
  { code: '63', name: 'ตาก' },
  { code: '64', name: 'สุโขทัย' },
  { code: '65', name: 'พิษณุโลก' },
  { code: '67', name: 'เพชรบูรณ์' },
  { code: '70', name: 'ราชบุรี' },
  { code: '71', name: 'กาญจนบุรี' },
  { code: '72', name: 'สุพรรณบุรี' },
  { code: '73', name: 'นครปฐม' },
  { code: '74', name: 'สมุทรสาคร' },
  { code: '75', name: 'สมุทรสงคราม' },
  { code: '76', name: 'เพชรบุรี' },
  { code: '77', name: 'ประจวบคีรีขันธ์' },
  { code: '80', name: 'นครศรีธรรมราช' },
  { code: '81', name: 'กระบี่' },
  { code: '82', name: 'พังงา' },
  { code: '83', name: 'ภูเก็ต' },
  { code: '84', name: 'สุราษฎร์ธานี' },
  { code: '85', name: 'ระนอง' },
  { code: '86', name: 'ชุมพร' },
  { code: '90', name: 'สงขลา' },
  { code: '91', name: 'สตูล' },
  { code: '92', name: 'ตรัง' },
  { code: '93', name: 'พัทลุง' },
  { code: '94', name: 'ปัตตานี' },
  { code: '95', name: 'ยะลา' },
  { code: '96', name: 'นราธิวาส' },
]

// ฟอร์มเก็บ sets เป็น write-shape { setId, setCode } (ต่างจาก KPIReport.sets ที่เป็น read-shape KpiSetTag[])
// เพราะ picker/PUT ใช้ setId+setCode ส่วนตาราง/GET ใช้ id/name/slug
type KpiFormState = Omit<KPIReport, 'id' | 'sets'> & { sets: { setId: number; setCode: string; targetRegion?: string; targetProvince?: string; targetHospital?: string }[] }

function emptyForm(): KpiFormState {
  return { name: '', category: '', mophUrl: '', mophTable: '', mophValueField: '', mophTargetField: 'target', mophCalcMode: 'percent', direction: 'gte', manualEntry: false, manualScope: 'unit', dataSource: 'HDC', measureType: 'numeric', textOptions: '', workGroups: [], sets: [], owner: '', deadline: '', status: 'in_progress', target: 0, unit: '%', description: '', ratePer: 100 }
}

interface MophPreview {
  ok: boolean; rows: number; fields: string[]; sample: Record<string, unknown>[]
  sumValue?: number; sumTarget?: number | null; calcValue?: number | null; calcMode?: string; savedMonth?: string | null
  fieldTypes?: Record<string, string>
  evaluated?: boolean
  warnings?: string[]
  errors?: string[]
  message?: string
}

interface BatchResult {
  ok: boolean; savedMonth?: string; total?: number; saved?: number; skipped?: number; failed?: number; message?: string
  results?: {
    kpiId?: string; kpiName?: string
    reportId?: string; reportName?: string
    status: 'ok' | 'error' | 'skipped'; calcValue?: number; rows?: number; error?: string
    skipReason?: string
    warnings?: string[]
  }[]
}

interface CronStatus {
  ok: boolean
  lastRun: string | null
  latestMonth: string | null
  currentMonth: string
  currentMonthKpiCount: number
  autoKpiCount: number
  missingKpis: string[]
  cronLastRun: string | null
  cronLastSaved: number | null
  cronLastTotal: number | null
  cronLastFailed: number | null
  cronExpr: string
  cronTz: string
  cronDisabled: boolean
  message?: string
}

export default function AdminPage() {
  const { user } = useAuth({ requireAdmin: true })
  const [kpis, setKpis] = useState<KPIReport[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [tab, setTab] = useState<'kpi' | 'users' | 'moph' | 'db'>('kpi')
  const [showForm, setShowForm] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [editKPI, setEditKPI] = useState<KPIReport | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [msg, setMsg] = useState({ text: '', type: 'success' as 'success' | 'error' })
  const [loading, setLoading] = useState(true)
  const [dbStatus, setDbStatus] = useState<{ ok: boolean; counts?: { users: number; kpis: number; monthly: number; catalog: number; snapshot: number }; message?: string } | null>(null)
  const [dbInfo, setDbInfo] = useState<{ host: string; port: number; database: string; label: string } | null>(null)
  const [cronStatus, setCronStatus] = useState<CronStatus | null>(null)

  // MOPH state
  const [mophKpiId, setMophKpiId] = useState('')
  const [mophTable, setMophTable] = useState('')
  const [mophYear, setMophYear] = useState('2569')
  const [mophProvince, setMophProvince] = useState('66')
  const [mophHospcode, setMophHospcode] = useState('')
  const [mophAreacode, setMophAreacode] = useState('6611')  // จังหวัด66 + อำเภอ11
  const [mophCalcMode, setMophCalcMode] = useState('percent')
  const [mophMonth, setMophMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [mophPreview, setMophPreview] = useState<MophPreview | null>(null)
  const [mophLoading, setMophLoading] = useState(false)
  const [mophSaveKpiId, setMophSaveKpiId] = useState('')
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null)
  const [batchLoading, setBatchLoading] = useState(false)
  const [pullingKpiId, setPullingKpiId] = useState<string | null>(null)  // KPI ที่กำลังดึงรายตัว (ปุ่ม 🔄 ในตาราง)

  // Mapping Builder state (Phase 2)
  const [mophFieldMode, setMophFieldMode] = useState<'singleField' | 'sumFields'>('singleField')
  const [mophValueFields, setMophValueFields] = useState<string[]>(['result'])
  const [mophDenomFields, setMophDenomFields] = useState<string[]>(['target'])
  const [mappingSaved, setMappingSaved] = useState(false)
  const [mappingDirty, setMappingDirty] = useState(false)

  // Categories state — { name, groupName } เพื่อจัดกลุ่มหลัก/หมวดย่อย (docs/kpi-category-mapping-2569.md)
  const [categories, setCategories] = useState<{ name: string; groupName: string | null }[]>([])
  const [newCatInput, setNewCatInput] = useState('')
  const [newCatGroupInput, setNewCatGroupInput] = useState('')

  // ชื่อหมวดหมู่ล้วน (สำหรับ dropdown ทั่วไป — ฟอร์มแก้ไข KPI, KpiWizard)
  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories])
  // กลุ่มหลักที่มีอยู่แล้ว (สำหรับ datalist ตอนเพิ่มหมวดหมู่ใหม่)
  const existingGroupNames = useMemo(
    () => Array.from(new Set(categories.map((c) => c.groupName).filter((g): g is string => !!g))),
    [categories],
  )
  // จัดกลุ่ม categories ตาม groupName สำหรับแสดงผล
  const categoryGroups = useMemo(() => {
    const map = new Map<string, { name: string; groupName: string | null }[]>()
    for (const cat of categories) {
      const key = cat.groupName ?? 'ยังไม่ระบุกลุ่มหลัก'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(cat)
    }
    return Array.from(map.entries())
  }, [categories])

  // User management state
  const [showUserForm, setShowUserForm] = useState(false)
  const [userForm, setUserForm] = useState({ email: '', name: '', password: '', role: 'staff' as 'admin' | 'staff', title: '' as '' | UserTitle, department: '' })
  const [changePwModal, setChangePwModal] = useState<{ user: User; newPw: string } | null>(null)
  // กลุ่มงานสำหรับ dropdown "หน่วยงาน" — users.department ผูก FK → work_groups.name แล้ว (Phase E)
  const [workGroupOptions, setWorkGroupOptions] = useState<string[]>([])

  useEffect(() => {
    if (!user) return
    loadData()
    fetch('/api/dbinfo').then((r) => r.json()).then(setDbInfo).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadData() {
    setLoading(true)
    const [kRes, uRes, catRes, wgRes] = await Promise.all([
      fetch('/api/kpis'), fetch('/api/users'), fetch('/api/categories?detail=1'), fetch('/api/work-groups'),
    ])
    const kData = await kRes.json()
    setKpis(kData)
    if (uRes.ok) setUsers(await uRes.json())
    if (catRes.ok) setCategories(await catRes.json())
    if (wgRes.ok) setWorkGroupOptions((await wgRes.json()).map((g: { name: string }) => g.name))
    setLoading(false)
    // auto-fill moph fields from first KPI that has mophTable
    const withMoph = kData.find((k: KPIReport) => k.mophTable)
    if (withMoph && !mophTable) {
      setMophKpiId(withMoph.id)
      setMophTable(withMoph.mophTable || '')
      setMophValueFields([withMoph.mophValueField || 'result'])
      setMophDenomFields([withMoph.mophTargetField || 'target'])
      setMophCalcMode(withMoph.mophCalcMode || 'percent')
    }
  }

  function showMsg(text: string, type: 'success' | 'error' = 'success') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: 'success' }), 5000)
  }

  function openEdit(kpi: KPIReport) {
    setEditKPI(kpi)
    setForm({
      name: kpi.name, category: kpi.category,
      mophUrl: kpi.mophUrl ?? '', mophTable: kpi.mophTable ?? '',
      mophValueField: kpi.mophValueField ?? '', mophTargetField: kpi.mophTargetField ?? 'target',
      mophCalcMode: kpi.mophCalcMode ?? 'percent',
      direction: kpi.direction ?? 'gte',
      manualEntry: kpi.manualEntry ?? false,
      manualScope: kpi.manualScope ?? 'unit',
      dataSource: kpi.dataSource ?? 'HDC',
      measureType: kpi.measureType ?? 'numeric',
      textOptions: kpi.textOptions ?? '',
      workGroups: kpi.workGroups ?? [],
      sets: (kpi.sets ?? []).map((s) => ({ setId: s.id, setCode: s.setCode ?? '',
        targetRegion: s.targetRegion ?? '', targetProvince: s.targetProvince ?? '', targetHospital: s.targetHospital ?? '' })),
      owner: kpi.owner, deadline: kpi.deadline, status: kpi.status,
      target: kpi.target, unit: kpi.unit, description: kpi.description ?? '',
      // DECIMAL column กลับมาเป็น string จาก mysql2 (เช่น "100000.00") — <select> match ด้วย string เป๊ะ
      // ไม่ตรงกับ <option value={100000}> ต้อง Number() ก่อนเสมอ ไม่งั้น dropdown เด้งกลับตัวเลือกแรกเงียบๆ
      ratePer: Number(kpi.ratePer) || 100,
    })
    setShowForm(true)
  }

  async function saveForm() {
    if (!form.name || !form.owner || !form.deadline) { showMsg('กรุณากรอกข้อมูลที่จำเป็น', 'error'); return }
    const res = editKPI
      ? await fetch(`/api/kpis/${editKPI.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      : await fetch('/api/kpis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (!res.ok) { const d = await res.json(); showMsg(d.message, 'error'); return }
    await loadData(); setShowForm(false)
    showMsg(editKPI ? 'แก้ไข KPI สำเร็จ' : 'เพิ่ม KPI สำเร็จ')
  }

  async function deleteKPI(id: string) {
    if (!confirm('ยืนยันการลบ KPI?')) return
    const res = await fetch(`/api/kpis/${id}`, { method: 'DELETE' })
    if (res.ok) { await loadData(); showMsg('ลบ KPI สำเร็จ') }
    else showMsg('ลบไม่สำเร็จ', 'error')
  }

  // ─── User management ────────────────────────────────────────────────────
  function openAddUser() {
    setUserForm({ email: '', name: '', password: '', role: 'staff', title: '', department: '' })
    setShowUserForm(true)
  }

  async function saveUser() {
    if (!userForm.email || !userForm.name || !userForm.password) {
      showMsg('กรุณากรอก email, ชื่อ และรหัสผ่าน', 'error'); return
    }
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userForm),
    })
    const data = await res.json()
    if (!res.ok) { showMsg(data.message, 'error'); return }
    setShowUserForm(false)
    showMsg('เพิ่มผู้ใช้สำเร็จ')
    const uRes = await fetch('/api/users')
    setUsers(await uRes.json())
  }

  async function deleteUser(id: string, name: string) {
    if (!confirm(`ลบผู้ใช้ "${name}"?\nการกระทำนี้ไม่สามารถย้อนกลับได้`)) return
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { showMsg(data.message, 'error'); return }
    setUsers((prev) => prev.filter((u) => u.id !== id))
    showMsg('ลบผู้ใช้สำเร็จ')
  }

  async function confirmChangePassword() {
    if (!changePwModal) return
    if (!changePwModal.newPw) { showMsg('กรุณากรอกรหัสผ่านใหม่', 'error'); return }
    const res = await fetch(`/api/users/${changePwModal.user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: changePwModal.newPw }),
    })
    const data = await res.json()
    if (!res.ok) { showMsg(data.message, 'error'); return }
    setChangePwModal(null)
    showMsg(`เปลี่ยนรหัสผ่านของ "${changePwModal.user.name}" สำเร็จ`)
  }

  // ─── Category management ─────────────────────────────────────────────────
  async function addCategory() {
    const name = newCatInput.trim()
    if (!name) return
    const groupName = newCatGroupInput.trim() || null
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, groupName }),
    })
    const data = await res.json()
    if (!res.ok) { showMsg(data.message, 'error'); return }
    setCategories((prev) => [...prev, { name, groupName }])
    setNewCatInput('')
    setNewCatGroupInput('')
    showMsg(`เพิ่มหมวดหมู่ "${name}" สำเร็จ`)
  }

  async function deleteCategory(name: string) {
    const res = await fetch(`/api/categories?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { showMsg(data.message, 'error'); return }
    setCategories((prev) => prev.filter((c) => c.name !== name))
    showMsg(`ลบหมวดหมู่ "${name}" สำเร็จ`)
  }

  async function changeStatus(kpi: KPIReport, status: KPIStatus) {
    await fetch(`/api/kpis/${kpi.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    setKpis((prev) => prev.map((k) => k.id === kpi.id ? { ...k, status } : k))
  }

  // ดึงข้อมูล MOPH ของ KPI ตัวเดียวจากตาราง (reuse runBatchSave ผ่าน /api/moph/batch {kpiId})
  // ใช้ scope เดียวกับแท็บ MOPH (ปี/จังหวัด/อำเภอ/เดือน) — เขียน monthly_data+detail จริง แต่ idempotent
  async function pullSingleKpi(kpi: KPIReport) {
    if (!confirm(`ดึงข้อมูล MOPH เดือน ${mophMonth} ของ "${kpi.name.slice(0, 40)}" แล้วบันทึกทับค่าเดิมของเดือนนี้เลยหรือไม่?`)) return
    setPullingKpiId(kpi.id)
    try {
      const res = await fetch('/api/moph/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kpiId: kpi.id, year: mophYear, province: mophProvince,
          areacode: mophAreacode || undefined,
          hospcode: mophHospcode || undefined,
          month: mophMonth,
        }),
      })
      const data: BatchResult = await res.json()
      const r = data.results?.[0]
      if (data.ok && r?.status === 'ok') {
        showMsg(`ดึง "${kpi.name.slice(0, 30)}" เดือน ${data.savedMonth} สำเร็จ — ค่า ${r.calcValue}`)
      } else if (r?.status === 'skipped') {
        showMsg(`ข้าม: ${r.skipReason ?? 'ไม่ระบุเหตุผล'}`, 'error')
      } else {
        showMsg(r?.error || data.message || 'ดึงไม่สำเร็จ', 'error')
      }
    } catch (e) {
      showMsg(String(e), 'error')
    } finally {
      setPullingKpiId(null)
    }
  }

  async function initDb() {
    if (!confirm(`ยืนยันรัน Migrate & Seed บนฐานข้อมูล "${dbInfo?.database ?? ''}" (${dbInfo?.label ?? ''})?\n\nสร้างตาราง + seed ข้อมูลเริ่มต้นที่ยังไม่มี (ไม่ทับ/ไม่ลบข้อมูลเดิม)`)) return
    const res = await fetch('/api/init', { method: 'POST' })
    const data = await res.json()
    if (res.ok) { showMsg('สร้างตาราง + Seed สำเร็จ'); await loadData() }
    else showMsg(data.message, 'error')
    checkDb()
  }

  async function checkDb() {
    const res = await fetch('/api/init')
    setDbStatus(await res.json())
  }

  async function loadCronStatus() {
    try {
      const res = await fetch('/api/cron-status')
      setCronStatus(await res.json())
    } catch { /* non-critical — แท็บยังใช้ได้ */ }
  }

  // MOPH functions
  async function onMophKpiChange(kpiId: string) {
    setMophKpiId(kpiId)
    setMophPreview(null)
    setMappingSaved(false)
    setMappingDirty(false)
    const kpi = kpis.find((k) => k.id === kpiId)
    if (kpi?.mophTable) {
      setMophTable(kpi.mophTable)
      const vf = kpi.mophValueField || 'result'
      const tf = kpi.mophTargetField || 'target'
      const cm = kpi.mophCalcMode || 'percent'
      setMophCalcMode(cm)
      // Phase 2: โหลด mophConfig จาก DB (non-blocking — fallback legacy column ถ้าไม่มี/error)
      try {
        const res = await fetch(`/api/kpis/${kpiId}`)
        if (res.ok) {
          const data = await res.json()
          if (data.mophConfig) {
            const cfg: MophMapping = data.mophConfig
            setMophFieldMode(cfg.fieldMode === 'sumFields' ? 'sumFields' : 'singleField')
            setMophValueFields(Array.isArray(cfg.valueFields) && cfg.valueFields.length > 0 ? cfg.valueFields : [vf])
            setMophDenomFields(
              cfg.targetMode === 'field' && Array.isArray(cfg.targetFields) && cfg.targetFields.length > 0
                ? cfg.targetFields
                : [tf],
            )
            setMophCalcMode(cfg.calcMode || cm)
            setMappingSaved(true)
          } else {
            // ยังไม่มี moph_config → ใช้ legacy
            setMophFieldMode('singleField')
            setMophValueFields([vf])
            setMophDenomFields([tf])
          }
        }
      } catch {
        // error → fallback legacy (non-critical, ไม่แจ้งผู้ใช้)
        setMophFieldMode('singleField')
        setMophValueFields([vf])
        setMophDenomFields([tf])
      }
    } else {
      setMophFieldMode('singleField')
      setMophValueFields(['result'])
      setMophDenomFields(['target'])
    }
  }

  // opts.silent = ข้าม toast สำเร็จ (ใช้ตอนเรียกจาก mophBatchFetch กันข้อความซ้อนกับผล batch)
  // error ยังโชว์เสมอไม่ว่า silent — คืน true/false ให้ caller ตัดสินใจว่าจะดึงข้อมูลต่อไหม
  async function saveMophMapping(opts: { silent?: boolean } = {}): Promise<boolean> {
    if (!mophKpiId) { showMsg('กรุณาเลือก KPI ก่อน', 'error'); return false }
    const trimmedVF = mophValueFields.map((f) => f.trim()).filter(Boolean)
    if (trimmedVF.length === 0) { showMsg('กรุณาระบุ Value Field อย่างน้อย 1 field', 'error'); return false }
    if (mophCalcMode === 'percent' && mophDenomFields.filter((f) => f.trim()).length === 0) {
      showMsg('Calc Mode = percent ต้องระบุ Denominator Field อย่างน้อย 1 field', 'error'); return false
    }

    const mapping: MophMapping = {
      fieldMode:    mophFieldMode,
      valueFields:  trimmedVF,
      targetMode:   mophCalcMode === 'percent' ? 'field' : 'none',
      targetFields: mophCalcMode === 'percent' ? mophDenomFields.map((f) => f.trim()).filter(Boolean) : undefined,
      calcMode:     mophCalcMode as CalcMode,
      aggregate:    'sum',
    }

    const res = await fetch(`/api/kpis/${mophKpiId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mophConfig: mapping }),
    })
    if (res.ok) {
      setMappingSaved(true)
      setMappingDirty(false)
      if (!opts.silent) showMsg('🔒 บันทึก Mapping สำเร็จ — Batch/บันทึกลง DB จะใช้ config นี้')
      return true
    } else {
      const data = await res.json()
      showMsg(data.message || 'บันทึก Mapping ไม่สำเร็จ', 'error')
      return false
    }
  }

  async function deleteMonthlyEntry(kpiId: string, month: string, kpiName?: string) {
    if (!confirm(`ลบข้อมูลเดือน ${month}${kpiName ? `\n(${kpiName})` : ''}\nข้อมูลจะหายถาวร`)) return
    const res = await fetch(`/api/monthly?kpiId=${encodeURIComponent(kpiId)}&month=${encodeURIComponent(month)}`, { method: 'DELETE' })
    if (res.ok) {
      setBatchResult((prev) => prev
        ? { ...prev, results: prev.results?.filter((r) => r.kpiId !== kpiId), saved: Math.max(0, (prev.saved ?? 1) - 1) }
        : null
      )
      showMsg(`ลบข้อมูล ${month} สำเร็จ`)
    } else {
      showMsg('ลบไม่สำเร็จ', 'error')
    }
  }

  async function mophPreviewFetch() {
    if (!mophTable) { showMsg('กรุณาระบุ Table Name', 'error'); return }
    setMophLoading(true); setMophPreview(null)
    const params = new URLSearchParams({ tableName: mophTable, year: mophYear, province: mophProvince })
    if (mophHospcode) params.set('hospcode', mophHospcode)
    if (mophAreacode) params.set('areacode', mophAreacode)
    const res = await fetch(`/api/moph?${params}`)
    setMophPreview(await res.json())
    setMophLoading(false)
  }

  async function mophSave() {
    const kpiId = mophSaveKpiId || mophKpiId
    if (!kpiId) { showMsg('กรุณาเลือก KPI ที่จะบันทึก', 'error'); return }
    // ถ้ากำลังบันทึก KPI เดียวกับที่แก้ mapping อยู่บนจอและยังไม่ได้ Save → auto-save ก่อนเสมอ
    // (กัน POST /api/moph fallback ไปใช้ field เดียวจาก mophValueFields[0] แทนที่จะรวมทุก field ที่เลือกไว้)
    if (kpiId === mophKpiId && mappingDirty) {
      const ok = await saveMophMapping({ silent: true })
      if (!ok) return
    }
    setMophLoading(true)
    const res = await fetch('/api/moph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kpiId, tableName: mophTable, year: mophYear, province: mophProvince,
        hospcode: mophHospcode || undefined,
        areacode: mophAreacode || undefined,
        valueField: mophValueFields[0]?.trim() || 'result',
        targetField: mophDenomFields[0]?.trim() || 'target',
        calcMode: mophCalcMode, month: mophMonth,
      }),
    })
    const data: MophPreview = await res.json()
    setMophLoading(false)
    if (res.ok) {
      // คงตาราง preview เดิม (fields/sample/fieldTypes จาก GET) แล้ว overlay ผลคำนวณ
      setMophPreview((prev) => (prev ? { ...prev, ...data } : data))
      if (data.savedMonth) {
        showMsg(`บันทึกค่า ${data.calcValue} สำหรับเดือน ${data.savedMonth} สำเร็จ`)
      } else {
        showMsg('คำนวณเสร็จ แต่ไม่บันทึก (noTarget หรือ target=0)', 'error')
      }
    } else {
      // 400: คง preview เดิมไว้ แล้วแสดง errors/warnings เป็น banner
      setMophPreview((prev) =>
        prev ? { ...prev, warnings: data.warnings, errors: data.errors } : data)
      showMsg(data.message || 'เกิดข้อผิดพลาด', 'error')
    }
  }

  async function mophBatchFetch() {
    // batch อ่าน moph_config (mapping) จาก DB ของแต่ละ KPI เอง
    // → ถ้า KPI ที่กำลังแก้ mapping อยู่บนจอ (mophKpiId) ยังไม่ได้กด Save ให้ auto-save ก่อนดึงเสมอ
    if (mophKpiId && mappingDirty) {
      const ok = await saveMophMapping({ silent: true })
      if (!ok) return // mapping ไม่ผ่าน validation — showMsg แสดง error ไปแล้ว ไม่ดึงต่อ
    }

    setBatchLoading(true); setBatchResult(null)
    const res = await fetch('/api/moph/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: mophYear, province: mophProvince,
        hospcode: mophHospcode || undefined,
        areacode: mophAreacode || undefined,
        month: mophMonth,
      }),
    })
    const data: BatchResult = await res.json()
    setBatchResult(data)
    setBatchLoading(false)
    if (data.ok) showMsg(`บันทึกสำเร็จ ${data.saved}/${data.total} KPI สำหรับเดือน ${data.savedMonth}`)
    else showMsg(data.message || 'เกิดข้อผิดพลาด', 'error')
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">จัดการระบบ</h1>
          <p className="text-gray-500 text-sm mt-1">🗄️ MariaDB: {dbInfo ? `${dbInfo.host}:${dbInfo.port} / ${dbInfo.database} (${dbInfo.label})` : '...'}</p>
        </div>

        {msg.text && (
          <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {msg.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {([
            { key: 'kpi', label: `📋 KPI (${kpis.length})` },
            { key: 'moph', label: '🌐 ดึงข้อมูล MOPH' },
            { key: 'users', label: `👥 ผู้ใช้ (${users.length})` },
            { key: 'db', label: '🗄️ Database' },
          ] as { key: typeof tab; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => { setTab(key); if (key === 'db') { checkDb(); loadCronStatus() } }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-blue-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ===== KPI TAB ===== */}
        {tab === 'kpi' && (
          <>
            {/* Category Management */}
            <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">🏷️ จัดการหมวดหมู่</h3>
                <span className="text-xs text-gray-400">{categories.length} หมวดหมู่ · {existingGroupNames.length} กลุ่มหลัก</span>
              </div>
              {/* รายการหมวดหมู่ จัดกลุ่มตามกลุ่มหลัก */}
              <div className="space-y-3 mb-3">
                {categoryGroups.map(([groupName, cats]) => (
                  <div key={groupName}>
                    <div className="text-xs font-semibold text-gray-500 mb-1">{groupName}</div>
                    <div className="flex flex-wrap gap-2">
                      {cats.map((cat) => (
                        <span key={cat.name} className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full">
                          {cat.name}
                          <button
                            onClick={() => deleteCategory(cat.name)}
                            className="ml-0.5 text-blue-400 hover:text-red-500 transition-colors font-bold leading-none"
                            title={`ลบ ${cat.name}`}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {categories.length === 0 && (
                  <span className="text-xs text-gray-400 italic">ยังไม่มีหมวดหมู่ — กด Migrate &amp; Seed หรือเพิ่มด้านล่าง</span>
                )}
              </div>
              {/* เพิ่มหมวดหมู่ใหม่ */}
              <div className="flex gap-2">
                <input
                  value={newCatInput}
                  onChange={(e) => setNewCatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                  placeholder="ชื่อหมวดย่อยใหม่ เช่น เวชศาสตร์ครอบครัว"
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  list="category-group-list"
                  value={newCatGroupInput}
                  onChange={(e) => setNewCatGroupInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                  placeholder="กลุ่มหลัก (เลือกหรือพิมพ์ใหม่)"
                  className="w-56 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="category-group-list">
                  {existingGroupNames.map((g) => <option key={g} value={g} />)}
                </datalist>
                <button
                  onClick={addCategory}
                  disabled={!newCatInput.trim()}
                  className="bg-blue-800 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition-colors">
                  + เพิ่ม
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">ไม่ระบุกลุ่มหลัก = ปล่อยว่างได้ (จะไปอยู่ช่อง &quot;ยังไม่ระบุกลุ่มหลัก&quot;)</p>
            </div>

            <WorkGroupManager onMessage={showMsg} />

            <KpiSetManager onMessage={showMsg} />

            <div className="flex justify-end mb-4">
              <button onClick={() => setShowWizard(true)} className="bg-emerald-700 hover:bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg font-medium">🧭 เพิ่มตัวชี้วัด (ครบ flow)</button>
            </div>
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              {loading ? <div className="text-center py-16 text-gray-400">กำลังโหลด...</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">ชื่อ KPI</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">ผู้รับผิดชอบ</th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600">MOPH Table / แหล่งข้อมูล</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">สถานะ</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">การดำเนินการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {kpis.map((kpi) => (
                        <tr key={kpi.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900 text-xs line-clamp-2">{kpi.name}</p>
                            <p className="text-gray-400 text-xs">{kpi.category}</p>
                            {kpi.workGroups && kpi.workGroups.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {kpi.workGroups.map((g) => (
                                  <span key={g} className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-medium">{g}</span>
                                ))}
                              </div>
                            )}
                            {kpi.sets && kpi.sets.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {kpi.sets.map((s) => (
                                  <span key={s.id} className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                    🎯 {s.name}{s.setCode ? ` (${s.setCode})` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs hidden md:table-cell">{kpi.owner}</td>
                          <td className="px-4 py-3 text-center">
                            {kpi.mophTable
                              ? <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-mono">{kpi.mophTable}</span>
                              : <span className="text-gray-300 text-xs">ไม่ได้ตั้ง</span>}
                            <div className="mt-1">
                              <span className="bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded text-[10px] font-medium" title="แหล่งที่มาข้อมูล">
                                📊 {kpi.dataSource ?? 'HDC'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <select value={kpi.status} onChange={(e) => changeStatus(kpi, e.target.value as KPIStatus)}
                              className="text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500">
                              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_TH[s]}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-right space-x-1">
                            {kpi.mophTable && !kpi.manualEntry && (
                              <button onClick={() => pullSingleKpi(kpi)}
                                disabled={pullingKpiId === kpi.id}
                                title={`ดึงข้อมูลเดือน ${mophMonth} (area ${mophAreacode || 'ทั้งจังหวัด'})`}
                                className="text-indigo-600 hover:text-indigo-800 disabled:opacity-40 text-xs font-medium px-2 py-1 rounded hover:bg-indigo-50">
                                {pullingKpiId === kpi.id ? '⏳' : '🔄'}
                              </button>
                            )}
                            <button onClick={() => { onMophKpiChange(kpi.id); setTab('moph') }}
                              className="text-green-600 hover:text-green-800 text-xs font-medium px-2 py-1 rounded hover:bg-green-50">🌐</button>
                            <button onClick={() => openEdit(kpi)}
                              className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 rounded hover:bg-blue-50">แก้ไข</button>
                            <button onClick={() => deleteKPI(kpi.id)}
                              className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50">ลบ</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ===== MOPH TAB ===== */}
        {tab === 'moph' && (
          <div className="space-y-5">
            {/* Config */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="font-semibold text-gray-800 mb-4">🌐 ดึงข้อมูลจาก MOPH Open Data API</h2>
              <p className="text-xs text-gray-500 mb-4">Endpoint: <code className="bg-gray-100 px-1 rounded">POST https://opendata.moph.go.th/api/report_data</code></p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">KPI (auto-fill config)</label>
                  <select value={mophKpiId} onChange={(e) => onMophKpiChange(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">-- เลือก KPI --</option>
                    {kpis.map((k) => <option key={k.id} value={k.id}>{k.name.slice(0, 50)}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Table Name <span className="text-red-500">*</span></label>
                  <input value={mophTable} onChange={(e) => setMophTable(e.target.value)}
                    placeholder="เช่น s_dm_hba1c, s_dm_control"
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">ปีงบประมาณ (พ.ศ.)</label>
                  <select value={mophYear} onChange={(e) => setMophYear(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {BY_YEARS.map((y) => <option key={y}>{y}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">จังหวัด (Province Code)</label>
                  <select value={mophProvince} onChange={(e) => setMophProvince(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {PROVINCES.map((p) => <option key={p.code} value={p.code}>{p.code} - {p.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">
                    รหัสอำเภอ <span className="text-gray-400 font-normal">(areacode prefix เช่น จ.66 อ.11 → <code>6611</code>)</span>
                  </label>
                  <div className="flex gap-2 items-center">
                    <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-2 rounded-lg border">{mophProvince}</span>
                    <span className="text-gray-400">+</span>
                    <input value={mophAreacode.replace(mophProvince, '')}
                      onChange={(e) => setMophAreacode(mophProvince + e.target.value.replace(/\D/g, '').slice(0, 2))}
                      placeholder="11"
                      maxLength={2}
                      className="w-20 border rounded-lg px-3 py-2 text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <span className="text-xs text-gray-400">→ prefix: <strong>{mophAreacode || '(ทั้งจังหวัด)'}</strong></span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">
                    Hospcode <span className="text-gray-400 font-normal">(เว้นว่าง = ไม่กรอง)</span>
                  </label>
                  <input value={mophHospcode} onChange={(e) => setMophHospcode(e.target.value)}
                    placeholder="เช่น 27980 (ถ้าต้องการ)"
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">วิธีคำนวณ</label>
                  <select value={mophCalcMode}
                    onChange={(e) => { setMophCalcMode(e.target.value); if (mophKpiId) setMappingDirty(true) }}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {CALC_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              {/* ─── Mapping Builder (Phase 2) — ทางเดียวในการตั้ง field ───────── */}
              <div className="mt-5 border-t pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    🗺️ Mapping Builder
                    {mappingSaved && !mappingDirty && (
                      <span className="text-green-600 text-xs font-normal">🔒 Mapping บันทึกแล้ว</span>
                    )}
                    {mappingDirty && (
                      <span className="text-orange-500 text-xs font-normal animate-pulse">● ยังไม่ได้บันทึก</span>
                    )}
                    {!mappingSaved && !mappingDirty && mophKpiId && (
                      <span className="text-gray-400 text-xs font-normal">(ยังไม่มี Mapping — field ด้านล่างเป็นค่าเริ่มต้น/ค่าที่เคยตั้งไว้ ถ้ามี — ตรวจก่อนกด Save)</span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-400">กำหนด field → Save → Batch/บันทึกลง DB จะใช้ config นี้</p>
                </div>

                {/* Field Mode radio */}
                <div className="flex gap-6 mb-4">
                  {([
                    { val: 'singleField' as const, label: 'Single Field', desc: 'field เดียว (ปกติ)' },
                    { val: 'sumFields'   as const, label: 'Sum Fields',   desc: 'รวมหลาย field (DSPM ฯลฯ)' },
                  ] as { val: 'singleField' | 'sumFields'; label: string; desc: string }[]).map(({ val, label, desc }) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="mophFieldMode" value={val}
                        checked={mophFieldMode === val}
                        onChange={() => {
                          setMophFieldMode(val)
                          if (val === 'singleField') {
                            setMophValueFields((prev) => prev.slice(0, 1))
                            setMophDenomFields((prev) => prev.slice(0, 1))
                          }
                          if (mophKpiId) setMappingDirty(true)
                        }}
                        className="accent-blue-700" />
                      <span className="text-sm text-gray-700">
                        {label} <span className="text-xs text-gray-400">({desc})</span>
                      </span>
                    </label>
                  ))}
                </div>

                {/* Legend สี field type — ใช้กับ chip ที่คลิกได้ทั้งสองคอลัมน์ด้านล่าง */}
                <div className="flex flex-wrap gap-3 mb-3 text-xs text-gray-400">
                  <span>คลิก field ด้านล่างเพื่อเพิ่ม/ถอด</span>
                  <span className="text-gray-300">|</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-gray-400 mr-1"></span>measure</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>target</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1"></span>time</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span>dimension (ห้ามใช้)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Numerator */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-2 block">
                      ตัวเศษ (Numerator){' '}
                      {mophFieldMode === 'sumFields' && (
                        <span className="text-blue-600 font-normal">— เลือกได้หลาย field</span>
                      )}
                    </label>
                    <FieldChipBuilder
                      fields={mophValueFields}
                      onChange={(fs) => { setMophValueFields(fs); if (mophKpiId) setMappingDirty(true) }}
                      availableFields={mophPreview?.fields ?? []}
                      fieldTypes={mophPreview?.fieldTypes ?? {}}
                      color="blue"
                      placeholder="พิมพ์ชื่อ field แล้ว Enter..."
                      multiSelect={mophFieldMode === 'sumFields'}
                    />
                  </div>

                  {/* Denominator — only percent */}
                  {mophCalcMode === 'percent' && (
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-2 block">
                        ตัวส่วน (Denominator){' '}
                        {mophFieldMode === 'sumFields' && (
                          <span className="text-green-600 font-normal">— เลือกได้หลาย field</span>
                        )}
                      </label>
                      <FieldChipBuilder
                        fields={mophDenomFields}
                        onChange={(fs) => { setMophDenomFields(fs); if (mophKpiId) setMappingDirty(true) }}
                        availableFields={mophPreview?.fields ?? []}
                        fieldTypes={mophPreview?.fieldTypes ?? {}}
                        color="green"
                        placeholder="พิมพ์ชื่อ field แล้ว Enter..."
                        multiSelect={mophFieldMode === 'sumFields'}
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={() => saveMophMapping()}
                  disabled={!mophKpiId || !mappingDirty}
                  className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    !mophKpiId || !mappingDirty
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-700 hover:bg-blue-600 text-white'
                  }`}>
                  🔒 Save Mapping to KPI
                </button>
              </div>

              <div className="flex flex-wrap gap-3 mt-4">
                <button onClick={mophPreviewFetch} disabled={mophLoading}
                  className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-400 text-white text-sm px-4 py-2 rounded-lg">
                  {mophLoading ? 'กำลังดึง...' : '🔍 Preview (ไม่บันทึก)'}
                </button>
                <button onClick={mophBatchFetch} disabled={batchLoading || mophLoading}
                  className="bg-indigo-700 hover:bg-indigo-600 disabled:bg-indigo-400 text-white text-sm px-4 py-2 rounded-lg font-medium">
                  {batchLoading ? '⏳ กำลังดึงทั้งหมด...' : '🚀 ดึงข้อมูลทั้งหมด (Batch Save)'}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">Batch Save: ดึงและบันทึกให้ทุก KPI ที่ตั้งค่า MOPH Table ไว้ — ใช้ <strong className="text-gray-600">Mapping ที่บันทึกไว้ของแต่ละ KPI</strong> + ปี/จังหวัด/อำเภอ/เดือนด้านบน (ถ้า KPI ที่กำลังแก้อยู่ยังไม่ได้กด Save Mapping จะบันทึกให้อัตโนมัติก่อนดึง)</p>
            </div>

            {/* Preview Result */}
            {mophPreview && (
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="font-semibold text-gray-800 mb-3">
                  {mophPreview.ok ? '✅ ผลการดึงข้อมูล' : '❌ เกิดข้อผิดพลาด'}
                </h3>

                {!mophPreview.ok ? (
                  <p className="text-red-600 text-sm">{mophPreview.message}</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <InfoBox label="จำนวน rows" value={String(mophPreview.rows)} />
                      <InfoBox label="Sum ValueField" value={String(mophPreview.sumValue ?? '-')} />
                      <InfoBox label="Sum TargetField" value={String(mophPreview.sumTarget ?? '-')} />
                      <InfoBox label="ค่าที่คำนวณได้" value={`${mophPreview.calcValue ?? '-'}`} highlight />
                    </div>

                    {/* Error banner — block save */}
                    {mophPreview.errors && mophPreview.errors.length > 0 && (
                      <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-red-700 mb-1">❌ ข้อผิดพลาด (ไม่บันทึก):</p>
                        <ul className="list-disc list-inside text-xs text-red-600 space-y-0.5">
                          {mophPreview.errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* Warning banner */}
                    {mophPreview.warnings && mophPreview.warnings.length > 0 && (
                      <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-amber-700 mb-1">⚠️ คำเตือน:</p>
                        <ul className="list-disc list-inside text-xs text-amber-600 space-y-0.5">
                          {mophPreview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* Sample data — ตารางทุก hcode ที่ผ่าน filter */}
                    {mophPreview.sample && mophPreview.sample.length > 0 && (() => {
                      const cols = Object.keys(mophPreview.sample[0])
                      const numCols = cols.filter((c) =>
                        mophPreview.sample.some((r) => typeof r[c] === 'number' && (r[c] as number) > 0)
                      )
                      // คำนวณ sum ของแต่ละ numeric column สำหรับ summary row
                      const colSums: Record<string, number> = {}
                      numCols.forEach((c) => {
                        colSums[c] = mophPreview.sample.reduce((s, r) => s + (Number(r[c]) || 0), 0)
                      })
                      // Σ รวมทุก field ใน Mapping Builder (sumFields-aware — เหมือน components/KpiWizard.tsx)
                      const numSum = mophValueFields.reduce((s, f) => s + (colSums[f.trim()] ?? 0), 0)
                      const denSum = mophDenomFields.reduce((s, f) => s + (colSums[f.trim()] ?? 0), 0)
                      // คลิก header เพื่อเลือกเป็นตัวเศษ (Value Field) — เว้น dimension/time เหมือน FieldChipBuilder
                      const clickHeader = (col: string) => {
                        if (isBlockedFieldType(mophPreview.fieldTypes ?? {}, col)) return
                        setMophValueFields((prev) =>
                          mophFieldMode === 'singleField'
                            ? [col]
                            : prev.includes(col) ? prev.filter((f) => f !== col) : [...prev, col])
                        if (mophKpiId) setMappingDirty(true)
                      }
                      return (
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-gray-600">
                              📋 ข้อมูลทุก hcode ในอำเภอ —
                              <span className="ml-1 text-blue-700 font-bold">{mophPreview.sample.length} หน่วยบริการ</span>
                              {mophPreview.rows > mophPreview.sample.length && (
                                <span className="text-gray-400"> (แสดง {mophPreview.sample.length}/{mophPreview.rows})</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400">คลิก header → เพิ่ม/ถอดตัวเศษ (Numerator)</p>
                          </div>
                          <div className="overflow-x-auto rounded-lg border max-h-[420px] overflow-y-auto">
                            <table className="w-max text-xs border-collapse">
                              <thead className="sticky top-0 z-10">
                                <tr>
                                  <th className="px-2 py-2 border-b border-r bg-gray-200 text-gray-500 font-mono text-center">#</th>
                                  {cols.map((col) => (
                                    <th
                                      key={col}
                                      onClick={() => clickHeader(col)}
                                      title={`คลิกเพิ่ม/ถอด "${col}" เป็นตัวเศษ (Numerator)`}
                                      className={`px-3 py-2 border-b border-r text-left font-mono cursor-pointer select-none whitespace-nowrap transition-colors
                                        ${mophValueFields.includes(col)
                                          ? 'bg-blue-700 text-white'
                                          : mophDenomFields.includes(col)
                                          ? 'bg-green-600 text-white'
                                          : 'bg-gray-100 text-gray-700 hover:bg-blue-100 hover:text-blue-800'}`}
                                    >
                                      {col}
                                      {mophValueFields.includes(col) && ' ▲'}
                                      {mophDenomFields.includes(col) && ' ●'}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {mophPreview.sample.map((row, ri) => (
                                  <tr key={ri} className={ri % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}>
                                    <td className="px-2 py-1.5 border-b border-r text-gray-400 text-center">{ri + 1}</td>
                                    {cols.map((col) => {
                                      const val = row[col]
                                      const isVal    = mophValueFields.includes(col)
                                      const isTgt    = mophDenomFields.includes(col)
                                      return (
                                        <td key={col}
                                          className={`px-3 py-1.5 border-b border-r font-mono whitespace-nowrap
                                            ${isVal ? 'bg-blue-50 text-blue-800 font-bold' : ''}
                                            ${isTgt ? 'bg-green-50 text-green-800 font-semibold' : ''}
                                            ${val === null || val === '' ? 'text-gray-300 italic' : ''}`}
                                        >
                                          {val === null ? 'null' : val === '' ? '—' : String(val)}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                              {/* Summary row */}
                              <tfoot className="sticky bottom-0">
                                <tr className="bg-yellow-50 border-t-2 border-yellow-300">
                                  <td className="px-2 py-2 border-r text-yellow-700 font-bold text-center text-xs">Σ</td>
                                  {cols.map((col) => {
                                    const isVal = mophValueFields.includes(col)
                                    const isTgt = mophDenomFields.includes(col)
                                    const s     = colSums[col]
                                    return (
                                      <td key={col}
                                        className={`px-3 py-2 border-r font-mono font-bold text-xs whitespace-nowrap
                                          ${isVal ? 'bg-blue-100 text-blue-900' : ''}
                                          ${isTgt ? 'bg-green-100 text-green-900' : ''}
                                          ${!isVal && !isTgt ? 'text-yellow-700' : ''}`}
                                      >
                                        {s !== undefined ? s.toLocaleString() : '—'}
                                      </td>
                                    )
                                  })}
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                          <div className="flex gap-4 mt-1.5 text-xs text-gray-500">
                            <span><span className="inline-block w-3 h-3 bg-blue-700 rounded mr-1 align-middle" />ตัวเศษ: <strong>{mophValueFields.join(', ') || '—'}</strong> = {numSum.toLocaleString()}</span>
                            {mophCalcMode === 'percent' && (
                              <>
                                <span><span className="inline-block w-3 h-3 bg-green-600 rounded mr-1 align-middle" />ตัวส่วน: <strong>{mophDenomFields.join(', ') || '—'}</strong> = {denSum.toLocaleString()}</span>
                                {denSum > 0 && (
                                  <span className="text-blue-700 font-semibold">
                                    → {((numSum / denSum) * 100).toFixed(2)}%
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Save Section */}
                    <div className="border-t pt-4">
                      <h4 className="text-sm font-semibold text-gray-800 mb-3">💾 บันทึกลง monthly_data</h4>
                      <div className="flex flex-wrap gap-3 items-end">
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">KPI ที่จะบันทึก</label>
                          <select value={mophSaveKpiId || mophKpiId} onChange={(e) => setMophSaveKpiId(e.target.value)}
                            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="">-- เลือก KPI --</option>
                            {kpis.map((k) => <option key={k.id} value={k.id}>{k.name.slice(0, 45)}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">เดือนที่บันทึก</label>
                          <ThaiMonthInput value={mophMonth} onChange={setMophMonth} />
                        </div>
                        <button onClick={mophSave} disabled={mophLoading}
                          className="bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white text-sm px-5 py-2 rounded-lg font-medium">
                          {mophLoading ? 'กำลังบันทึก...' : '💾 บันทึกลง DB'}
                        </button>
                      </div>
                      {mophPreview.savedMonth && (
                        <p className="text-green-600 text-sm mt-2">✅ บันทึกค่า <strong>{mophPreview.calcValue}</strong> สำหรับเดือน <strong>{mophPreview.savedMonth}</strong> เรียบร้อย</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Batch Result */}
            {batchResult && (
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="font-semibold text-gray-800 mb-3">
                  {batchResult.ok ? '✅ ผล Batch Save' : '❌ เกิดข้อผิดพลาด'}
                </h3>
                {!batchResult.ok ? (
                  <p className="text-red-600 text-sm">{batchResult.message}</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <InfoBox label="KPI ทั้งหมด" value={String(batchResult.total ?? 0)} />
                      <InfoBox label="บันทึกสำเร็จ" value={String(batchResult.saved ?? 0)} highlight />
                      <InfoBox label="ข้าม (skipped)" value={String(batchResult.skipped ?? 0)} />
                      <InfoBox label="ล้มเหลว" value={String(batchResult.failed ?? 0)} />
                    </div>
                    <p className="text-xs text-gray-500 mb-3">เดือนที่บันทึก: <strong>{batchResult.savedMonth}</strong></p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">KPI</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Rows</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">ค่าที่บันทึก</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">สถานะ</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {batchResult.results?.map((r) => (
                            <tr key={r.kpiId}
                              className={
                                r.status === 'error'   ? 'bg-red-50'
                                : r.status === 'skipped' ? 'bg-gray-50'
                                : ''
                              }>
                              <td className="px-3 py-2 text-gray-700 max-w-xs truncate">{r.kpiName}</td>
                              <td className="px-3 py-2 text-center text-gray-500">{r.rows ?? '-'}</td>
                              <td className="px-3 py-2 text-center font-mono font-medium text-blue-700">{r.calcValue ?? '-'}</td>
                              <td className="px-3 py-2 text-center">
                                {r.status === 'ok' && (
                                  <span className="text-green-600 font-medium">✅ OK</span>
                                )}
                                {r.status === 'skipped' && (
                                  <span className="text-gray-500 font-medium" title={r.skipReason}>
                                    ⏭️ ข้าม{r.skipReason ? ` — ${r.skipReason.slice(0, 50)}` : ''}
                                  </span>
                                )}
                                {r.status === 'error' && (
                                  <span className="text-red-500" title={r.error}>
                                    ❌ {r.error?.slice(0, 40)}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {r.status === 'ok' && r.kpiId && (
                                  <button
                                    onClick={() => deleteMonthlyEntry(r.kpiId!, batchResult.savedMonth!, r.kpiName)}
                                    className="text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded text-xs"
                                    title={`ลบข้อมูลเดือน ${batchResult.savedMonth}`}>
                                    🗑️
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Quick reference */}
            <div className="bg-blue-50 rounded-xl border border-blue-100 p-5">
              <h3 className="font-semibold text-blue-800 mb-3 text-sm">📖 Table Names ที่รู้จัก</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-blue-700 font-mono">
                {KNOWN_TABLES.map(([table, desc]) => (
                  <button key={table} onClick={() => setMophTable(table)}
                    className="text-left flex gap-2 p-2 rounded hover:bg-blue-100">
                    <span className="text-blue-800 font-bold">{table}</span>
                    <span className="text-blue-600">→ {desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== USERS TAB ===== */}
        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">👥 จัดการผู้ใช้งาน</h2>
                <p className="text-xs text-gray-400 mt-0.5">เพิ่ม ลบ และเปลี่ยนรหัสผ่านผู้ใช้ในระบบ</p>
              </div>
              <button onClick={openAddUser}
                className="bg-blue-800 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium">
                + เพิ่มผู้ใช้
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">ชื่อ</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">อีเมล</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">หน่วยงาน</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">สิทธิ์</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">การดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{u.title ? `${u.title}` : ''}{u.name}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{u.email}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs hidden md:table-cell">{u.department}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'}`}>
                            {u.role === 'admin' ? '👑 Admin' : '👤 Staff'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          <button
                            onClick={() => setChangePwModal({ user: u, newPw: '' })}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 rounded hover:bg-blue-50">
                            🔑 รหัสผ่าน
                          </button>
                          <button
                            onClick={() => deleteUser(u.id, u.name)}
                            className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50">
                            ลบ
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===== DB TAB ===== */}
        {tab === 'db' && (
          <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="font-semibold text-gray-800 mb-4">🗄️ สถานะฐานข้อมูล MariaDB</h2>
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div className="bg-gray-50 rounded-lg p-3"><span className="text-gray-500">Host</span><p className="font-mono font-medium mt-0.5">{dbInfo ? `${dbInfo.host}:${dbInfo.port}` : '...'}</p></div>
              <div className="bg-gray-50 rounded-lg p-3"><span className="text-gray-500">Database</span><p className="font-mono font-medium mt-0.5">{dbInfo ? `${dbInfo.database} (${dbInfo.label})` : '...'}</p></div>
            </div>
            {dbStatus && (
              <div className={`p-4 rounded-lg mb-4 text-sm ${dbStatus.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {dbStatus.ok ? (
                  <div>✅ เชื่อมต่อสำเร็จ
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div className="bg-white rounded p-2 text-center"><div className="text-xl font-bold">{dbStatus.counts?.users}</div><div className="text-xs text-gray-500">users</div></div>
                      <div className="bg-white rounded p-2 text-center"><div className="text-xl font-bold">{dbStatus.counts?.kpis}</div><div className="text-xs text-gray-500">kpi_reports</div></div>
                      <div className="bg-white rounded p-2 text-center"><div className="text-xl font-bold">{dbStatus.counts?.monthly}</div><div className="text-xs text-gray-500">monthly_data</div></div>
                    </div>
                  </div>
                ) : <div>❌ {dbStatus.message}</div>}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={checkDb} className="border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-4 py-2 rounded-lg">ตรวจสอบการเชื่อมต่อ</button>
              <button onClick={initDb} className="bg-blue-800 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg">🚀 Migrate & Seed</button>
            </div>
          </div>

          {/* การ์ดสถานะ cron / ความสดข้อมูล */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">⏰ สถานะการดึงข้อมูลอัตโนมัติ (cron)</h2>
              <button onClick={loadCronStatus} className="text-gray-400 hover:text-gray-600 text-xs">🔄 รีเฟรช</button>
            </div>
            {!cronStatus ? (
              <div className="text-gray-400 text-sm">กำลังโหลด...</div>
            ) : !cronStatus.ok ? (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">❌ {cronStatus.message}</div>
            ) : (() => {
              const fmt = (s: string | null) => s ? new Date(s).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
              // อายุสัมพัทธ์ (ผู้ใช้ตัดสินความสดเองได้ ไม่ต้องพึ่ง badge อย่างเดียว)
              const rel = (s: string | null) => {
                if (!s) return ''
                const h = (Date.now() - new Date(s).getTime()) / 3.6e6
                if (h < 1) return `${Math.round(h * 60)} นาทีที่แล้ว`
                if (h < 48) return `${Math.round(h)} ชม.ที่แล้ว`
                return `${Math.round(h / 24)} วันที่แล้ว`
              }
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-gray-500 text-xs mb-1">🕐 ดึงล่าสุด (รวมกดเอง)</div>
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        {fmt(cronStatus.lastRun)}
                        {(() => {
                          const ageH = cronStatus.lastRun ? (Date.now() - new Date(cronStatus.lastRun).getTime()) / 3.6e6 : Infinity
                          const fresh = ageH < FRESH_THRESHOLD_HOURS
                          return (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${fresh ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {cronStatus.lastRun ? (fresh ? 'สด' : 'เก่า') : 'ยังไม่มี'}
                            </span>
                          )
                        })()}
                      </div>
                      {cronStatus.lastRun && <div className="text-gray-400 text-xs mt-0.5">{rel(cronStatus.lastRun)}</div>}
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-gray-500 text-xs mb-1">🤖 cron อัตโนมัติล่าสุด</div>
                      {cronStatus.cronLastRun ? (
                        <>
                          <div className="font-medium">{fmt(cronStatus.cronLastRun)}</div>
                          <div className="text-gray-400 text-xs mt-0.5">
                            {rel(cronStatus.cronLastRun)} · สำเร็จ {cronStatus.cronLastSaved}/{cronStatus.cronLastTotal}
                            {(cronStatus.cronLastFailed ?? 0) > 0 && <span className="text-red-500"> · ล้ม {cronStatus.cronLastFailed}</span>}
                          </div>
                        </>
                      ) : (
                        <div className="text-amber-600 text-xs">ยังไม่เคยรันตั้งแต่ server เปิดล่าสุด</div>
                      )}
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-gray-500 text-xs mb-1">📅 เดือนล่าสุด / 📊 coverage</div>
                      <div className="font-medium">{cronStatus.latestMonth ? formatThaiMonth(cronStatus.latestMonth) : '—'}</div>
                      <div className="text-gray-400 text-xs mt-0.5"
                        title={cronStatus.missingKpis.length ? `ยังไม่มีข้อมูล:\n- ${cronStatus.missingKpis.join('\n- ')}` : 'ครบทุกตัว'}>
                        เดือนนี้ {cronStatus.currentMonthKpiCount}/{cronStatus.autoKpiCount} KPI
                        {cronStatus.missingKpis.length > 0 && <span className="text-amber-600 cursor-help"> ⚠️ ขาด {cronStatus.missingKpis.length} (ชี้ดู)</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="text-gray-500">⏰ ตารางเวลา:</span>
                    <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{cronStatus.cronExpr}</span>
                    <span className="text-gray-400 text-xs">({cronStatus.cronTz})</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${cronStatus.cronDisabled ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                      {cronStatus.cronDisabled ? 'ปิดอยู่' : 'เปิดอยู่'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 border-t pt-2">
                    ℹ️ &quot;ดึงล่าสุด&quot; = ครั้งล่าสุดที่บันทึกข้อมูล (cron หรือกดเอง) · &quot;cron อัตโนมัติล่าสุด&quot; = รอบที่ระบบตั้งเวลารันเอง (แยกชัด) · cron ทำงานเฉพาะตอน server เปิด — production ต้องมี process manager
                  </p>
                </div>
              )
            })()}
          </div>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showUserForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowUserForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-lg">+ เพิ่มผู้ใช้ใหม่</h2>
              <button onClick={() => setShowUserForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <Field label="อีเมล *">
                <input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  placeholder="user@hospital.go.th"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Field>
              <div className="grid grid-cols-[110px_1fr] gap-3">
                <Field label="คำนำหน้า">
                  <select value={userForm.title} onChange={(e) => setUserForm({ ...userForm, title: e.target.value as '' | UserTitle })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">—</option>
                    <option value="นาย">นาย</option>
                    <option value="นาง">นาง</option>
                    <option value="นางสาว">นางสาว</option>
                  </select>
                </Field>
                <Field label="ชื่อ-สกุล *">
                  <input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                    placeholder="ชื่อผู้ใช้งาน"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </Field>
              </div>
              <Field label="รหัสผ่าน *">
                <input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  placeholder="รหัสผ่าน"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="สิทธิ์">
                  <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as 'admin' | 'staff' })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="staff">👤 Staff</option>
                    <option value="admin">👑 Admin</option>
                  </select>
                </Field>
                <Field label="กลุ่มงาน">
                  <select value={userForm.department} onChange={(e) => setUserForm({ ...userForm, department: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— ไม่ระบุ —</option>
                    {workGroupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </Field>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={saveUser} className="flex-1 bg-blue-800 hover:bg-blue-700 text-white text-sm py-2.5 rounded-lg font-medium">เพิ่มผู้ใช้</button>
                <button onClick={() => setShowUserForm(false)} className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm py-2.5 rounded-lg">ยกเลิก</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {changePwModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setChangePwModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-lg">🔑 เปลี่ยนรหัสผ่าน</h2>
              <button onClick={() => setChangePwModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">ผู้ใช้: <span className="font-semibold text-gray-900">{changePwModal.user.name}</span></p>
              <p className="text-xs text-gray-400">{changePwModal.user.email}</p>
              <Field label="รหัสผ่านใหม่ *">
                <input
                  type="password"
                  value={changePwModal.newPw}
                  onChange={(e) => setChangePwModal({ ...changePwModal, newPw: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && confirmChangePassword()}
                  placeholder="กรอกรหัสผ่านใหม่"
                  autoFocus
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Field>
              <div className="flex gap-3 pt-2">
                <button onClick={confirmChangePassword} className="flex-1 bg-blue-800 hover:bg-blue-700 text-white text-sm py-2.5 rounded-lg font-medium">บันทึก</button>
                <button onClick={() => setChangePwModal(null)} className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm py-2.5 rounded-lg">ยกเลิก</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-lg">แก้ไข KPI</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <Field label="ชื่อ KPI *"><textarea value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="หมวดหมู่">
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as KPICategory })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {categoryNames.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="สถานะ">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as KPIStatus })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_TH[s]}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="ผู้รับผิดชอบ *"><input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></Field>
              {/* เป้า/หน่วย/ทิศทาง = เฉพาะชนิดตัวเลข · text=ไม่ใช้ · level=ตั้งเป้าที่ picker ระดับ (ในช่องชนิดการวัด) */}
              {(!form.measureType || form.measureType === 'numeric') && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="เป้าหมาย"><input type="number" value={form.target} onChange={(e) => setForm({ ...form, target: +e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></Field>
                    <Field label="หน่วย"><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></Field>
                  </div>

                  {/* Phase 4: ทิศทางการประเมิน */}
                  <Field label="ทิศทางการประเมิน (ใช้ตัดสินผ่าน/ไม่ผ่านรายเดือน)">
                    <select value={form.direction ?? 'gte'} onChange={(e) => setForm({ ...form, direction: e.target.value as EvalDirection })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {DIRECTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                    {form.target === 0 && (form.direction ?? 'gte') === 'gte' && (
                      <p className="mt-1.5 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5">
                        ⚠️ เป้า=0 + ยิ่งมากยิ่งดี อาจตั้งค่าไม่ถูกต้อง ระบบจะจัดเป็น &quot;ต้องตรวจสอบ&quot;
                      </p>
                    )}
                  </Field>

                  {/* ตัวคูณ A/B — แสดงทั้ง 2 โหมด (เดิมโชว์เฉพาะ "ค่าเดียว" เพราะโหมดรายหน่วยฝัง ×100 ตายตัว
                      แก้ 3 ก.ย. 69 ให้โหมดรายหน่วยอ่าน rate_per แล้ว → ต้องเปิดให้ตั้งค่าได้ด้วย
                      ไม่งั้นตัวชี้วัด "ต่อแสน" ที่เป็นโหมดรายหน่วยจะแก้ผ่านหน้าเว็บไม่ได้เลย) */}
                  {form.manualEntry && (
                    <Field label="วิธีคิดค่าที่กรอก (กลุ่มเป้าหมาย/ผลงาน)">
                      <select value={form.ratePer ?? 100} onChange={(e) => setForm({ ...form, ratePer: +e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value={100}>ร้อยละ (A/B×100) — ค่าเริ่มต้น</option>
                        <option value={1000}>ต่อพัน (A/B×1,000)</option>
                        <option value={10000}>ต่อหมื่น (A/B×10,000)</option>
                        <option value={100000}>ต่อแสนประชากร (A/B×100,000) — เช่น อัตราตาย/เกิด</option>
                        <option value={1000000}>ต่อล้าน (A/B×1,000,000)</option>
                      </select>
                      {/* เตือนอัตโนมัติเมื่อหน่วยกับวิธีคิดไม่ตรงกัน (ดู lib/ratePerCheck.ts) */}
                      {(() => {
                        const mm = ratePerMismatch(form.unit, form.ratePer)
                        return mm ? (
                          <p className="mt-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5">
                            ⚠️ {mm.message}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-gray-400">ต้องตั้ง &quot;หน่วย&quot; ด้านบนให้ตรงกัน (เช่น &quot;ต่อแสนประชากร&quot;) — ไม่งั้นตัวเลขจะโชว์ถูกแต่ป้ายหน่วยผิด</p>
                        )
                      })()}
                      {/* เปลี่ยนตัวคูณ = ค่าที่บันทึกไว้แล้วไม่ถูกคำนวณใหม่ (เก็บเป็นตัวเลขตายตัวตอนกดบันทึก) */}
                      {editKPI && form.ratePer !== (Number(editKPI.ratePer) || 100) && (
                        <p className="mt-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                          🔴 เปลี่ยนวิธีคิดแล้ว <b>ข้อมูลเดือนที่บันทึกไว้ก่อนหน้าจะไม่ถูกคำนวณใหม่</b> (ยังเป็นค่าคูณแบบเดิม)
                          — ถ้าตัวชี้วัดนี้มีข้อมูลอยู่แล้ว ต้องเข้าไปกรอกเดือนนั้นซ้ำเพื่อให้ตัวเลขตรงกันทั้งชุด
                        </p>
                      )}
                    </Field>
                  )}
                </>
              )}

              <Field label="กำหนดเสร็จ *"><input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></Field>

              <Field label="กลุ่มงาน (เลือกได้หลายกลุ่ม)">
                <WorkGroupPicker value={form.workGroups ?? []} onChange={(g) => setForm({ ...form, workGroups: g })} />
              </Field>

              <Field label="ชุด/ประเภทตัวชี้วัด (เลือกได้หลายชุด)">
                <KpiSetPicker value={form.sets} onChange={(s) => setForm({ ...form, sets: s })} />
              </Field>

              <Field label="แหล่งข้อมูล">
                <input value={form.dataSource ?? 'HDC'} onChange={(e) => setForm({ ...form, dataSource: e.target.value })}
                  list="data-source-suggestions" placeholder="HDC"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <datalist id="data-source-suggestions"><option value="HDC" /></datalist>
                <p className="mt-1 text-xs text-gray-400">ที่มาของข้อมูลตัวชี้วัด (ตอนนี้ทุกตัวมาจาก HDC) — อนาคตถ้ามาจากแหล่งอื่นแก้ตรงนี้ได้</p>
              </Field>

              <Field label="ชนิดการวัด">
                <select value={form.measureType ?? 'numeric'}
                  onChange={(e) => { const v = e.target.value; setForm({ ...form, measureType: v === 'text' || v === 'level' ? v : 'numeric' }) }}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="numeric">ตัวเลข (%/จำนวน — ประเมินผ่าน/ไม่ผ่าน)</option>
                  <option value="text">ข้อความ (เช่น ท้าทาย / อยู่ระหว่างดำเนินการ — ไม่ประเมิน)</option>
                  <option value="level">ระดับ (เรียงลำดับ — ตัดสินผ่าน/ไม่ผ่านตามระดับ)</option>
                </select>
                {(form.measureType === 'text' || form.measureType === 'level') && (() => {
                  const isLevel = form.measureType === 'level'
                  const opts = (form.textOptions ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
                  return (
                  <>
                    <p className="mt-1 text-xs text-amber-600">ℹ️ ชนิดนี้กรอกมือเสมอ (ดึง HDC อัตโนมัติไม่ได้) — ระบบตั้ง &quot;กรอกค่าเอง&quot; ให้อัตโนมัติ</p>
                    <div className="mt-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        {isLevel ? 'ระดับ (เรียงจากต่ำ → สูง) — บรรทัดละ 1 ระดับ' : 'ตัวเลือกผลงาน (dropdown) — บรรทัดละ 1 ตัวเลือก'}
                      </label>
                      <textarea value={form.textOptions ?? ''}
                        onChange={(e) => setForm({ ...form, textOptions: e.target.value })}
                        rows={4} placeholder={'เช่น\nมาตรฐาน\nดีเยี่ยม\nท้าทาย'}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <p className="mt-1 text-xs text-gray-400">
                        {isLevel
                          ? 'เรียงจากระดับต่ำสุดขึ้นไปสูงสุด (บรรทัดล่างสุด = ดีที่สุด)'
                          : 'กำหนดตัวเลือกให้เลือกตอนกรอก (กันพิมพ์ไม่ตรงกัน) · เว้นว่าง = ให้พิมพ์เอง · ผู้กรอกยังเลือก "อื่นๆ" พิมพ์เองได้เสมอ'}
                      </p>
                    </div>
                    {isLevel && (
                      <div className="mt-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">ระดับที่ถือว่า &quot;ผ่าน&quot; (เป้าหมาย)</label>
                        <select value={Math.round(Number(form.target)) || 0}
                          onChange={(e) => setForm({ ...form, target: +e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value={0}>— ยังไม่ตั้ง (ติดตามเฉยๆ) —</option>
                          {opts.map((o, i) => <option key={o + i} value={i + 1}>{o} ขึ้นไป</option>)}
                        </select>
                        <p className="mt-1 text-xs text-gray-400">ถ้าได้ระดับนี้ขึ้นไป = ผ่าน · ต่ำกว่า = ไม่ผ่าน · (แก้รายการระดับด้านบนแล้วต้องเลือกเป้าใหม่)</p>
                      </div>
                    )}
                  </>
                  )
                })()}
              </Field>

              <div className="border-t pt-4">
                <label className="flex items-start gap-2 mb-3 cursor-pointer">
                  <input type="checkbox" checked={form.manualEntry ?? false}
                    onChange={(e) => setForm({ ...form, manualEntry: e.target.checked })}
                    className="mt-0.5" />
                  <span className="text-sm">
                    <span className="font-medium text-gray-800">📝 กรอกค่าเอง (manual)</span>
                    <span className="block text-xs text-gray-500">ติ๊กเมื่อ HDC ไม่เปิด API ให้ดึง (เช่น fully immunized) — ระบบจะไม่ดึง/ทับค่าอัตโนมัติ ผู้ดูแลกรอกในหน้า KPI เอง</span>
                  </span>
                </label>
                {form.manualEntry && (
                  <div className="mb-4 pl-6">
                    <label className="block text-xs text-gray-600 mb-1">รูปแบบการกรอก</label>
                    <select value={form.manualScope ?? 'unit'}
                      onChange={(e) => setForm({ ...form, manualScope: e.target.value === 'single' ? 'single' : 'unit' })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="unit">ราย รพ.สต. 7 หน่วย (B/A ต่อหน่วย)</option>
                      <option value="single">ค่าเดียว (เป้าหมาย+ผลงาน รวม — เช่น เฉพาะโรงพยาบาลดงเจริญ ไม่มีข้อมูลราย รพ.สต.)</option>
                    </select>
                  </div>
                )}
                <p className="text-xs font-semibold text-blue-700 mb-1">🌐 MOPH API Config</p>
                <p className="text-xs text-gray-400 mb-3">ℹ️ ถ้า KPI นี้เคยตั้ง Mapping ไว้แล้ว (แท็บ 🌐 ดึงข้อมูล MOPH) ระบบจะใช้ Mapping นั้นเป็นหลัก — ช่อง Value/Target Field ด้านล่างจะไม่มีผลจนกว่าจะล้าง Mapping</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Table Name"><input value={form.mophTable ?? ''} onChange={(e) => setForm({ ...form, mophTable: e.target.value })} placeholder="s_dm_hba1c" className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" /></Field>
                  <Field label="Value Field"><input value={form.mophValueField ?? ''} onChange={(e) => setForm({ ...form, mophValueField: e.target.value })} placeholder="hba1c" className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" /></Field>
                  <Field label="Target Field"><input value={form.mophTargetField ?? ''} onChange={(e) => setForm({ ...form, mophTargetField: e.target.value })} placeholder="target" className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" /></Field>
                  <Field label="วิธีคำนวณ">
                    <select value={form.mophCalcMode ?? 'percent'} onChange={(e) => setForm({ ...form, mophCalcMode: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {CALC_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </Field>
                </div>
              </div>

              <Field label="รายละเอียด"><textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></Field>
              <div className="flex gap-3 pt-2">
                <button onClick={saveForm} className="flex-1 bg-blue-800 hover:bg-blue-700 text-white text-sm py-2.5 rounded-lg font-medium">บันทึกการแก้ไข</button>
                <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm py-2.5 rounded-lg">ยกเลิก</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Wizard (เพิ่ม + ดึง ครบ flow) */}
      {showWizard && (
        <KpiWizard
          categories={categoryNames}
          knownTables={KNOWN_TABLES}
          onClose={() => setShowWizard(false)}
          onDone={(m) => { loadData(); showMsg(m) }}
        />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>{children}</div>
}

function InfoBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 text-center ${highlight ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
      <div className={`text-xl font-bold ${highlight ? 'text-blue-700' : 'text-gray-800'}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}
