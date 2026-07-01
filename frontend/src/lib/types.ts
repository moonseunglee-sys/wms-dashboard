/* ── 기간 타입 ───────────────────────────────────── */
export type Period =
  | { type: 'weekly';  weekStart: string }          // 'YYYY-MM-DD' (금요일)
  | { type: 'monthly'; year: number; month: number }
  | { type: 'yearly';  year: number }               // 연간
  | { type: 'custom';  start: string; end: string }
  | { type: 'all' }                                 // 전체기간

/* ── 계층 필터 ───────────────────────────────────── */
export interface HierarchyFilter {
  center?: string   // '양지1센터' 등 (현재 단일센터라 거의 미사용)
  owner?:  string   // '퍼시스' | '일룸' | '데스커' | '3PL'
  zone?:   string   // 'H-I' | 'DPS' 등
  worker?: string   // 작업자명
}

/* ── 집계 결과 ───────────────────────────────────── */
export interface ZoneAgg {
  owner:        string
  zone:         string
  std_time_hr:  number
  act_time_hr:  number
  pick_box:     number
  pick_amount:  number
  efficiency:   number   // std/act × 100
}

export interface OwnerAgg {
  owner:        string
  std_time_hr:  number
  act_time_hr:  number
  pick_box:     number
  pick_amount:  number
  efficiency:   number
}

export interface WorkerAgg {
  owner:        string
  zone:         string
  worker_name:  string
  shift:        string | null
  std_time_hr:  number
  act_time_hr:  number
  pick_box:     number
  pick_amount:  number
  efficiency:   number
}

/* 날짜별 트렌드용 */
export interface DailyPoint {
  work_date:   string
  owner?:      string
  zone?:       string
  std_time_hr: number
  act_time_hr: number
  pick_box:    number
  pick_amount: number
}

/* 주간 트렌드용 */
export interface WeekPoint {
  weekLabel:   string   // '6/20~6/26'
  weekStart:   string   // 'YYYY-MM-DD'
  owner?:      string
  std_time_hr: number
  act_time_hr: number
  pick_box:    number
  pick_amount: number
  efficiency:  number
}
