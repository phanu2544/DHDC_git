'use client'

import { useMemo, useState } from 'react'
import { scoreFor, type ScoreBands } from '@/lib/rankingScore'

/**
 * ScoreBandsEditor — แก้ "น้ำหนัก + เกณฑ์คะแนน 1-5" ของ KPI ในชุดที่ให้คะแนน (Ranking · L7)
 * ใช้ใน KpiSetPicker (ฟอร์มแก้ไข KPI หน้า /admin) · รูปแบบ JSON ดู lib/rankingScore.ts
 *
 * กรอกแบบตาราง 5 แถว (คะแนน 1-5):
 *  - ช่วงตัวเลข: ยิ่งมากยิ่งดี → กรอก "ขั้นต่ำ" ของแต่ละคะแนน · ยิ่งน้อยยิ่งดี → กรอก "ขั้นสูง"
 *    เว้นว่าง = ไม่มีขั้น (คะแนนนั้นเป็นค่าตั้งต้น) · ทั้งแถวว่าง (ไม่มีข้อความ+ไม่มีตัวเลข) = คะแนนนั้นไม่ใช้
 *  - ระดับข้อความ: กรอกข้อความระดับที่ได้คะแนนนั้น (ต้องตรงกับตัวเลือกผลงานของ KPI) · ว่าง = ไม่ใช้
 */

type Row = { threshold: string; label: string }
const EMPTY_ROWS = (): Row[] => Array.from({ length: 5 }, () => ({ threshold: '', label: '' }))

function toRows(b: ScoreBands | null | undefined): Row[] {
  const rows = EMPTY_ROWS()
  if (!b) return rows
  if (b.kind === 'range') {
    for (const band of b.bands) {
      const i = band.score - 1
      if (i < 0 || i > 4) continue
      const t = b.better === 'higher' ? band.min : band.max
      rows[i] = { threshold: t == null ? '' : String(t), label: band.label ?? '' }
    }
  } else {
    for (const band of b.bands) {
      const i = band.score - 1
      if (i >= 0 && i <= 4) rows[i] = { threshold: '', label: band.label }
    }
  }
  return rows
}

/** แถว → JSON · คืน error ภาษาไทยถ้าตัวเลขไม่ถูก */
export function rowsToBands(kind: 'range' | 'level', better: 'higher' | 'lower', rows: Row[]): { bands: ScoreBands | null; error?: string } {
  if (kind === 'level') {
    const bands = rows.map((r, i) => ({ score: i + 1, label: r.label.trim() })).filter((b) => b.label)
    return bands.length ? { bands: { kind: 'level', bands } } : { bands: null, error: 'ยังไม่มีระดับที่ได้คะแนนเลย' }
  }
  const out: { score: number; min?: number; max?: number; label?: string }[] = []
  for (let i = 0; i < 5; i++) {
    const t = rows[i].threshold.trim(), label = rows[i].label.trim()
    if (!t && !label) continue
    if (t && !Number.isFinite(Number(t))) return { bands: null, error: `คะแนน ${i + 1}: "${t}" ไม่ใช่ตัวเลข` }
    out.push({ score: i + 1, ...(t ? (better === 'higher' ? { min: Number(t) } : { max: Number(t) }) : {}), ...(label ? { label } : {}) })
  }
  if (!out.length) return { bands: null, error: 'ยังไม่มีเกณฑ์ที่ได้คะแนนเลย' }
  // ขั้นต้องเรียงตามคะแนน: ยิ่งมากยิ่งดี = ขั้นต่ำเพิ่มขึ้น · ยิ่งน้อยยิ่งดี = ขั้นสูงลดลง
  const ts = out.filter((b) => (better === 'higher' ? b.min : b.max) != null).map((b) => (better === 'higher' ? b.min! : b.max!))
  for (let i = 1; i < ts.length; i++) {
    if (better === 'higher' ? ts[i] <= ts[i - 1] : ts[i] >= ts[i - 1]) {
      return { bands: null, error: better === 'higher' ? 'ค่าขั้นต่ำต้องเพิ่มขึ้นตามคะแนน (คะแนนสูงต้องใช้ค่ามากกว่า)' : 'ค่าขั้นสูงต้องลดลงตามคะแนน (คะแนนสูงต้องใช้ค่าน้อยกว่า)' }
    }
  }
  return { bands: { kind: 'range', better, bands: out } }
}

export default function ScoreBandsEditor({
  weight, bands, kpiOptions, onChange,
}: {
  weight: number | null | undefined
  bands: ScoreBands | null | undefined
  kpiOptions?: string[]          // ตัวเลือกผลงานของ KPI (ชนิดระดับ/ข้อความ) — ใช้เตือนเมื่อเกณฑ์ไม่ตรง
  onChange: (weight: number | null, bands: ScoreBands | null) => void
}) {
  const [kind, setKind] = useState<'range' | 'level'>(bands?.kind ?? (kpiOptions?.length ? 'level' : 'range'))
  const [better, setBetter] = useState<'higher' | 'lower'>(bands?.kind === 'range' ? bands.better : 'higher')
  const [rows, setRows] = useState<Row[]>(() => toRows(bands))
  const [w, setW] = useState(weight == null ? '' : String(weight))
  const [test, setTest] = useState('')

  const built = useMemo(() => rowsToBands(kind, better, rows), [kind, better, rows])

  function emit(nextKind = kind, nextBetter = better, nextRows = rows, nextW = w) {
    const b = rowsToBands(nextKind, nextBetter, nextRows)
    const wn = nextW.trim() === '' ? null : Number(nextW)
    // ส่งเฉพาะเมื่อถูกต้อง — ผิดอยู่ = ไม่อัปเดตค่าในฟอร์ม (ค่าเดิมยังอยู่ ไม่หายเงียบ) + โชว์ error ให้แก้
    if (!b.error && (wn === null || (Number.isFinite(wn) && wn > 0))) onChange(wn, b.bands)
  }
  const setRow = (i: number, field: keyof Row, v: string) => {
    const next = rows.map((r, j) => (j === i ? { ...r, [field]: v } : r)); setRows(next); emit(kind, better, next)
  }

  const missingOpts = kind === 'level' && kpiOptions?.length
    ? rows.map((r) => r.label.trim()).filter((l) => l && !kpiOptions.some((o) => o.trim() === l))
    : []
  const wNum = Number(w)
  const testResult = test.trim() === '' || built.error ? null
    : kind === 'level' ? scoreFor(built.bands, null, test) : scoreFor(built.bands, Number(test), null)

  const inp = 'border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500'
  return (
    <div className="mt-2 border border-amber-200 bg-amber-50/50 rounded-lg p-2 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="block text-[10px] text-gray-500 mb-0.5">น้ำหนัก</label>
          <input value={w} onChange={(e) => { setW(e.target.value); emit(kind, better, rows, e.target.value) }} placeholder="2 หรือ 3" className={`${inp} w-20`} /></div>
        <div><label className="block text-[10px] text-gray-500 mb-0.5">ชนิดเกณฑ์</label>
          <select value={kind} onChange={(e) => { const k = e.target.value as 'range' | 'level'; setKind(k); emit(k) }} className={inp}>
            <option value="range">ช่วงตัวเลข</option>
            <option value="level">ระดับ (ข้อความ)</option>
          </select></div>
        {kind === 'range' && (
          <div><label className="block text-[10px] text-gray-500 mb-0.5">ทิศทาง</label>
            <select value={better} onChange={(e) => { const b = e.target.value as 'higher' | 'lower'; setBetter(b); emit(kind, b) }} className={inp}>
              <option value="higher">ยิ่งมากยิ่งดี (กรอกค่าขั้นต่ำ)</option>
              <option value="lower">ยิ่งน้อยยิ่งดี (กรอกค่าขั้นสูง)</option>
            </select></div>
        )}
      </div>

      <table className="w-full text-xs">
        <thead><tr className="text-[10px] text-gray-500">
          <th className="text-left w-14 font-medium">คะแนน</th>
          {kind === 'range' && <th className="text-left w-28 font-medium">{better === 'higher' ? 'ผลงาน ≥' : 'ผลงาน ≤'}</th>}
          <th className="text-left font-medium">{kind === 'range' ? 'ข้อความเกณฑ์ (แสดงผล)' : 'ระดับที่ได้คะแนนนี้'}</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="py-0.5 font-semibold text-gray-700">{i + 1}</td>
              {kind === 'range' && <td className="py-0.5 pr-1"><input value={r.threshold} onChange={(e) => setRow(i, 'threshold', e.target.value)} placeholder="ว่าง = ไม่มีขั้น" className={`${inp} w-full`} /></td>}
              <td className="py-0.5"><input value={r.label} onChange={(e) => setRow(i, 'label', e.target.value)} placeholder={kind === 'range' ? 'เช่น 60-69' : 'ว่าง = ไม่ใช้คะแนนนี้'} className={`${inp} w-full`} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {built.error && <p className="text-[11px] text-red-600">⚠️ {built.error} — ยังไม่บันทึกเกณฑ์จนกว่าจะแก้</p>}
      {w.trim() !== '' && !(Number.isFinite(wNum) && wNum > 0) && <p className="text-[11px] text-red-600">⚠️ น้ำหนักต้องเป็นตัวเลขมากกว่า 0</p>}
      {missingOpts.length > 0 && (
        <p className="text-[11px] text-amber-700">⚠️ ระดับนี้ไม่มีในตัวเลือกผลงานของ KPI: {missingOpts.map((m) => `"${m}"`).join(', ')} — ผู้กรอกจะเลือกไม่ได้ (แก้ตัวเลือกใน "ระดับ" ของ KPI ให้ตรงกัน)</p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
        ทดสอบ:
        {kind === 'level' && kpiOptions?.length
          ? <select value={test} onChange={(e) => setTest(e.target.value)} className={inp}><option value="">— เลือกระดับ —</option>{kpiOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          : <input value={test} onChange={(e) => setTest(e.target.value)} placeholder={kind === 'level' ? 'พิมพ์ระดับ' : 'ใส่ผลงาน'} className={`${inp} w-28`} />}
        {testResult && (testResult.score != null
          ? <span className="font-semibold text-indigo-700">→ ได้ {testResult.score} คะแนน{Number.isFinite(wNum) && wNum > 0 ? ` (ถ่วง ${((testResult.score * wNum) / 5).toFixed(2)})` : ''}</span>
          : <span className="text-gray-500">→ {testResult.reason}</span>)}
      </div>
      <p className="text-[10px] text-gray-400">ช่วงตัวเลขใช้ "ค่าขั้นต่ำ/ขั้นสูง" ได้คะแนนสูงสุดที่ผ่าน · ต่ำกว่าคะแนน 1 ที่มีขั้น = 0 คะแนน · คะแนนถ่วง = คะแนน × น้ำหนัก ÷ 5</p>
    </div>
  )
}
