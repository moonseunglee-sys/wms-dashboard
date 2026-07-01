import type { Period } from './types'

const fmt = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 날짜 기준으로 속한 주(금~목)의 시작일(금요일) 반환 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const daysSinceFri = (d.getDay() - 5 + 7) % 7  // 0=금, 1=토 ... 6=목
  d.setDate(d.getDate() - daysSinceFri)
  return d
}

/** 주 시작일(금)에서 종료일(목) 반환 */
export function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + 6)
  return d
}

/** 기간 → { start, end } 날짜 문자열 */
export function periodToRange(period: Period): { start: string; end: string } {
  if (period.type === 'all')     return { start: '2000-01-01', end: '2099-12-31' }
  if (period.type === 'weekly') {
    const s = new Date(period.weekStart)
    return { start: period.weekStart, end: fmt(getWeekEnd(s)) }
  }
  if (period.type === 'monthly') {
    const last = new Date(period.year, period.month, 0)
    return {
      start: `${period.year}-${String(period.month).padStart(2, '0')}-01`,
      end:   fmt(last),
    }
  }
  if (period.type === 'yearly') {
    return {
      start: `${period.year}-01-01`,
      end:   `${period.year}-12-31`,
    }
  }
  return { start: period.start, end: period.end }
}

/** 두 날짜 범위 내 주 목록(금요일 기준) 반환 */
export function getWeeksInRange(start: string, end: string): string[] {
  const weeks: string[] = []
  let cur = getWeekStart(new Date(start))
  const endD = new Date(end)
  while (cur <= endD) {
    weeks.push(fmt(cur))
    cur = new Date(cur)
    cur.setDate(cur.getDate() + 7)
  }
  return weeks
}

/** 주 시작일 → 표시 라벨 '6/20~6/26' */
export function weekLabel(weekStart: string): string {
  const s = new Date(weekStart)
  const e = getWeekEnd(s)
  const mm1 = s.getMonth() + 1, dd1 = s.getDate()
  const mm2 = e.getMonth() + 1, dd2 = e.getDate()
  return mm1 === mm2 ? `${mm1}/${dd1}~${dd2}` : `${mm1}/${dd1}~${mm2}/${dd2}`
}

/** 이번 주 Period */
export function thisWeek(): Period {
  return { type: 'weekly', weekStart: fmt(getWeekStart(new Date())) }
}

/** 이번 달 Period */
export function thisMonth(): Period {
  const now = new Date()
  return { type: 'monthly', year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** 날짜 문자열 → 속한 주 시작일 */
export function dateToWeekStart(dateStr: string): string {
  return fmt(getWeekStart(new Date(dateStr)))
}

/* ── Granularity (일별/주간/월간/연간) ────────────────── */
export type Granularity = 'day' | 'week' | 'month' | 'year'

export function dateToMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7)  // 'YYYY-MM'
}

export function monthLabel(monthKey: string): string {
  return `${parseInt(monthKey.slice(5, 7))}월`
}

export function dateToBucket(dateStr: string, gran: Granularity): string {
  if (gran === 'day')   return dateStr
  if (gran === 'week')  return dateToWeekStart(dateStr)
  if (gran === 'year')  return dateStr.slice(0, 4)
  return dateToMonthKey(dateStr)
}

export function bucketLabel(bucket: string, gran: Granularity): string {
  if (gran === 'day') {
    const [, mm, dd] = bucket.split('-')
    return `${parseInt(mm)}/${parseInt(dd)}`
  }
  if (gran === 'week')  return weekLabel(bucket)
  if (gran === 'year')  return `${bucket}년`
  return monthLabel(bucket)
}

/** 최근 데이터가 포함된 연도 Period (전년도 기준) */
export function recentDataYear(): Period {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return { type: 'yearly', year: d.getFullYear() - 1 }
}

/** 오늘 날짜 문자열 'YYYY-MM-DD' */
export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

/** 어제 날짜 문자열 'YYYY-MM-DD' */
export function yesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

/** 최근 데이터가 포함된 월 Period (어제 기준, 금~목 주간 업로드 패턴) */
export function recentDataMonth(): Period {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return { type: 'monthly', year: d.getFullYear(), month: d.getMonth() + 1 }
}

/** 최근 데이터가 포함된 주(금~목) Period */
export function recentDataWeek(): Period {
  const d = new Date()
  d.setDate(d.getDate() - 1)  // 어제 기준 주
  return { type: 'weekly', weekStart: fmt(getWeekStart(d)) }
}
