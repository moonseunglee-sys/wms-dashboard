import * as XLSX from 'xlsx'
import type { ZoneDaily } from './supabase'

/* ── 구역 순서 (종합실적 시트 순) ── */
const ZONE_ORDER = [
  'H-I', 'C-D', 'A-P', 'DPS',           // 일룸
  'E-F', 'J-K', 'L', 'B', 'L/S',        // 퍼시스
  'M-N', 'S',                             // 데스커
  'W', 'R',                               // 3PL
]
const ZONE_OWNER: Record<string, string> = {
  'H-I': '일룸', 'C-D': '일룸', 'A-P': '일룸', 'DPS': '일룸',
  'E-F': '퍼시스', 'J-K': '퍼시스', 'L': '퍼시스', 'B': '퍼시스', 'L/S': '퍼시스',
  'M-N': '데스커', 'S': '데스커',
  'W': '3PL', 'R': '3PL',
}

const METRIC_LABELS = [
  '피킹금액(원)',
  '박스수',
  '표준시간(h)',
  'WMS시간(h)',
  '실적시간(h)',
  '가동률(%)',
]

function n(v: number | null | undefined): number {
  return v ?? 0
}
function pct(std: number, act: number): number {
  return act > 0 ? Math.round((std / act) * 1000) / 10 : 0
}

/**
 * 종합실적 양식으로 Excel 내보내기
 * @param rows  필터링된 ZoneDaily 배열
 * @param filename  다운로드 파일명 (확장자 포함)
 */
export function exportZoneExcel(rows: ZoneDaily[], filename: string): void {
  /* ① 날짜 목록 정렬 */
  const dateSet = new Set<string>()
  rows.forEach(r => dateSet.add(r.work_date))
  const dates = [...dateSet].sort()

  /* ② 날짜×구역 → 집계 맵 */
  type ZoneMetrics = {
    pick_amount: number; pick_box: number
    std_time_hr: number; wms_time_hr: number; act_time_hr: number
  }
  const map = new Map<string, ZoneMetrics>()
  for (const r of rows) {
    const key = `${r.work_date}|${r.zone}`
    const cur = map.get(key) ?? { pick_amount: 0, pick_box: 0, std_time_hr: 0, wms_time_hr: 0, act_time_hr: 0 }
    cur.pick_amount  += n(r.pick_amount)
    cur.pick_box     += n(r.pick_box)
    cur.std_time_hr  += n(r.std_time_hr)
    cur.wms_time_hr  += n(r.wms_time_hr)
    cur.act_time_hr  += n(r.act_time_hr)
    map.set(key, cur)
  }

  /* ③ 실제로 데이터가 있는 구역만 포함 */
  const activeZones = ZONE_ORDER.filter(z =>
    rows.some(r => r.zone === z)
  )

  /* ④ 헤더 행: 구역 | 브랜드 | 지표 | 날짜1 | 날짜2 | ... */
  const fmtDate = (d: string) => {
    const [, m, day] = d.split('-')
    return `${Number(m)}/${Number(day)}`
  }
  const header = ['구역', '브랜드', '지표', ...dates.map(fmtDate)]

  /* ⑤ 데이터 행 생성 */
  const sheetRows: (string | number)[][] = [header]

  for (const zone of activeZones) {
    const owner = ZONE_OWNER[zone] ?? ''

    // 날짜별 값 수집
    const byMetric: Record<string, (number | string)[]> = {}
    METRIC_LABELS.forEach(m => { byMetric[m] = [] })

    // 합계용
    let totAmt = 0, totBox = 0, totStd = 0, totWms = 0, totAct = 0

    for (const d of dates) {
      const m = map.get(`${d}|${zone}`)
      if (m) {
        byMetric['피킹금액(원)'].push(Math.round(m.pick_amount))
        byMetric['박스수'].push(m.pick_box)
        byMetric['표준시간(h)'].push(Math.round(m.std_time_hr * 100) / 100)
        byMetric['WMS시간(h)'].push(m.wms_time_hr > 0 ? Math.round(m.wms_time_hr * 100) / 100 : '')
        byMetric['실적시간(h)'].push(Math.round(m.act_time_hr * 100) / 100)
        byMetric['가동률(%)'].push(pct(m.std_time_hr, m.act_time_hr))
        totAmt += m.pick_amount; totBox += m.pick_box
        totStd += m.std_time_hr; totWms += m.wms_time_hr; totAct += m.act_time_hr
      } else {
        METRIC_LABELS.forEach(ml => { byMetric[ml].push('') })
      }
    }

    // 합계 컬럼 추가
    byMetric['피킹금액(원)'].push(Math.round(totAmt))
    byMetric['박스수'].push(totBox)
    byMetric['표준시간(h)'].push(Math.round(totStd * 100) / 100)
    byMetric['WMS시간(h)'].push(totWms > 0 ? Math.round(totWms * 100) / 100 : '')
    byMetric['실적시간(h)'].push(Math.round(totAct * 100) / 100)
    byMetric['가동률(%)'].push(pct(totStd, totAct))

    // 지표별 행 추가
    METRIC_LABELS.forEach((ml, idx) => {
      sheetRows.push([
        idx === 0 ? zone : '',
        idx === 0 ? owner : '',
        ml,
        ...byMetric[ml],
      ])
    })

    // 구역 구분 빈 행
    sheetRows.push(['', '', '', ...dates.map(() => ''), ''])
  }

  /* ⑥ 전체 합계 행 */
  {
    const totRow = (metric: string, fn: (m: ZoneMetrics) => number | string) => {
      const vals = dates.map(d => {
        let tot = 0
        let hasAny = false
        for (const z of activeZones) {
          const m = map.get(`${d}|${z}`)
          if (m) { tot += Number(fn(m)); hasAny = true }
        }
        return hasAny ? tot : ''
      })
      // 합계 컬럼
      let grandTotal = 0
      for (const z of activeZones)
        for (const d of dates) {
          const m = map.get(`${d}|${z}`)
          if (m) grandTotal += Number(fn(m))
        }
      return ['합계', '', metric, ...vals, Math.round(grandTotal * 100) / 100]
    }

    sheetRows.push(totRow('피킹금액(원)', m => Math.round(m.pick_amount)))
    sheetRows.push(totRow('박스수',       m => m.pick_box))
    sheetRows.push(totRow('표준시간(h)', m => Math.round(m.std_time_hr * 100) / 100))
    sheetRows.push(totRow('실적시간(h)', m => Math.round(m.act_time_hr * 100) / 100))
  }

  /* ⑦ 헤더에 합계 컬럼 추가 */
  ;(sheetRows[0] as string[]).push('합계')

  /* ⑧ 워크시트/워크북 생성 */
  const ws = XLSX.utils.aoa_to_sheet(sheetRows)

  // 열 너비 설정
  ws['!cols'] = [
    { wch: 8 },   // 구역
    { wch: 7 },   // 브랜드
    { wch: 14 },  // 지표
    ...dates.map(() => ({ wch: 8 })),
    { wch: 12 },  // 합계
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '합계')

  /* ⑨ 날짜별 개별 시트 */
  for (const d of dates) {
    const [, m, day] = d.split('-')
    const sheetName = `${Number(m)}.${Number(day)}`   // "7.1", "7.2" ...

    const dailyHeader = ['구역', '브랜드', '피킹금액(원)', '박스수', '표준시간(h)', 'WMS시간(h)', '실적시간(h)', '가동률(%)']
    const dailyRows: (string | number)[][] = [dailyHeader]

    let dTotAmt = 0, dTotBox = 0, dTotStd = 0, dTotWms = 0, dTotAct = 0

    for (const zone of activeZones) {
      const owner = ZONE_OWNER[zone] ?? ''
      const m2 = map.get(`${d}|${zone}`)
      if (!m2) continue

      const act = m2.act_time_hr
      dailyRows.push([
        zone,
        owner,
        Math.round(m2.pick_amount),
        m2.pick_box,
        Math.round(m2.std_time_hr * 100) / 100,
        m2.wms_time_hr > 0 ? Math.round(m2.wms_time_hr * 100) / 100 : '',
        Math.round(act * 100) / 100,
        pct(m2.std_time_hr, act),
      ])
      dTotAmt += m2.pick_amount; dTotBox += m2.pick_box
      dTotStd += m2.std_time_hr; dTotWms += m2.wms_time_hr; dTotAct += act
    }

    // 합계 행
    dailyRows.push([
      '합계', '',
      Math.round(dTotAmt),
      dTotBox,
      Math.round(dTotStd * 100) / 100,
      dTotWms > 0 ? Math.round(dTotWms * 100) / 100 : '',
      Math.round(dTotAct * 100) / 100,
      pct(dTotStd, dTotAct),
    ])

    const ws2 = XLSX.utils.aoa_to_sheet(dailyRows)
    ws2['!cols'] = [
      { wch: 8 },   // 구역
      { wch: 7 },   // 브랜드
      { wch: 16 },  // 피킹금액
      { wch: 8 },   // 박스수
      { wch: 12 },  // 표준시간
      { wch: 10 },  // WMS시간
      { wch: 12 },  // 실적시간
      { wch: 10 },  // 가동률
    ]
    XLSX.utils.book_append_sheet(wb, ws2, sheetName)
  }

  XLSX.writeFile(wb, filename)
}
