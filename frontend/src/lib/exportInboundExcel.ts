import * as XLSX from 'xlsx'
import type { InboundBrandDaily } from './supabase'
import { OWNERS } from './supabase'

/* ── 지표 정의: 기본 4종 + 정산용 6유형(참고) ── */
const METRICS: { key: string; label: string; get: (r: InboundBrandDaily) => number }[] = [
  { key: 'qty',     label: '입고수량',            get: r => Number(r.qty_total) || 0 },
  { key: 'amt',     label: '입고금액(원)',        get: r => Number(r.amt_total) || 0 },
  { key: 'pallet',  label: '파렛트수',            get: r => Number(r.pallets)   || 0 },
  { key: 'hours',   label: '실적시간(h)',         get: r => Number(r.hours)     || 0 },
  { key: 'normal',  label: '정산-정상입고',        get: r => Number(r.d_qty_normal)  || 0 },
  { key: 'return',  label: '정산-반품입고',        get: r => Number(r.d_qty_return)  || 0 },
  { key: 'certify', label: '정산-정품화입고',      get: r => Number(r.d_qty_certify) || 0 },
  { key: 'reentry', label: '정산-재입고',          get: r => Number(r.d_qty_reentry) || 0 },
  { key: 'inspect', label: '정산-검사이동,업체반송', get: r => Number(r.d_qty_inspect) || 0 },
  { key: 'cut',     label: '정산-CUT',            get: r => Number(r.d_qty_cut)     || 0 },
]

/**
 * 브랜드×일별 입고실적 Excel 내보내기 (피킹 exportZoneExcel과 동일 패턴)
 * @param rows  필터링된 InboundBrandDaily 배열
 * @param filename  다운로드 파일명 (확장자 포함)
 */
export function exportInboundExcel(rows: InboundBrandDaily[], filename: string): void {
  const dateSet = new Set<string>()
  rows.forEach(r => dateSet.add(r.work_date))
  const dates = [...dateSet].sort()

  const map = new Map<string, InboundBrandDaily>()
  for (const r of rows) map.set(`${r.work_date}|${r.brand}`, r)

  const present = new Set(rows.map(r => r.brand))
  const activeBrands = OWNERS.filter(o => present.has(o))

  const fmtDate = (d: string) => {
    const [, m, day] = d.split('-')
    return `${Number(m)}/${Number(day)}`
  }
  const header = ['브랜드', '지표', ...dates.map(fmtDate), '합계']
  const sheetRows: (string | number)[][] = [header]

  for (const brand of activeBrands) {
    METRICS.forEach((m, idx) => {
      let total = 0
      const vals = dates.map(d => {
        const r = map.get(`${d}|${brand}`)
        if (!r) return ''
        const v = m.key === 'amt' ? Math.round(m.get(r)) : Math.round(m.get(r) * 100) / 100
        total += v
        return v
      })
      sheetRows.push([
        idx === 0 ? brand : '',
        m.label,
        ...vals,
        Math.round(total * 100) / 100,
      ])
    })
    // 브랜드 구분 빈 행
    sheetRows.push(['', '', ...dates.map(() => ''), ''])
  }

  /* 전체 합계 행 (기본 4지표만) */
  METRICS.slice(0, 4).forEach(m => {
    const vals = dates.map(d => {
      let sum = 0, hasAny = false
      for (const b of activeBrands) {
        const r = map.get(`${d}|${b}`)
        if (r) { sum += m.get(r); hasAny = true }
      }
      return hasAny ? Math.round(sum * 100) / 100 : ''
    })
    let grand = 0
    for (const b of activeBrands)
      for (const d of dates) {
        const r = map.get(`${d}|${b}`)
        if (r) grand += m.get(r)
      }
    sheetRows.push(['합계', m.label, ...vals, Math.round(grand * 100) / 100])
  })

  const ws = XLSX.utils.aoa_to_sheet(sheetRows)
  ws['!cols'] = [
    { wch: 8 }, { wch: 18 },
    ...dates.map(() => ({ wch: 9 })),
    { wch: 12 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '브랜드별 일별 실적')
  XLSX.writeFile(wb, filename)
}
