'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts'
import Navbar from '@/components/Navbar'
import ThaiMonthInput from '@/components/ThaiMonthInput'
import QuarterSummary, { type MonthValue } from '@/components/QuarterSummary'
import { currentQuarter, fiscalYearOfMonth, quarterInfoOfMonth } from '@/lib/fiscalQuarter'
import { useAuth } from '@/lib/useAuth'
import { STATUS_META, evaluateKpiStatus } from '@/lib/kpiStatus'
import { DIRECTION_LABEL } from '@/lib/scorecard'
import { DISTRICT_NAME, HOSPCODE_NAMES } from '@/lib/areaRef'
import { formatThaiMonth } from '@/lib/formatMonth'
import type { KpiEvalStatus, EvalDirection } from '@/lib/types'

// สี badge สถานะ (presentation เฉพาะหน้านี้ — ชุดเดียวกับ Dashboard)
const BADGE: Record<KpiEvalStatus, string> = {
  fail:         'bg-red-100 text-red-700',
  needs_review: 'bg-orange-100 text-orange-700',
  invalid:      'bg-purple-100 text-purple-700',
  watch:        'bg-amber-100 text-amber-700',
  no_data:      'bg-gray-100 text-gray-600',
  pass:         'bg-green-100 text-green-700',
  no_target:    'bg-slate-100 text-slate-700',
  narrative:    'bg-slate-100 text-slate-700',
}
const BAR_COLOR: Record<string, string> = {
  pass: '#16a34a', watch: '#f59e0b', fail: '#dc2626',
  needs_review: '#f97316', invalid: '#9333ea', no_data: '#9ca3af', no_target: '#64748b',
}

// หน่วยบริการเรียงตามรหัส (localeCompare) — ตรงกับ sort ของ unit-view ใน /api/detail
// (กัน JS เรียง key เลขล้วน เช่น '27980' ขึ้นก่อน key leading-zero '07705')
const hospcodeEntries = () =>
  Object.entries(HOSPCODE_NAMES).sort(([a], [b]) => a.localeCompare(b))

// ป้ายแถวเดียวสำหรับ manualScope='single' (ค่าเดียว ไม่แยกราย รพ.สต. — เช่น ตัวชี้วัดเฉพาะโรงพยาบาล)
const SINGLE_MODE_UNIT_NAME = 'โรงพยาบาลดงเจริญ'

interface GroupRow {
  code: string
  name: string
  rows: number
  fields: Record<string, number>
  calcValue: number | null
  status: KpiEvalStatus | null
}
interface DetailResp {
  ok: boolean
  message?: string
  month?: string
  months: string[]
  kpi: {
    name: string; category: string; owner: string; unit: string
    direction: EvalDirection; description?: string | null; target?: number
    ratePer?: number  // ตัวคูณ A/B ก่อนแสดงผล — 100=ร้อยละ (default) · 100000=ต่อแสนประชากร ฯลฯ (single mode)
  }
  savedMonthly?: {
    value: number; target: number; valueText?: string | null; enteredBy?: string | null; enteredAt?: string | null
    rawTarget?: number | null; rawResult?: number | null  // B/A ดิบที่กรอกจริง (single mode) — null = แถวเก่าก่อนมีคอลัมน์นี้
  } | null
  manual?: boolean
  manualScope?: 'unit' | 'single'
  measureType?: 'numeric' | 'text' | 'level'
  textOptions?: string | null
  canEdit?: boolean
  canEditNotes?: boolean   // L2: แก้บันทึกเชิงคุณภาพได้ไหม (ทุก KPI ไม่ว่า auto/manual — ต่างจาก canEdit)
  reportFreq?: 'monthly' | 'quarterly'  // L4: รอบส่ง/ความถี่เตือน — ข้อมูลเก็บรายเดือนเสมอทั้ง 2 แบบ
  view?: 'area' | 'unit'
  live?: boolean
  liveError?: string
  legend?: string | null
  stale?: boolean
  lastMonth?: string | null
  mappingOk?: boolean
  mappingErrors?: string[]
  fieldList?: string[]
  fieldLabels?: Record<string, string>
  groups?: GroupRow[]
  total?: GroupRow
}

export default function KpiDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth()
  const [data, setData] = useState<DetailResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // กรอกค่าเอง รายหน่วยบริการ (manual KPI — admin หรือ staff เจ้าของกลุ่มงาน; สิทธิ์จริงมาจาก server เจ้าของ + เดือนปัจจุบัน — ดู const canEdit ด้านล่าง)
  const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const [entryMonth, setEntryMonth] = useState(thisMonth)
  const [tRows, setTRows] = useState<{ code: string; name: string; target: string; result: string }[]>([])
  // กรอกค่าเอง แบบ "ค่าเดียว" (manualScope='single' — ไม่แยกราย รพ.สต.)
  const [sTarget, setSTarget] = useState('')
  const [sResult, setSResult] = useState('')
  const [legacyNoRaw, setLegacyNoRaw] = useState(false) // true = มีค่า % บันทึกไว้แต่ไม่มี B/A ดิบ (แถวเก่าก่อนมีคอลัมน์นี้) — ต้องกรอกใหม่ทั้งคู่
  const [sText, setSText] = useState('')   // L1: ผลงานข้อความ (measureType='text')
  const [sTextCustom, setSTextCustom] = useState(false)  // L1: เลือก "อื่นๆ (พิมพ์เอง)" แทน dropdown
  const [mSaving, setMSaving] = useState(false)
  const [mMsg, setMMsg] = useState('')
  const [editing, setEditing] = useState(false) // ล็อกฟอร์มหลังบันทึก — ต้องกด "แก้ไข" ก่อนจึงพิมพ์ทับได้ (กันมือลั่น)
  const [view, setView] = useState<'area' | 'unit'>('area') // มุมมอง drilldown (KPI auto)
  const [isLive, setIsLive] = useState(false) // โหมดสดจาก MOPH
  // L2: บันทึกเชิงคุณภาพต่อรอบ (ปัญหา/แนวทาง/แหล่งที่มา) — ใช้ได้ทั้ง KPI auto และ manual
  const [nProblem, setNProblem] = useState('')
  const [nNextAction, setNNextAction] = useState('')
  const [nDataRef, setNDataRef] = useState('')
  const [nSavedBy, setNSavedBy] = useState<{ by: string | null; at: string | null } | null>(null)
  const [nEditing, setNEditing] = useState(false)
  const [nSaving, setNSaving] = useState(false)
  const [nMsg, setNMsg] = useState('')
  // L4: ค่าทุกเดือนของ KPI นี้ (ใช้สร้างตาราง/กราฟ 4 ไตรมาส) — /api/monthly มีอยู่แล้ว ไม่ต้องทำ API ใหม่
  const [allMonths, setAllMonths] = useState<MonthValue[]>([])

  const load = useCallback(async (month?: string, v?: 'area' | 'unit') => {
    setLoading(true)
    try {
      const q = month ? `&month=${month}` : ''
      const vq = v ? `&view=${v}` : ''
      const res = await fetch(`/api/detail?kpiId=${params.id}${q}${vq}`)
      const j: DetailResp = await res.json()
      if (!res.ok) throw new Error(j.message || 'โหลดข้อมูลไม่สำเร็จ')
      setData(j)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [params.id])

  // L4: โหลดค่าทุกเดือนของ KPI นี้ (สำหรับตาราง/กราฟรายไตรมาส)
  const loadAllMonths = useCallback(async () => {
    try {
      const res = await fetch(`/api/monthly?kpiId=${params.id}`)
      if (!res.ok) return
      const j = await res.json()
      setAllMonths((Array.isArray(j) ? j : []).map((r: { month: string; value: unknown; valueText?: string | null }) => ({
        month: r.month,
        value: r.value === null || r.value === undefined ? null : Number(r.value),
        valueText: r.valueText ?? null,
      })))
    } catch {
      /* ตารางไตรมาสเป็นส่วนเสริม — พังแล้วต้องไม่ทำหน้าหลักล่ม */
    }
  }, [params.id])

  // L2: โหลดบันทึกเชิงคุณภาพของรอบที่กำลังดู (แยกจาก /api/detail — ไม่ทำให้หน้าเดิมพังถ้าตารางยังไม่มี)
  // ⚠️ กัน race: ตอนเปิดหน้า เดือนเปลี่ยน 2 จังหวะ (thisMonth → เดือนจริงของข้อมูล) จึงยิง 2 request
  // ถ้า response ของเดือนเก่ามาถึงทีหลัง จะทับข้อมูลเดือนที่ถูกต้องด้วยค่าว่าง → เก็บเดือนล่าสุดที่ขอไว้ใน ref แล้วทิ้ง response ที่ไม่ตรง
  const notesReqRef = useRef('')
  const loadNotes = useCallback(async (period: string) => {
    notesReqRef.current = period
    try {
      const res = await fetch(`/api/kpi-notes?kpiId=${params.id}&period=${period}`)
      const j = await res.json()
      if (notesReqRef.current !== period) return   // มีคำขอเดือนใหม่กว่าแล้ว — ทิ้งผลเก่า
      const n = j.note
      setNProblem(n?.problem ?? '')
      setNNextAction(n?.nextAction ?? '')
      setNDataRef(n?.dataRef ?? '')
      setNSavedBy(n ? { by: n.updatedBy ?? null, at: n.updatedAt ?? null } : null)
      setNEditing(!n)   // ยังไม่เคยบันทึก → เปิดให้พิมพ์เลย · มีแล้ว → ล็อกไว้ก่อน (กันมือลั่นทับ)
      setNMsg('')
    } catch {
      /* เงียบไว้ — หมายเหตุเป็นส่วนเสริม ไม่ควรทำให้หน้าหลักพัง */
    }
  }, [params.id])

  // sync ตารางกรอก จากข้อมูลที่โหลด (เติม 7 หน่วยบริการครบ — หน่วยที่ยังไม่มีข้อมูล = ว่าง)
  // หมายเหตุ: tRows.code = hospcode (group key ของ detail route view=unit ก็คือ hospcode)
  useEffect(() => {
    if (!data?.manual || data.manualScope === 'single') return
    const byCode = new Map((data.groups ?? []).map((g) => [g.code, g.fields]))
    setTRows(hospcodeEntries().map(([code, name]) => {
      const f = byCode.get(code)
      return {
        code, name,
        target: f && f.target != null ? String(f.target) : '',
        result: f && f.result != null ? String(f.result) : '',
      }
    }))
    setEntryMonth(data.month ?? thisMonth)
    setEditing(!data.savedMonthly) // เดือนที่แสดงมีข้อมูลแล้ว → ล็อก · ว่าง → กรอกได้เลย
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // sync ฟอร์ม "ค่าเดียว" จากข้อมูลที่โหลด — ใช้ B/A ดิบที่กรอกจริง (rawTarget/rawResult)
  // แถวเก่าก่อนมีคอลัมน์นี้ (rawTarget=null) ไม่เดาค่าคืนจาก % แล้ว (เดาแล้วผิดเงียบๆ มาก่อน
  // เพราะ md.target คือเป้าหมายของ KPI เอง ไม่ใช่ B ที่กรอก — ดู kpi-hdc-api-checklist.md 6 ส.ค. 2569)
  // → เว้นว่างให้กรอกใหม่ทั้งคู่ + ขึ้นป้ายเตือนแทน
  useEffect(() => {
    if (!data?.manual || data.manualScope !== 'single') return
    const md = data.savedMonthly
    const hasRaw = !!md && md.rawTarget != null && md.rawResult != null
    setSTarget(hasRaw ? String(md!.rawTarget) : '')
    setSResult(hasRaw ? String(md!.rawResult) : '')
    setLegacyNoRaw(!!md && !hasRaw)
    setEntryMonth(data.month ?? thisMonth)
    setEditing(!data.savedMonthly)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // L1: sync ฟอร์มชนิดข้อความ/ระดับ (measureType text|level) — เก็บ value_text ตรงๆ
  useEffect(() => {
    if (data?.measureType !== 'text' && data?.measureType !== 'level') return
    const saved = data.savedMonthly?.valueText ?? ''
    setSText(saved)
    // ค่าที่บันทึกไว้ไม่ตรงตัวเลือกใด = โหมดพิมพ์เอง (เปิด textarea ให้เห็นค่าเดิม)
    const opts = (data.textOptions ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
    setSTextCustom(!!saved && !opts.includes(saved))
    setEntryMonth(data.month ?? thisMonth)
    setEditing(!data.savedMonthly)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // L2: โหลดหมายเหตุใหม่ทุกครั้งที่รอบที่แสดงเปลี่ยน
  // manual = เดือนในฟอร์มกรอก (entryMonth) · auto = เดือนของข้อมูลที่โหลดมา (data.month)
  const notesPeriod = data?.manual ? entryMonth : (data?.month ?? '')
  useEffect(() => {
    if (!data || !notesPeriod) return
    loadNotes(notesPeriod)
  }, [data, notesPeriod, loadNotes])

  // L4: ดึงค่าทุกเดือนของ KPI นี้ (ใช้กับตารางสรุปทั้งปี — สลับดูไตรมาส/เดือนได้ทุกตัวชี้วัด)
  useEffect(() => {
    if (data) loadAllMonths()
  }, [data, loadAllMonths])

  async function saveNotes(period: string) {
    setNSaving(true); setNMsg('')
    try {
      const res = await fetch('/api/kpi-notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kpiId: params.id, period,
          problem: nProblem, nextAction: nNextAction, dataRef: nDataRef,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.message || 'บันทึกไม่สำเร็จ')
      setNMsg(`✅ ${j.message}`)
      setNEditing(false)
      loadNotes(period)
    } catch (e) {
      setNMsg(`⚠️ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setNSaving(false)
    }
  }

  async function saveManualDetail() {
    for (const r of tRows) {
      const t = Number(r.target) || 0, a = Number(r.result) || 0
      if (a > t) { setMMsg(`⚠️ ${r.name}: ผลงาน (A) ต้องไม่เกินฐาน (B)`); return }
    }
    setMSaving(true); setMMsg('')
    try {
      const res = await fetch('/api/monthly/detail', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kpiId: params.id, month: entryMonth,
          rows: tRows.map((r) => ({ hospcode: r.code, target: Number(r.target) || 0, result: Number(r.result) || 0 })),
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.message || 'บันทึกไม่สำเร็จ')
      setMMsg('✅ บันทึกสำเร็จ')
      load(entryMonth)
    } catch (e) {
      setMMsg(`⚠️ ${String(e)}`)
    } finally {
      setMSaving(false)
    }
  }

  async function saveSingleValue() {
    const t = Number(sTarget) || 0, r = Number(sResult) || 0
    // กันบันทึกทับด้วย 0/0 เงียบๆ ตอนช่องว่าง (แถว legacy ไม่มี raw B/A ให้ preload — ต้องกรอกใหม่จริงก่อนบันทึก)
    if (legacyNoRaw && t === 0 && r === 0) {
      setMMsg(`⚠️ กรุณากรอกกลุ่มเป้าหมาย (B) และผลงาน (A) ใหม่ทั้งคู่ก่อนบันทึก — ค่าเดิม ${committedPct}${data?.kpi.unit} จะไม่ถูกนำมาใช้ต่ออัตโนมัติ`)
      return
    }
    if (r > t) { setMMsg('⚠️ ผลงาน (A) ต้องไม่เกินฐาน (B)'); return }
    setMSaving(true); setMMsg('')
    try {
      const res = await fetch('/api/monthly/single', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kpiId: params.id, month: entryMonth, target: t, result: r }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.message || 'บันทึกไม่สำเร็จ')
      setMMsg('✅ บันทึกสำเร็จ')
      load(entryMonth)
    } catch (e) {
      setMMsg(`⚠️ ${String(e)}`)
    } finally {
      setMSaving(false)
    }
  }

  async function saveTextValue() {
    const s = sText.trim()
    if (!s) { setMMsg('⚠️ กรุณากรอกผลงาน (ข้อความ)'); return }
    setMSaving(true); setMMsg('')
    try {
      const res = await fetch('/api/monthly/single', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kpiId: params.id, month: entryMonth, valueText: s }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.message || 'บันทึกไม่สำเร็จ')
      setMMsg('✅ บันทึกสำเร็จ')
      load(entryMonth)
    } catch (e) {
      setMMsg(`⚠️ ${String(e)}`)
    } finally {
      setMSaving(false)
    }
  }

  function changeView(v: 'area' | 'unit') {
    if (v === view) return
    setView(v)
    load(isLive ? 'live' : (data?.month ?? undefined), v)
  }

  useEffect(() => {
    if (!user) return
    load()
  }, [user, load])

  // staff (ไม่ใช่ admin) เข้ามาแล้วเจอเดือนเก่า (ยังไม่มีข้อมูลเดือนปัจจุบัน) → เด้งไปเดือนปัจจุบันให้อัตโนมัติ
  // (กันงง — picker ล็อกให้กรอกได้แค่เดือนนี้อยู่แล้ว แต่ default เดิมจะโชว์เดือนล่าสุดที่มีข้อมูล ซึ่งอาจเป็นเดือนก่อนหน้า)
  useEffect(() => {
    if (!user || user.role === 'admin' || !data?.manual) return
    if (data.month && data.month !== thisMonth) {
      onEntryMonthChange(thisMonth)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, user])

  if (!user) return null

  const manual = data?.manual === true
  const textMode = manual && (data?.measureType === 'text' || data?.measureType === 'level')   // L1/L1b: กรอกข้อความ/เลือกระดับ (dropdown เดียวกัน)
  const levelMode = data?.measureType === 'level'
  const singleMode = manual && data?.manualScope === 'single' && !textMode
  // สิทธิ์แก้ไขจริง = เจ้าของ KPI (server) + เดือนที่กำลังดูแก้ได้ไหม (staff เฉพาะเดือนปัจจุบัน, admin ทุกเดือน)
  // เช็ก entryMonth ฝั่ง client เพราะอาจเปลี่ยนหลังโหลด (auto-jump ไปเดือนปัจจุบัน) โดยไม่ได้ re-fetch จาก server
  // — การเขียนจริงยัง enforce เข้มงวดฝั่ง POST เสมอ ไม่ว่า UI ตรงนี้จะคำนวณผิดพลาดยังไงก็ตาม
  // L4: รอบส่งเป็นไตรมาส — ใช้แค่กำหนดป้ายรอบ + ความถี่เตือน (ข้อมูลเก็บรายเดือนเสมอ)
  const quarterly = data?.reportFreq === 'quarterly'
  const qInfo = quarterly ? quarterInfoOfMonth(entryMonth) : null
  // ป้ายรอบที่ใช้ทั่วหน้า: รายไตรมาส → "ไตรมาส 2/2569" · รายเดือน → "เดือนมีนาคม 2569"
  const periodLabel = qInfo ? qInfo.label : `เดือน${formatThaiMonth(entryMonth)}`
  const monthLocked = user.role !== 'admin' && entryMonth !== thisMonth
  const canEdit = (data?.canEdit ?? false) && !monthLocked
  // L2: บันทึกเชิงคุณภาพ — ล็อกตามรอบที่แสดงจริง (notesPeriod) ซึ่งอาจคนละเดือนกับฟอร์มกรอกผลงาน
  const notesQ = quarterly ? quarterInfoOfMonth(notesPeriod) : null
  const notesPeriodLabel = notesQ ? notesQ.label : `เดือน${formatThaiMonth(notesPeriod)}`
  const notesLocked = user.role !== 'admin' && notesPeriod !== thisMonth
  const canEditNotes = (data?.canEditNotes ?? false) && !notesLocked
  const viewLabel = view === 'unit' ? 'หน่วยบริการ' : 'ตำบล'
  const groups = data?.groups ?? []
  const total = data?.total
  const fieldList = data?.fieldList ?? []
  const fieldLabels = data?.fieldLabels ?? {}
  const showPct = !manual && data?.mappingOk && groups.some((g) => g.calcValue !== null)
  const target = data?.kpi?.target ?? 0
  const direction = data?.kpi?.direction
  const manualSaved = data?.savedMonthly ?? null

  // manual: คำนวณสดจากตารางที่กรอก (อัปเดต % + กราฟ ทันทีที่พิมพ์)
  const liveRows = tRows.map((r) => {
    const t = Number(r.target) || 0, a = Number(r.result) || 0
    return { ...r, t, a, pct: t > 0 ? +((a / t) * 100).toFixed(2) : null }
  })
  const liveSumT = liveRows.reduce((s, r) => s + r.t, 0)
  const liveSumA = liveRows.reduce((s, r) => s + r.a, 0)
  const liveTotalPct = liveSumT > 0 ? +((liveSumA / liveSumT) * 100).toFixed(2) : 0
  const liveTotalStatus = manual ? evaluateKpiStatus(liveTotalPct, target, direction ?? 'none').status : null
  const manualStatus = liveTotalStatus

  // manualScope='single': คำนวณสดจากช่องกรอกค่าเดียว (ใช้กับตารางกรอก/แถวที่กำลังแก้ — ไม่ใช่แหล่งความจริง)
  const ratePer = data?.kpi.ratePer || 100  // 100=ร้อยละ (ส่วนใหญ่) · 100000=ต่อแสนประชากร ฯลฯ
  const sTargetNum = Number(sTarget) || 0
  const sResultNum = Number(sResult) || 0
  const sPct = sTargetNum > 0 ? +((sResultNum / sTargetNum) * ratePer).toFixed(2) : 0
  const sStatus = singleMode ? evaluateKpiStatus(sPct, target, direction ?? 'none').status : null

  // ค่า % ที่บันทึกจริงจากเซิร์ฟเวอร์ (แหล่งความจริง) — การ์ดสรุป/กราฟ/badge ต้องอิงจากตรงนี้เสมอ ไม่ใช่ sPct
  // (sPct มาจากฟอร์มกรอกซึ่งแถวเก่าที่ไม่มี raw B/A จะว่างเปล่า — ถ้าเอา sPct ไปโชว์การ์ดสรุป
  // จะทำให้ % ที่เคยบันทึกถูกต้องแล้วหายไปเป็น "—" ทั้งที่ยังมีค่าจริงอยู่ใน DB)
  const committedPct = data?.savedMonthly ? Number(data.savedMonthly.value) : null
  const committedStatus = singleMode && committedPct != null
    ? evaluateKpiStatus(committedPct, target, direction ?? 'none').status : null
  const committedRawTarget = data?.savedMonthly?.rawTarget ?? null
  const committedRawResult = data?.savedMonthly?.rawResult ?? null

  const chartData = manual
    ? liveRows.map((r) => ({ name: r.name, value: r.pct ?? 0, status: evaluateKpiStatus(r.pct ?? 0, target, direction ?? 'none').status }))
    : groups.map((g) => ({ name: g.name, value: g.calcValue ?? 0, status: g.status ?? 'no_data' }))

  function setRow(code: string, field: 'target' | 'result', val: string) {
    setTRows((prev) => prev.map((r) => (r.code === code ? { ...r, [field]: val } : r)))
  }
  function onEntryMonthChange(m: string) {
    setEntryMonth(m)
    setMMsg('')
    if (data?.months.includes(m)) load(m) // มีข้อมูล → โหลด (useEffect จะล็อกให้)
    else { // เดือนว่าง → กรอกได้เลย ไม่ต้องล็อก
      if (singleMode) { setSTarget(''); setSResult('') }
      else setTRows(hospcodeEntries().map(([code, name]) => ({ code, name, target: '', result: '' })))
      setEditing(true)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-1 text-sm">
          <Link href="/dashboard" className="text-blue-600 hover:underline">← กลับ Scorecard</Link>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">กำลังโหลดข้อมูล...</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">⚠️ {error}</div>
        ) : !data ? null : (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{data.kpi.name}</h1>
                <p className="text-gray-500 text-sm mt-1">
                  {DISTRICT_NAME} • {data.kpi.category} • ผู้รับผิดชอบ: {data.kpi.owner} • {DIRECTION_LABEL[data.kpi.direction]}
                </p>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {/* ที่มาของตัวเลข — กัน staff งงว่าทำไมบางตัวไม่มีช่องกรอก */}
                  {manual ? (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      ✍️ กรอกเอง โดยผู้รับผิดชอบ
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      📊 ดึงอัตโนมัติจาก HDC — ไม่ต้องกรอกเอง
                    </span>
                  )}
                  {quarterly && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
                      ส่งเขตรายไตรมาส
                    </span>
                  )}
                </div>
              </div>
              {manual ? (
                // staff กรอกได้เฉพาะเดือนปัจจุบัน (ล็อก min=max) — admin เลือกย้อนหลังได้เหมือนเดิม
                <ThaiMonthInput value={entryMonth} onChange={onEntryMonthChange}
                  min={user.role !== 'admin' ? thisMonth : undefined}
                  max={user.role !== 'admin' ? thisMonth : undefined} />
              ) : (data.months.length > 0 || !manual) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {/* indicator: สดจาก MOPH */}
                  {isLive && !loading && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-200 text-red-600 rounded-full text-xs font-medium">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      สดจาก MOPH
                    </span>
                  )}
                  {/* มุมมอง: รายตำบล / รายหน่วยบริการ — ซ่อนถ้ามีแค่แถวเดียว (KPI ระดับอำเภอ เช่น เอกสาร HDC
                      ไม่รองรับแยกตำบล/หน่วยบริการจริง) เพราะสลับ 2 ปุ่มแล้วได้ผลเหมือนกันเป๊ะ ไม่มีตัวเลือกจริงให้กด */}
                  {data.months.length > 0 && groups.length !== 1 && (
                    <div className="inline-flex rounded-lg border overflow-hidden text-sm">
                      <button onClick={() => changeView('area')}
                        className={`px-3 py-2 ${view === 'area' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        รายตำบล
                      </button>
                      <button onClick={() => changeView('unit')}
                        className={`px-3 py-2 border-l ${view === 'unit' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        รายหน่วยบริการ
                      </button>
                    </div>
                  )}
                  <select
                    value={isLive ? 'live' : (data.month ?? '')}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === 'live') { setIsLive(true); load('live', view) }
                      else { setIsLive(false); load(val, view) }
                    }}
                    className="border rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="live">ล่าสุด (สดจาก MOPH)</option>
                    {data.months.map((m) => <option key={m} value={m}>{formatThaiMonth(m)}</option>)}
                  </select>
                </div>
              )}
            </div>

            {textMode ? (
              <>
                {/* L1/L1b: ชนิดข้อความ (ไม่ประเมิน) / ระดับ (ตัดสินผ่าน-ไม่ผ่านตามระดับ) */}
                <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm leading-relaxed">
                  {levelMode
                    ? <>ℹ️ KPI นี้ <b>เลือกระดับ</b> — ระบบตัดสินผ่าน/ไม่ผ่านตามระดับเป้าหมายที่ตั้งไว้ · เลือกระดับที่ทำได้จากรายการ</>
                    : <>ℹ️ KPI นี้ <b>กรอกผลงานเป็นข้อความ</b> (ไม่คิดเป็น % ไม่ประเมินผ่าน/ไม่ผ่าน) — พิมพ์สถานะ/ความคืบหน้า เช่น &quot;อยู่ระหว่างดำเนินการ&quot;, &quot;ท้าทาย&quot;, &quot;2 ทีม&quot;</>}
                </div>
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-3">
                  <div className="px-5 py-3 border-b flex items-center justify-between gap-3">
                    <h2 className="font-semibold text-gray-800 text-sm">ผลงาน — {periodLabel} {canEdit && (editing
                      ? <span className="text-xs font-normal text-blue-600">(กำลังแก้ไข)</span>
                      : <span className="text-xs font-normal text-gray-400">🔒 ล็อก</span>)}</h2>
                    <span className="shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">{levelMode ? 'ระดับ' : 'เชิงคุณภาพ'}</span>
                  </div>
                  <div className="px-5 py-4">
                    {canEdit && editing ? (() => {
                      const opts = (data.textOptions ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
                      // มีตัวเลือก → dropdown + "อื่นๆ" · ไม่มี → พิมพ์เองล้วน (เหมือนเดิม)
                      if (opts.length === 0) {
                        return <textarea value={sText} onChange={(e) => setSText(e.target.value)} maxLength={255} rows={3}
                          placeholder="เช่น อยู่ระหว่างดำเนินการ / ท้าทาย / ผ่านเกณฑ์"
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      }
                      const showCustom = sTextCustom || (sText !== '' && !opts.includes(sText))
                      return (
                        <>
                          <select
                            value={sText === '' && !sTextCustom ? '' : (opts.includes(sText) ? sText : '__custom__')}
                            onChange={(e) => {
                              if (e.target.value === '__custom__') { setSTextCustom(true); setSText('') }
                              else { setSTextCustom(false); setSText(e.target.value) }
                            }}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="" disabled>— เลือกผลงาน —</option>
                            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                            <option value="__custom__">อื่นๆ (พิมพ์เอง)…</option>
                          </select>
                          {showCustom && (
                            <textarea value={sText} onChange={(e) => setSText(e.target.value)} maxLength={255} rows={2}
                              placeholder="พิมพ์ผลงาน"
                              className="w-full border rounded-lg px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          )}
                        </>
                      )
                    })()
                      : <p className="text-gray-800 text-sm whitespace-pre-wrap">{data.savedMonthly?.valueText || <span className="text-gray-400">— ยังไม่ได้กรอกเดือนนี้ —</span>}</p>}
                  </div>
                  {canEdit && (
                    <div className="px-5 py-4 border-t flex flex-wrap items-center gap-3">
                      {editing ? (
                        <>
                          <button onClick={saveTextValue} disabled={mSaving}
                            className="bg-blue-800 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm px-5 py-2 rounded-lg font-medium">
                            {mSaving ? 'กำลังบันทึก...' : 'บันทึกผลงาน'}
                          </button>
                          {manualSaved && (
                            <button onClick={() => { setEditing(false); setMMsg(''); load(entryMonth) }} disabled={mSaving}
                              className="border text-gray-600 hover:bg-gray-50 text-sm px-4 py-2 rounded-lg">
                              ยกเลิก
                            </button>
                          )}
                          {mMsg && <span className="text-sm">{mMsg}</span>}
                        </>
                      ) : (
                        <>
                          <span className="text-sm text-gray-600">
                            🔒 บันทึกแล้ว{manualSaved?.enteredBy ? ` โดย ${manualSaved.enteredBy}` : ''}
                            {manualSaved?.enteredAt ? ` · ${new Date(manualSaved.enteredAt).toLocaleString('th-TH')}` : ''}
                          </span>
                          <button onClick={() => { setEditing(true); setMMsg('') }}
                            className="bg-amber-500 hover:bg-amber-600 text-white text-sm px-4 py-2 rounded-lg font-medium">
                            ✏️ แก้ไข
                          </button>
                          {mMsg && <span className="text-sm">{mMsg}</span>}
                        </>
                      )}
                    </div>
                  )}
                </div>
                {!canEdit && <p className="text-xs text-gray-400 mb-6">* เฉพาะผู้ดูแลระบบ หรือเจ้าหน้าที่กลุ่มงานที่รับผิดชอบ กรอก/แก้ค่าได้</p>}
              </>
            ) : singleMode ? (
              <>
                {/* การ์ดสรุป — ค่าเดียว (ยึดค่าที่บันทึกจริงจากเซิร์ฟเวอร์เสมอ ไม่ใช่ฟอร์มที่กำลังกรอก
                    กันเคส legacy ที่ยังไม่มี B/A ดิบ — ไม่งั้น % ที่เคยบันทึกถูกจะหายไปเป็น "—" ตอนเปิดหน้า) */}
                <div className="bg-white rounded-xl shadow-sm border p-5 mb-6 flex flex-wrap items-center gap-8">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-blue-700">
                      {committedPct != null ? committedPct : '—'}
                      <span className="text-xl text-gray-400"> {data.kpi.unit}</span>
                    </div>
                    <p className="text-gray-500 text-xs mt-1">
                      {committedRawTarget != null
                        ? `${(committedRawResult ?? 0).toLocaleString()}/${committedRawTarget.toLocaleString()}`
                        : (committedPct != null ? 'ไม่มีข้อมูลดิบ (บันทึกก่อนอัปเดตระบบ)' : 'ยังไม่มีข้อมูล')}
                      {' — '}{qInfo ? qInfo.label : formatThaiMonth(entryMonth)}
                    </p>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>เป้าหมาย: <b>{target}</b> {data.kpi.unit} ({direction && DIRECTION_LABEL[direction]})</p>
                    {committedStatus && (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[committedStatus]}`}>
                        {STATUS_META[committedStatus].label}
                      </span>
                    )}
                    {manualSaved?.enteredBy && (
                      <p className="text-xs text-gray-400">
                        อัปเดตล่าสุดโดย {manualSaved.enteredBy}
                        {manualSaved.enteredAt ? ` · ${new Date(manualSaved.enteredAt).toLocaleString('th-TH')}` : ''}
                      </p>
                    )}
                  </div>
                </div>

                {data.stale && (
                  <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
                    ⚠️ ยังไม่ได้กรอกข้อมูล<b>เดือนนี้</b>
                    {data.lastMonth ? ` — ค่าที่แสดงเป็นของเดือนล่าสุด (${formatThaiMonth(data.lastMonth)})` : ''} · กรุณากรอกด้านล่าง
                  </div>
                )}

                {legacyNoRaw && (
                  <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
                    ⚠️ เดือนนี้บันทึกไว้เป็น <b>{committedPct}{data.kpi.unit}</b> ตั้งแต่ก่อนระบบเก็บ "กลุ่มเป้าหมาย"/"ผลงาน (A)" ดิบ —
                    ตัวเลข % ด้านบนยังถูกต้อง แต่ถ้าจะแก้ไข <b>ต้องกรอกทั้ง 2 ช่องใหม่ทั้งคู่</b> (ระบบจะไม่เดาค่าเดิมให้ กันเพี้ยนซ้ำ)
                  </div>
                )}

                <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm leading-relaxed">
                  ℹ️ KPI นี้ <b>กรอกค่าเอง แบบค่าเดียว</b> (ไม่แยกราย รพ.สต.) — กรอก <b>กลุ่มเป้าหมาย</b> และ <b>ผลงาน (A)</b> รวม · ระบบคำนวณ{' '}
                  {ratePer === 100 ? '% = A/B ให้อัตโนมัติ' : `${data.kpi.unit} = A/B × ${ratePer.toLocaleString()} ให้อัตโนมัติ`}
                </div>

                {/* นิยาม/หมายเหตุ — สำคัญมากสำหรับ single-mode เพราะ "กลุ่มเป้าหมาย"/"ผลงาน (A)" เป็นป้ายทั่วไป
                    บาง KPI (เช่น เทียบค่าเฉลี่ยย้อนหลัง) ความหมายจริงไม่ตรงตัวป้าย ต้องมีคำอธิบายเฉพาะตัวกันสับสน */}
                {data.kpi.description && (
                  <div className="mb-6 bg-white rounded-xl shadow-sm border p-5 text-sm text-gray-600">
                    <h3 className="font-semibold text-gray-800 mb-2 text-sm">นิยาม / วิธีกรอก</h3>
                    <p className="whitespace-pre-line">{data.kpi.description}</p>
                  </div>
                )}

                {/* กราฟแท่ง — ค่าเดียว (โรงพยาบาลดงเจริญ) */}
                <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
                  <h2 className="font-semibold text-gray-800 mb-3 text-sm">แผนภูมิ — {periodLabel}</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={[{ name: SINGLE_MODE_UNIT_NAME, value: committedPct ?? 0, status: committedStatus }]}
                      margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v) => [`${v} ${data.kpi.unit}`]} />
                      {target > 0 && direction !== 'none' && (
                        <ReferenceLine y={target} stroke="#dc2626" strokeDasharray="6 4"
                          label={{ value: `เป้าหมาย ${target}`, fill: '#dc2626', fontSize: 12, position: 'insideTopRight' }} />
                      )}
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={80}>
                        <Cell fill={committedStatus ? (BAR_COLOR[committedStatus] ?? '#3b82f6') : '#9ca3af'} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* ตารางกรอกค่าเดียว */}
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-3">
                  <div className="px-5 py-3 border-b flex items-center justify-between">
                    <h2 className="font-semibold text-gray-800 text-sm">ตาราง — {periodLabel} {canEdit && (editing
                      ? <span className="text-xs font-normal text-blue-600">(กำลังแก้ไข)</span>
                      : <span className="text-xs font-normal text-gray-400">🔒 ล็อก</span>)}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">หน่วยบริการ</th>
                          <th className="text-right px-3 py-2 font-medium">กลุ่มเป้าหมาย (B)</th>
                          <th className="text-right px-3 py-2 font-medium">ผลงาน (A)</th>
                          <th className="text-right px-4 py-2 font-medium">{ratePer === 100 ? '% (A/B)' : `${data?.kpi.unit ?? ''} (A/B×${ratePer.toLocaleString()})`}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-900">{SINGLE_MODE_UNIT_NAME}</td>
                          <td className="px-3 py-2 text-right">
                            {canEdit && editing
                              ? <input type="number" min="0" value={sTarget} onChange={(e) => setSTarget(e.target.value)}
                                  className="border rounded px-2 py-1 text-sm w-24 text-right" />
                              : <span className="tabular-nums text-gray-700">{sTargetNum > 0 ? sTargetNum.toLocaleString() : '—'}</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {canEdit && editing
                              ? <input type="number" min="0" value={sResult} onChange={(e) => setSResult(e.target.value)}
                                  className="border rounded px-2 py-1 text-sm w-24 text-right" />
                              : <span className="tabular-nums text-gray-700">{sTargetNum > 0 ? sResultNum.toLocaleString() : '—'}</span>}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold">{sTargetNum > 0 ? sPct : '—'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {canEdit && (
                    <div className="px-5 py-4 border-t flex flex-wrap items-center gap-3">
                      {editing ? (
                        <>
                          <button onClick={saveSingleValue} disabled={mSaving}
                            className="bg-blue-800 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm px-5 py-2 rounded-lg font-medium">
                            {mSaving ? 'กำลังบันทึก...' : 'บันทึกผลงาน'}
                          </button>
                          {manualSaved && (
                            <button onClick={() => { setEditing(false); setMMsg(''); load(entryMonth) }} disabled={mSaving}
                              className="border text-gray-600 hover:bg-gray-50 text-sm px-4 py-2 rounded-lg">
                              ยกเลิก
                            </button>
                          )}
                          {mMsg && <span className="text-sm">{mMsg}</span>}
                        </>
                      ) : (
                        <>
                          <span className="text-sm text-gray-600">
                            🔒 บันทึกแล้ว{manualSaved?.enteredBy ? ` โดย ${manualSaved.enteredBy}` : ''}
                            {manualSaved?.enteredAt ? ` · ${new Date(manualSaved.enteredAt).toLocaleString('th-TH')}` : ''}
                          </span>
                          <button onClick={() => { setEditing(true); setMMsg('') }}
                            className="bg-amber-500 hover:bg-amber-600 text-white text-sm px-4 py-2 rounded-lg font-medium">
                            ✏️ แก้ไข
                          </button>
                          {mMsg && <span className="text-sm">{mMsg}</span>}
                        </>
                      )}
                    </div>
                  )}
                </div>
                {!canEdit && <p className="text-xs text-gray-400 mb-6">* เฉพาะผู้ดูแลระบบ หรือเจ้าหน้าที่กลุ่มงานที่รับผิดชอบ กรอก/แก้ค่าได้</p>}
              </>
            ) : manual ? (
              <>
                {/* การ์ดสรุป — รวมอำเภอ (คำนวณสดจากตารางที่กรอก ΣA/ΣB) */}
                <div className="bg-white rounded-xl shadow-sm border p-5 mb-6 flex flex-wrap items-center gap-8">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-blue-700">
                      {liveSumT > 0 ? liveTotalPct : '—'}
                      <span className="text-xl text-gray-400"> {data.kpi.unit}</span>
                    </div>
                    <p className="text-gray-500 text-xs mt-1">รวมอำเภอ ({liveSumA.toLocaleString()}/{liveSumT.toLocaleString()}) — {qInfo ? qInfo.label : formatThaiMonth(entryMonth)}</p>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>เป้าหมาย: <b>{target}</b> {data.kpi.unit} ({direction && DIRECTION_LABEL[direction]})</p>
                    {liveSumT > 0 && manualStatus && (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[manualStatus]}`}>
                        {STATUS_META[manualStatus].label}
                      </span>
                    )}
                    {manualSaved?.enteredBy && (
                      <p className="text-xs text-gray-400">
                        อัปเดตล่าสุดโดย {manualSaved.enteredBy}
                        {manualSaved.enteredAt ? ` · ${new Date(manualSaved.enteredAt).toLocaleString('th-TH')}` : ''}
                      </p>
                    )}
                  </div>
                </div>

                {data.stale && (
                  <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
                    ⚠️ ยังไม่ได้กรอกข้อมูล<b>เดือนนี้</b>
                    {data.lastMonth ? ` — ค่าที่แสดงเป็นของเดือนล่าสุด (${formatThaiMonth(data.lastMonth)})` : ''} · กรุณากรอกรายหน่วยบริการด้านล่าง
                  </div>
                )}

                <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm leading-relaxed">
                  ℹ️ KPI นี้ <b>กรอกค่าเอง รายหน่วยบริการ</b> — เปิด HDC (มุมมองรายหน่วยบริการ) แล้วกรอก <b>กลุ่มเป้าหมาย</b> และ <b>ผลงาน (A)</b> ของแต่ละหน่วย · ระบบคำนวณ % = A/B ให้อัตโนมัติ · ไม่ดึง/ทับค่าจาก MOPH
                </div>

                {/* กราฟแท่ง %รายหน่วยบริการ (สด) */}
                <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
                  <h2 className="font-semibold text-gray-800 mb-3 text-sm">แผนภูมิ %รายหน่วยบริการ — {periodLabel}</h2>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v) => [`${v} ${data.kpi.unit}`]} />
                      {target > 0 && direction !== 'none' && (
                        <ReferenceLine y={target} stroke="#dc2626" strokeDasharray="6 4"
                          label={{ value: `เป้าหมาย ${target}`, fill: '#dc2626', fontSize: 12, position: 'insideTopRight' }} />
                      )}
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {chartData.map((d, i) => <Cell key={i} fill={BAR_COLOR[d.status] ?? '#3b82f6'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* ตารางกรอกรายหน่วยบริการ */}
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-3">
                  <div className="px-5 py-3 border-b flex items-center justify-between">
                    <h2 className="font-semibold text-gray-800 text-sm">ตารางรายหน่วยบริการ — {periodLabel} {canEdit && (editing
                      ? <span className="text-xs font-normal text-blue-600">(กำลังแก้ไข)</span>
                      : <span className="text-xs font-normal text-gray-400">🔒 ล็อก</span>)}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">หน่วยบริการ</th>
                          <th className="text-right px-3 py-2 font-medium">กลุ่มเป้าหมาย</th>
                          <th className="text-right px-3 py-2 font-medium">ผลงาน (A)</th>
                          <th className="text-right px-4 py-2 font-medium">% (A/B)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {liveRows.map((r) => (
                          <tr key={r.code} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium text-gray-900">{r.name}</td>
                            <td className="px-3 py-2 text-right">
                              {canEdit && editing
                                ? <input type="number" min="0" value={r.target} onChange={(e) => setRow(r.code, 'target', e.target.value)}
                                    className="border rounded px-2 py-1 text-sm w-24 text-right" />
                                : <span className="tabular-nums text-gray-700">{r.t.toLocaleString()}</span>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {canEdit && editing
                                ? <input type="number" min="0" value={r.result} onChange={(e) => setRow(r.code, 'result', e.target.value)}
                                    className="border rounded px-2 py-1 text-sm w-24 text-right" />
                                : <span className="tabular-nums text-gray-700">{r.a.toLocaleString()}</span>}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums font-semibold">{r.pct ?? '—'}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-100 font-semibold">
                          <td className="px-4 py-2.5">รวมอำเภอ</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{liveSumT.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{liveSumA.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{liveSumT > 0 ? liveTotalPct : '—'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {canEdit && (
                    <div className="px-5 py-4 border-t flex flex-wrap items-center gap-3">
                      {editing ? (
                        <>
                          <button onClick={saveManualDetail} disabled={mSaving}
                            className="bg-blue-800 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm px-5 py-2 rounded-lg font-medium">
                            {mSaving ? 'กำลังบันทึก...' : 'บันทึกรายหน่วยบริการ'}
                          </button>
                          {/* ยกเลิก: คืนค่ากลับเป็นที่บันทึกไว้ (เฉพาะเดือนที่มีข้อมูลเดิม) */}
                          {manualSaved && (
                            <button onClick={() => { setEditing(false); setMMsg(''); load(entryMonth) }} disabled={mSaving}
                              className="border text-gray-600 hover:bg-gray-50 text-sm px-4 py-2 rounded-lg">
                              ยกเลิก
                            </button>
                          )}
                          {mMsg && <span className="text-sm">{mMsg}</span>}
                          <span className="text-xs text-gray-400">เปิด HDC (รายหน่วยบริการ) → คัดลอก B (เป้าหมาย) / A (ผลงาน) แต่ละหน่วยมากรอก</span>
                        </>
                      ) : (
                        <>
                          <span className="text-sm text-gray-600">
                            🔒 บันทึกแล้ว{manualSaved?.enteredBy ? ` โดย ${manualSaved.enteredBy}` : ''}
                            {manualSaved?.enteredAt ? ` · ${new Date(manualSaved.enteredAt).toLocaleString('th-TH')}` : ''}
                          </span>
                          <button onClick={() => { setEditing(true); setMMsg('') }}
                            className="bg-amber-500 hover:bg-amber-600 text-white text-sm px-4 py-2 rounded-lg font-medium">
                            ✏️ แก้ไข
                          </button>
                          {mMsg && <span className="text-sm">{mMsg}</span>}
                        </>
                      )}
                    </div>
                  )}
                </div>
                {!canEdit && <p className="text-xs text-gray-400 mb-6">* เฉพาะผู้ดูแลระบบ หรือเจ้าหน้าที่กลุ่มงานที่รับผิดชอบ กรอก/แก้ค่าได้</p>}
              </>
            ) : data.months.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
                {data.message ?? 'ยังไม่มีข้อมูล detail'}
              </div>
            ) : (
              <>
                {/* สรุประดับอำเภอ */}
                <div className="bg-white rounded-xl shadow-sm border p-5 mb-6 flex flex-wrap items-center gap-8">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-blue-700">
                      {total?.calcValue ?? '—'}
                      {total?.calcValue !== null && <span className="text-xl text-gray-400"> {data.kpi.unit}</span>}
                    </div>
                    <p className="text-gray-500 text-xs mt-1">รวมอำเภอ (คำนวณจาก detail)</p>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>เป้าหมาย: <b>{target}</b> {data.kpi.unit} ({direction && DIRECTION_LABEL[direction]})</p>
                    {data.savedMonthly && (
                      <p className="text-xs text-gray-400">
                        ค่าที่บันทึกบน Scorecard เดือนนี้: {data.savedMonthly.value} {data.kpi.unit}
                      </p>
                    )}
                    {total?.status && (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[total.status]}`}>
                        {STATUS_META[total.status].label}
                      </span>
                    )}
                  </div>
                </div>

                {data.liveError && (
                  <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    ⚠️ ดึงข้อมูลจาก MOPH ไม่สำเร็จ: {data.liveError}
                  </div>
                )}

                {/* คำนิยาม B/A (แบบ HDC — เหนือตาราง) */}
                {data.legend && (
                  <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-600 leading-relaxed">
                    {data.legend.split('\n').map((line, i) => <p key={i}>{line}</p>)}
                  </div>
                )}

                {!data.mappingOk && (
                  <div className="mb-6 bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-lg text-sm">
                    ⚠️ สูตรคำนวณของ KPI นี้ยังไม่ได้รับการยืนยัน — แสดงเฉพาะยอดดิบราย{viewLabel} ยังไม่คิด %
                  </div>
                )}

                {/* กราฟแท่งรายพื้นที่/หน่วยบริการ + เส้นเป้าหมาย (แบบ HDC) */}
                {showPct && (
                  <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
                    <h2 className="font-semibold text-gray-800 mb-3 text-sm">แผนภูมิราย{viewLabel} — เดือน{formatThaiMonth(data.month!)}</h2>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v) => [`${v} ${data.kpi.unit}`]} />
                        {target > 0 && direction !== 'none' && (
                          <ReferenceLine y={target} stroke="#dc2626" strokeDasharray="6 4"
                            label={{ value: `เป้าหมาย ${target}`, fill: '#dc2626', fontSize: 12, position: 'insideTopRight' }} />
                        )}
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {chartData.map((d, i) => <Cell key={i} fill={BAR_COLOR[d.status] ?? '#3b82f6'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ตารางรายพื้นที่/หน่วยบริการ (HDC-style) */}
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-6">
                  <div className="px-5 py-3 border-b">
                    <h2 className="font-semibold text-gray-800 text-sm">ตารางราย{viewLabel} — เดือน{formatThaiMonth(data.month!)}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium sticky left-0 z-10 bg-gray-50">{viewLabel}</th>
                          {fieldList.map((f) => (
                            <th key={f} className="text-right px-3 py-2 font-medium whitespace-nowrap">{fieldLabels[f] ?? f}</th>
                          ))}
                          {showPct && <th className="text-right px-4 py-2 font-medium">ผลงาน ({data.kpi.unit})</th>}
                          {showPct && <th className="text-center px-4 py-2 font-medium">สถานะ</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {groups.map((g) => (
                          <tr key={g.code} className="group hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-900 sticky left-0 z-10 bg-white group-hover:bg-gray-50">{g.name}</td>
                            {fieldList.map((f) => (
                              <td key={f} className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                                {(g.fields[f] ?? 0).toLocaleString()}
                              </td>
                            ))}
                            {showPct && (
                              <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                                {g.calcValue ?? '—'}
                              </td>
                            )}
                            {showPct && (
                              <td className="px-4 py-2.5 text-center">
                                {g.status && (
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[g.status]}`}>
                                    {STATUS_META[g.status].label}
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                        {/* groups.length===1 → แถวเดียวนั้นคือค่าเดียวกับ total อยู่แล้ว (เช่น KPI ระดับอำเภอล้วน) ไม่ต้องซ้ำแถว */}
                        {total && groups.length !== 1 && (
                          <tr className="bg-gray-100 font-semibold">
                            <td className="px-4 py-2.5 sticky left-0 z-10 bg-gray-100">{total.name}</td>
                            {fieldList.map((f) => (
                              <td key={f} className="px-3 py-2.5 text-right tabular-nums">
                                {(total.fields[f] ?? 0).toLocaleString()}
                              </td>
                            ))}
                            {showPct && <td className="px-4 py-2.5 text-right tabular-nums">{total.calcValue ?? '—'}</td>}
                            {showPct && (
                              <td className="px-4 py-2.5 text-center">
                                {total.status && (
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[total.status]}`}>
                                    {STATUS_META[total.status].label}
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* นิยาม/หมายเหตุ (แบบใต้ตาราง HDC) */}
                {data.kpi.description && (
                  <div className="bg-white rounded-xl shadow-sm border p-5 text-sm text-gray-600">
                    <h3 className="font-semibold text-gray-800 mb-2 text-sm">นิยาม / หมายเหตุ</h3>
                    <p className="whitespace-pre-line">{data.kpi.description}</p>
                  </div>
                )}
              </>
            )}

            {/* L4: ตาราง+กราฟสรุปทั้งปีงบ — สลับดู "รายไตรมาส ↔ รายเดือน" ได้ทุกตัวชี้วัด
                (พื้นฐานเก็บรายเดือน · ไตรมาสเป็นมุมมอง/รอบส่งเท่านั้น) */}
            {allMonths.length > 0 && (
              <QuarterSummary
                fiscalYear={fiscalYearOfMonth(entryMonth) || currentQuarter().fiscalYear}
                values={allMonths}
                target={target}
                direction={direction ?? 'none'}
                unit={data.kpi.unit}
                isText={textMode}
              />
            )}

            {/* ── L2: บันทึกเชิงคุณภาพต่อรอบ (ปัญหา/แนวทาง/แหล่งที่มา) — แสดงทั้ง KPI auto และ manual ── */}
            {notesPeriod && (
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden mt-6">
                <div className="px-5 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="font-semibold text-gray-800 text-sm">
                    📝 บันทึกการดำเนินงาน — {notesPeriodLabel}
                  </h2>
                  {canEditNotes && !nEditing && (
                    <button
                      onClick={() => { setNEditing(true); setNMsg('') }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50">
                      ✏️ แก้ไข
                    </button>
                  )}
                </div>
                <div className="p-5 space-y-4">
                  {nSavedBy?.by && !nEditing && (
                    <p className="text-xs text-gray-500 bg-gray-50 border rounded-lg px-3 py-2">
                      🔒 บันทึกแล้วโดย {nSavedBy.by}{nSavedBy.at ? ` · ${nSavedBy.at}` : ''}
                    </p>
                  )}
                  {[
                    { label: 'ปัญหา/อุปสรรค', value: nProblem, set: setNProblem, rows: 3,
                      ph: 'อุปสรรคที่พบในรอบนี้ (ถ้าไม่มี ปล่อยว่างได้)' },
                    { label: 'แนวทางการดำเนินงานต่อไป', value: nNextAction, set: setNNextAction, rows: 3,
                      ph: 'แผน/สิ่งที่จะทำต่อในรอบถัดไป' },
                  ].map((f) => (
                    <div key={f.label}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                      {canEditNotes && nEditing ? (
                        <textarea
                          value={f.value} onChange={(e) => f.set(e.target.value)} rows={f.rows}
                          placeholder={f.ph}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      ) : (
                        <p className="text-sm text-gray-700 whitespace-pre-line min-h-[1.5rem]">
                          {f.value || <span className="text-gray-400 italic">— ยังไม่ได้บันทึก —</span>}
                        </p>
                      )}
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">แหล่งที่มาข้อมูล</label>
                    {canEditNotes && nEditing ? (
                      <input
                        value={nDataRef} onChange={(e) => setNDataRef(e.target.value)}
                        placeholder="ลิงก์รายงาน หรือระบุช่องทาง/ผู้รับผิดชอบ"
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    ) : (
                      <p className="text-sm text-gray-700 break-all min-h-[1.5rem]">
                        {nDataRef || <span className="text-gray-400 italic">— ยังไม่ได้บันทึก —</span>}
                      </p>
                    )}
                  </div>

                  {canEditNotes && nEditing && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => saveNotes(notesPeriod)} disabled={nSaving}
                        className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-50">
                        {nSaving ? 'กำลังบันทึก…' : '💾 บันทึกหมายเหตุ'}
                      </button>
                      {nSavedBy && (
                        <button
                          onClick={() => { loadNotes(notesPeriod) }} disabled={nSaving}
                          className="px-4 py-2 rounded-lg border text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                          ยกเลิก
                        </button>
                      )}
                    </div>
                  )}
                  {nMsg && <p className="text-sm text-gray-700">{nMsg}</p>}
                  {!canEditNotes && (
                    <p className="text-xs text-gray-400">
                      * เฉพาะผู้ดูแลระบบ หรือเจ้าหน้าที่กลุ่มงานที่รับผิดชอบ บันทึก/แก้ไขได้
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
