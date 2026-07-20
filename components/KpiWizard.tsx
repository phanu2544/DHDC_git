'use client'

import { useState } from 'react'
import FieldChipBuilder from '@/components/FieldChipBuilder'
import ThaiMonthInput from '@/components/ThaiMonthInput'
import type { CalcMode, EvalDirection, MophMapping } from '@/lib/types'

/**
 * KpiWizard — flow เดียวจบ: เพิ่ม KPI + ดึงข้อมูล MOPH เดือนแรก
 * ใช้ API เดิมทั้งหมด (ไม่แตะ backend):
 *   1. POST /api/kpis           สร้าง KPI → ได้ id
 *   2. PATCH /api/kpis/{id}     บันทึก mophConfig (mapping JSON)
 *   3. POST /api/moph/batch     { kpiId } → runBatchSave: monthly_data + moph_monthly_detail
 * manual (กรอกค่าเอง) → สร้าง KPI อย่างเดียว ข้าม step 2–3
 */

const CALC_MODES: { value: CalcMode; label: string }[] = [
  { value: 'percent',  label: 'ร้อยละ (Σเศษ/Σส่วน × 100)' },
  { value: 'sum',      label: 'ผลรวม (sum valueField)' },
  { value: 'raw',      label: 'ค่าดิบ (ค่าแรกที่พบ)' },
  { value: 'noTarget', label: 'ติดตามเฉยๆ (ไม่ประเมินผ่าน/ไม่ผ่าน)' },
]

const DIRECTIONS: { value: EvalDirection; label: string }[] = [
  { value: 'gte',  label: '≥ ยิ่งมากยิ่งดี (ผ่านเมื่อ value ≥ เป้า)' },
  { value: 'lte',  label: '≤ ยิ่งน้อยยิ่งดี (ผ่านเมื่อ value ≤ เป้า)' },
  { value: 'eq',   label: '= ต้องเท่ากับเป้า' },
  { value: 'none', label: '– ไม่ประเมิน / ติดตามเฉยๆ' },
]

const BY_YEARS = ['2569', '2568', '2567', '2566', '2565']

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface PreviewResp {
  ok: boolean
  rows: number
  fields: string[]
  fieldTypes: Record<string, string>
  sample: Record<string, unknown>[]
  message?: string
}

interface BatchItem {
  kpiId: string; kpiName: string; status: 'ok' | 'error' | 'skipped'
  calcValue?: number; rows?: number; error?: string; skipReason?: string; warnings?: string[]
}
interface BatchResp {
  ok: boolean; message?: string; savedMonth?: string
  total?: number; saved?: number; skipped?: number; failed?: number
  results?: BatchItem[]
}

export default function KpiWizard({
  categories, knownTables, onClose, onDone,
}: {
  categories: string[]
  knownTables: [string, string][]
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [step, setStep] = useState(1)

  // Step 1 — ข้อมูล KPI
  const [name, setName] = useState('')
  const [category, setCategory] = useState(categories[0] ?? '')
  const [owner, setOwner] = useState('')
  const [target, setTarget] = useState(0)
  const [unit, setUnit] = useState('%')
  const [direction, setDirection] = useState<EvalDirection>('gte')
  const [deadline, setDeadline] = useState('')
  const [manual, setManual] = useState(false)

  // Step 2 — แหล่งข้อมูล + preview
  const [table, setTable] = useState('')
  const [year, setYear] = useState('2569')
  const [province, setProvince] = useState('66')
  const [areacode, setAreacode] = useState('6611')
  const [hospcode, setHospcode] = useState('')
  const [preview, setPreview] = useState<PreviewResp | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewErr, setPreviewErr] = useState('')

  // Step 3 — mapping
  const [calcMode, setCalcMode] = useState<CalcMode>('percent')
  const [fieldMode, setFieldMode] = useState<'singleField' | 'sumFields'>('singleField')
  const [valueFields, setValueFields] = useState<string[]>(['result'])
  const [denomFields, setDenomFields] = useState<string[]>(['target'])

  // Step 4 — submit
  const [month, setMonth] = useState(currentMonth)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ id: string; batch?: BatchResp; error?: string } | null>(null)

  // ── live sums จาก preview sample (แบบเดียวกับ footer ตารางในแท็บ MOPH) ──
  const sumOf = (f: string) => (preview?.sample ?? []).reduce((s, r) => s + (Number(r[f]) || 0), 0)
  const numSum = valueFields.reduce((s, f) => s + sumOf(f.trim()), 0)
  const denSum = denomFields.reduce((s, f) => s + sumOf(f.trim()), 0)
  const livePct = calcMode === 'percent' && denSum > 0 ? (numSum / denSum) * 100 : null

  // เปลี่ยน table/year/province/areacode/hospcode แล้วต้องกด Preview ใหม่เสมอ
  // กัน field/preview เก่าค้าง (เช่น preview ตาราง A แล้วเปลี่ยนเป็นตาราง B โดยไม่กด Preview ซ้ำ)
  function invalidatePreview() {
    setPreview(null)
    setPreviewErr('')
  }

  async function runPreview() {
    if (!table.trim()) { setPreviewErr('กรุณาระบุ Table Name'); return }
    setPreviewLoading(true); setPreview(null); setPreviewErr('')
    try {
      const params = new URLSearchParams({ tableName: table.trim(), year, province })
      if (areacode) params.set('areacode', areacode)
      if (hospcode) params.set('hospcode', hospcode)
      const res = await fetch(`/api/moph?${params}`)
      const data: PreviewResp = await res.json()
      if (!res.ok || !data.ok) { setPreviewErr(data.message || 'ดึง preview ไม่สำเร็จ'); return }
      if (data.rows === 0) { setPreviewErr('ไม่พบข้อมูลตาม filter (ตรวจ table/areacode/hospcode)'); setPreview(data); return }
      setPreview(data)
    } catch (e) {
      setPreviewErr(String(e))
    } finally {
      setPreviewLoading(false)
    }
  }

  function setFieldModeSafe(m: 'singleField' | 'sumFields') {
    setFieldMode(m)
    if (m === 'singleField') {
      setValueFields((prev) => prev.slice(0, 1))
      setDenomFields((prev) => prev.slice(0, 1))
    }
  }

  // ── ตรวจก่อนไปสเต็ปถัดไป ──
  const step1Ok = !!(name.trim() && owner.trim() && deadline)
  const step2Ok = !!(preview && preview.ok && preview.rows > 0)
  const step3Ok = valueFields.some((f) => f.trim()) &&
    (calcMode !== 'percent' || denomFields.some((f) => f.trim()))

  function next() {
    if (step === 1) { setStep(manual ? 4 : 2); return }
    if (step === 2) { setStep(3); return }
    if (step === 3) { setStep(4); return }
  }
  function back() {
    if (step === 4) { setStep(manual ? 1 : 3); return }
    if (step === 3) { setStep(2); return }
    if (step === 2) { setStep(1); return }
  }

  async function submit() {
    setSubmitting(true); setResult(null)
    try {
      // 1. สร้าง KPI
      const createRes = await fetch('/api/kpis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), category, owner: owner.trim(), deadline,
          target, unit, direction, status: 'in_progress',
          mophTable: manual ? '' : table.trim(),
          mophValueField: manual ? '' : (valueFields[0]?.trim() ?? ''),
          mophTargetField: manual ? '' : (denomFields[0]?.trim() ?? 'target'),
          mophCalcMode: calcMode,
          manualEntry: manual,
        }),
      })
      const createData = await createRes.json()
      if (!createRes.ok) { setResult({ id: '', error: createData.message || 'สร้าง KPI ไม่สำเร็จ' }); return }
      const id: string = createData.id

      if (manual) {
        setResult({ id })
        onDone('สร้าง KPI (กรอกค่าเอง) สำเร็จ — กรอกค่าที่หน้า KPI ได้เลย')
        return
      }

      // 2. บันทึก mapping JSON
      const mapping: MophMapping = {
        fieldMode,
        valueFields: valueFields.map((f) => f.trim()).filter(Boolean),
        targetMode: calcMode === 'percent' ? 'field' : 'none',
        targetFields: calcMode === 'percent' ? denomFields.map((f) => f.trim()).filter(Boolean) : undefined,
        calcMode,
        aggregate: 'sum',
      }
      const patchRes = await fetch(`/api/kpis/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mophConfig: mapping }),
      })
      if (!patchRes.ok) {
        // mapping ไม่ถูกบันทึก → ห้ามดึงต่อ ไม่งั้น batch จะ fallback ไปใช้ legacy field เดียว
        // (ผิดเงียบๆ ถ้าเลือก sumFields หลาย field) — KPI สร้างแล้ว ให้ตั้ง mapping ที่แท็บ MOPH แทน
        const patchData = await patchRes.json().catch(() => ({}))
        setResult({
          id,
          error: `สร้าง KPI สำเร็จ แต่บันทึก Mapping ไม่สำเร็จ: ${patchData.message || 'ไม่ทราบสาเหตุ'} — ไปตั้งค่าที่แท็บ 🌐 ดึงข้อมูล MOPH แล้วดึงข้อมูลด้วยตนเอง`,
        })
        onDone(`สร้าง KPI "${name}" แล้ว (ยังไม่ได้ดึงข้อมูล — ตั้ง Mapping ที่แท็บ MOPH)`)
        return
      }

      // 3. ดึง + บันทึก monthly_data + detail (runBatchSave กรอง kpiId เดียว)
      const batchRes = await fetch('/api/moph/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kpiId: id, year, province,
          areacode: areacode || undefined,
          hospcode: hospcode || undefined,
          month,
        }),
      })
      const batchData: BatchResp = await batchRes.json()
      setResult({ id, batch: batchData })
      onDone(`สร้าง KPI + ดึงข้อมูลเดือน ${batchData.savedMonth ?? month} แล้ว`)
    } catch (e) {
      setResult({ id: '', error: String(e) })
    } finally {
      setSubmitting(false)
    }
  }

  // ─── ผลลัพธ์ (หลัง submit) ─────────────────────────────────────────────
  if (result) {
    const item = result.batch?.results?.[0]
    return (
      <Shell onClose={onClose} title="✅ เสร็จสิ้น">
        <div className="p-6 space-y-4">
          {result.error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              ❌ {result.error}
            </div>
          ) : (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                ✅ สร้าง KPI <strong>{name}</strong> สำเร็จ (id: <code className="font-mono">{result.id}</code>)
              </div>
              {result.batch && (
                <div className="border rounded-lg p-4 space-y-2">
                  <p className="text-sm font-semibold text-gray-800">ผลการดึงข้อมูลเดือน {result.batch.savedMonth ?? month}</p>
                  {item ? (
                    <div className="text-sm">
                      {item.status === 'ok' && (
                        <p className="text-green-700">✅ บันทึกค่า <strong className="font-mono">{item.calcValue}</strong> ({item.rows} หน่วยบริการ)</p>
                      )}
                      {item.status === 'skipped' && (
                        <p className="text-amber-700">⏭️ ข้าม — {item.skipReason}</p>
                      )}
                      {item.status === 'error' && (
                        <p className="text-red-600">❌ {item.error}</p>
                      )}
                      {item.warnings && item.warnings.length > 0 && (
                        <ul className="mt-1 list-disc list-inside text-xs text-amber-600">
                          {item.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">{result.batch.message || 'ไม่มีรายละเอียดผลลัพธ์'}</p>
                  )}
                </div>
              )}
              {manual && (
                <p className="text-sm text-gray-500">KPI นี้เป็นแบบกรอกค่าเอง — เปิดหน้า KPI เพื่อกรอกค่ารายหน่วยบริการ</p>
              )}
            </>
          )}
          <div className="flex gap-3 pt-2">
            {result.id && (
              <a href={`/kpi/${result.id}`}
                className="flex-1 text-center bg-blue-800 hover:bg-blue-700 text-white text-sm py-2.5 rounded-lg font-medium">
                เปิดหน้า KPI / Drilldown →
              </a>
            )}
            <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm py-2.5 rounded-lg">ปิด</button>
          </div>
        </div>
      </Shell>
    )
  }

  // ─── Stepper header ───────────────────────────────────────────────────
  const steps = manual
    ? [[1, 'ข้อมูล KPI'], [4, 'ยืนยัน']] as [number, string][]
    : [[1, 'ข้อมูล KPI'], [2, 'แหล่งข้อมูล'], [3, 'จับคู่ field'], [4, 'ยืนยัน']] as [number, string][]

  return (
    <Shell onClose={onClose} title="🧭 เพิ่มตัวชี้วัด (ครบ flow)">
      {/* Stepper */}
      <div className="px-6 pt-4 flex items-center gap-2 flex-wrap">
        {steps.map(([n, label], i) => (
          <div key={n} className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border
              ${step === n ? 'bg-blue-700 text-white border-blue-700'
                : step > n ? 'bg-green-50 text-green-700 border-green-300'
                : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
              <span className="font-bold">{step > n ? '✓' : n}</span>{label}
            </span>
            {i < steps.length - 1 && <span className="text-gray-300">→</span>}
          </div>
        ))}
      </div>

      <div className="p-6 space-y-4 max-h-[calc(90vh-11rem)] overflow-y-auto">
        {/* ═══ STEP 1 — ข้อมูล KPI ═══ */}
        {step === 1 && (
          <>
            <Field label="ชื่อ KPI *">
              <textarea value={name} onChange={(e) => setName(e.target.value)} rows={2}
                placeholder="เช่น ผู้ป่วยเบาหวานที่ควบคุมระดับน้ำตาลได้ดี"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="หมวดหมู่">
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="ผู้รับผิดชอบ *">
                <input value={owner} onChange={(e) => setOwner(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Field>
              <Field label="เป้าหมาย">
                <input type="number" value={target} onChange={(e) => setTarget(+e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Field>
              <Field label="หน่วย">
                <input value={unit} onChange={(e) => setUnit(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Field>
            </div>
            <Field label="ทิศทางการประเมิน">
              <select value={direction} onChange={(e) => setDirection(e.target.value as EvalDirection)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {DIRECTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              {target === 0 && direction === 'gte' && (
                <p className="mt-1.5 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5">
                  ⚠️ เป้า=0 + ยิ่งมากยิ่งดี ระบบจะจัดเป็น &quot;ต้องตรวจสอบ&quot; (needs_review)
                </p>
              )}
            </Field>
            <Field label="กำหนดเสร็จ *">
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
            <label className="flex items-start gap-2 cursor-pointer border-t pt-4">
              <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} className="mt-0.5" />
              <span className="text-sm">
                <span className="font-medium text-gray-800">📝 กรอกค่าเอง (manual)</span>
                <span className="block text-xs text-gray-500">ติ๊กเมื่อ HDC ไม่เปิด API ให้ดึง — wizard จะข้ามขั้นตอนดึงข้อมูล สร้าง KPI อย่างเดียว</span>
              </span>
            </label>
          </>
        )}

        {/* ═══ STEP 2 — แหล่งข้อมูล + preview ═══ */}
        {step === 2 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="MOPH Table Name *">
                <input value={table} onChange={(e) => { setTable(e.target.value); invalidatePreview() }}
                  placeholder="s_dm_control"
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Field>
              <Field label="ปีงบประมาณ (พ.ศ.)">
                <select value={year} onChange={(e) => { setYear(e.target.value); invalidatePreview() }}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {BY_YEARS.map((y) => <option key={y}>{y}</option>)}
                </select>
              </Field>
              <Field label="จังหวัด (code)">
                <input value={province} onChange={(e) => { setProvince(e.target.value.replace(/\D/g, '').slice(0, 2)); invalidatePreview() }}
                  placeholder="66"
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Field>
              <Field label="Areacode prefix (จ.+อ.)">
                <input value={areacode} onChange={(e) => { setAreacode(e.target.value.replace(/\D/g, '').slice(0, 6)); invalidatePreview() }}
                  placeholder="6611"
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Field>
              <Field label="Hospcode (เว้นว่าง = ไม่กรอง)">
                <input value={hospcode} onChange={(e) => { setHospcode(e.target.value); invalidatePreview() }}
                  placeholder="27980 (ถ้าต้องการ)"
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </Field>
              <div className="flex items-end">
                <button onClick={runPreview} disabled={previewLoading}
                  className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-400 text-white text-sm px-4 py-2 rounded-lg">
                  {previewLoading ? 'กำลังดึง...' : '🔍 Preview'}
                </button>
              </div>
            </div>

            {/* quick-pick tables */}
            {knownTables.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-gray-400 self-center">ตารางที่รู้จัก:</span>
                {knownTables.map(([t, desc]) => (
                  <button key={t} onClick={() => { setTable(t); invalidatePreview() }} title={desc}
                    className="text-xs font-mono px-2 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100">
                    {t}
                  </button>
                ))}
              </div>
            )}

            {previewErr && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{previewErr}</div>
            )}

            {preview && preview.rows > 0 && (
              <PreviewTable preview={preview} />
            )}
          </>
        )}

        {/* ═══ STEP 3 — mapping ═══ */}
        {step === 3 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="วิธีคำนวณ">
                <select value={calcMode} onChange={(e) => setCalcMode(e.target.value as CalcMode)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CALC_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
              <Field label="Field Mode">
                <div className="flex gap-4 pt-2">
                  {([['singleField', 'Single Field'], ['sumFields', 'Sum Fields']] as [('singleField' | 'sumFields'), string][]).map(([v, l]) => (
                    <label key={v} className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input type="radio" name="wizFieldMode" checked={fieldMode === v}
                        onChange={() => setFieldModeSafe(v)} className="accent-blue-700" />
                      {l}
                    </label>
                  ))}
                </div>
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">
                  ตัวเศษ (Numerator){fieldMode === 'sumFields' && <span className="text-blue-600 font-normal"> — เลือกได้หลาย field</span>}
                </label>
                <FieldChipBuilder
                  fields={valueFields}
                  onChange={setValueFields}
                  availableFields={preview?.fields ?? []}
                  fieldTypes={preview?.fieldTypes ?? {}}
                  color="blue"
                  placeholder="พิมพ์ชื่อ field แล้ว Enter..."
                  multiSelect={fieldMode === 'sumFields'}
                />
              </div>
              {calcMode === 'percent' && (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-2 block">
                    ตัวส่วน (Denominator){fieldMode === 'sumFields' && <span className="text-green-600 font-normal"> — เลือกได้หลาย field</span>}
                  </label>
                  <FieldChipBuilder
                    fields={denomFields}
                    onChange={setDenomFields}
                    availableFields={preview?.fields ?? []}
                    fieldTypes={preview?.fieldTypes ?? {}}
                    color="green"
                    placeholder="พิมพ์ชื่อ field แล้ว Enter..."
                    multiSelect={fieldMode === 'sumFields'}
                  />
                </div>
              )}
            </div>

            {/* live preview */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex flex-wrap gap-4 text-sm">
              <span>Σ ตัวเศษ = <strong className="font-mono text-blue-800">{numSum.toLocaleString()}</strong></span>
              {calcMode === 'percent' && (
                <>
                  <span>Σ ตัวส่วน = <strong className="font-mono text-green-800">{denSum.toLocaleString()}</strong></span>
                  <span className="text-blue-700 font-semibold">
                    → {livePct !== null ? `${livePct.toFixed(2)}%` : '— (ตัวส่วน = 0)'}
                  </span>
                </>
              )}
              {calcMode !== 'percent' && (
                <span className="text-gray-500">(โหมด {calcMode} — ไม่ใช้ตัวส่วน)</span>
              )}
            </div>
            {calcMode === 'percent' && denSum === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ ตัวส่วนรวม = 0 → ตอนดึงจริงจะถูก <strong>ข้าม (skipped)</strong> ไม่ใช่ error — ตรวจว่าเลือก field ตัวส่วนถูกต้อง
              </p>
            )}
          </>
        )}

        {/* ═══ STEP 4 — ยืนยัน ═══ */}
        {step === 4 && (
          <>
            <div className="border rounded-lg divide-y text-sm">
              <Row k="ชื่อ KPI" v={name || '—'} />
              <Row k="หมวดหมู่ / ผู้รับผิดชอบ" v={`${category} / ${owner || '—'}`} />
              <Row k="เป้าหมาย" v={`${target} ${unit} · ${DIRECTIONS.find((d) => d.value === direction)?.label ?? direction}`} />
              <Row k="ประเภท" v={manual ? '📝 กรอกค่าเอง (ไม่ดึง MOPH)' : '🌐 ดึงจาก MOPH'} />
              {!manual && <Row k="Table / Filter" v={`${table} · ปี ${year} · จ.${province} · area ${areacode || '—'}${hospcode ? ` · hosp ${hospcode}` : ''}`} />}
              {!manual && <Row k="Mapping" v={`${calcMode} · เศษ [${valueFields.join(', ')}]${calcMode === 'percent' ? ` · ส่วน [${denomFields.join(', ')}]` : ''}`} />}
              {!manual && livePct !== null && <Row k="ค่าที่คาดว่าจะได้" v={`${livePct.toFixed(2)}%`} />}
            </div>
            {!manual && (
              <Field label="เดือนที่บันทึก">
                <ThaiMonthInput value={month} onChange={setMonth} />
              </Field>
            )}
            <button onClick={submit} disabled={submitting}
              className="w-full bg-green-700 hover:bg-green-600 disabled:bg-green-400 text-white text-sm py-3 rounded-lg font-medium">
              {submitting ? '⏳ กำลังดำเนินการ...' : manual ? '✅ สร้าง KPI' : '🚀 สร้าง KPI + ดึงข้อมูล'}
            </button>
          </>
        )}
      </div>

      {/* Footer nav */}
      <div className="px-6 py-4 border-t flex justify-between">
        <button onClick={step === 1 ? onClose : back} disabled={submitting}
          className="border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm px-5 py-2 rounded-lg">
          {step === 1 ? 'ยกเลิก' : '← ย้อนกลับ'}
        </button>
        {step !== 4 && (
          <button onClick={next}
            disabled={(step === 1 && !step1Ok) || (step === 2 && !step2Ok) || (step === 3 && !step3Ok)}
            className="bg-blue-800 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm px-5 py-2 rounded-lg font-medium">
            ถัดไป →
          </button>
        )}
      </div>
    </Shell>
  )
}

// ─── ตาราง preview read-only (ทุก hcode + แถว Σ) ──────────────────────────
function PreviewTable({ preview }: { preview: PreviewResp }) {
  const cols = Object.keys(preview.sample[0] ?? {})
  const colSums: Record<string, number> = {}
  cols.forEach((c) => { colSums[c] = preview.sample.reduce((s, r) => s + (Number(r[c]) || 0), 0) })
  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-2">
        📋 ข้อมูลทุก hcode — <span className="text-blue-700 font-bold">{preview.sample.length} หน่วยบริการ</span>
        {preview.rows > preview.sample.length && <span className="text-gray-400"> (แสดง {preview.sample.length}/{preview.rows})</span>}
      </p>
      <div className="overflow-x-auto rounded-lg border max-h-[360px] overflow-y-auto">
        <table className="w-max text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 border-b border-r bg-gray-200 text-gray-500 font-mono text-center">#</th>
              {cols.map((c) => (
                <th key={c} className="px-3 py-2 border-b border-r text-left font-mono bg-gray-100 text-gray-700 whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.sample.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-2 py-1.5 border-b border-r text-gray-400 text-center">{ri + 1}</td>
                {cols.map((c) => {
                  const val = row[c]
                  return (
                    <td key={c} className={`px-3 py-1.5 border-b border-r font-mono whitespace-nowrap ${val === null || val === '' ? 'text-gray-300 italic' : ''}`}>
                      {val === null ? 'null' : val === '' ? '—' : String(val)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0">
            <tr className="bg-yellow-50 border-t-2 border-yellow-300">
              <td className="px-2 py-2 border-r text-yellow-700 font-bold text-center">Σ</td>
              {cols.map((c) => (
                <td key={c} className="px-3 py-2 border-r font-mono font-bold text-yellow-700 whitespace-nowrap">
                  {colSums[c] ? colSums[c].toLocaleString() : '—'}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b flex items-center justify-between shrink-0">
          <h2 className="font-bold text-gray-900 text-lg">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>{children}</div>
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex px-4 py-2.5 gap-3">
      <span className="text-gray-500 w-44 shrink-0">{k}</span>
      <span className="text-gray-900 font-medium break-all">{v}</span>
    </div>
  )
}
