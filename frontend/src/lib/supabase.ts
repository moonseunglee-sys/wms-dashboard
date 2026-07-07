import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL  as string
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, key)

/* ── 테이블 타입 ─────────────────────────────────── */

export interface ZoneDaily {
  id:           number
  work_date:    string          // 'YYYY-MM-DD'
  center:       string          // '양지1센터' 등
  owner:        string          // '퍼시스' | '일룸' | '데스커' | '3PL'
  zone:         string          // 'H-I' | 'DPS' 등
  worker_name:  string | null
  shift:        string | null   // '주간' | '야간'
  std_time_hr:  number
  act_time_hr:  number
  wms_time_hr:  number | null   // WMS 근무시간 (출퇴근 기준 전체 근무시간)
  pick_amount:  number | null
  pick_box:     number | null
}

export interface WorkerDaily {
  id:           number
  work_date:    string
  center:       string
  owner:        string
  zone:         string
  worker_name:  string
  shift:        string | null
  std_time_hr:  number
  act_time_hr:  number
  pick_amount:  number | null
  pick_box:     number | null
}

/* ── 브랜드 색상 ─────────────────────────────────── */
export const OWNER_COLOR: Record<string, string> = {
  '일룸':  '#8B5CF6',
  '퍼시스': '#3B82F6',
  '데스커': '#10B981',
  '3PL':   '#F97316',
}

export const OWNERS = ['퍼시스', '일룸', '데스커', '3PL'] as const
export type Owner = typeof OWNERS[number]

/* ── 센터 매핑 ─────────────────────────────────── */
export const CENTER_OWNER: Record<string, string> = {
  '퍼시스': '1센터',
  '일룸':   '1센터',
  '데스커': '2센터',
  '3PL':   '3센터',
}
export const CENTERS = ['1센터', '2센터', '3센터'] as const
export type Center = typeof CENTERS[number]

export const CENTER_OWNERS: Record<string, string[]> = {
  '1센터': ['퍼시스', '일룸'],
  '2센터': ['데스커'],
  '3센터': ['3PL'],
}
export const CENTER_COLOR: Record<string, string> = {
  '1센터': '#3B82F6',
  '2센터': '#10B981',
  '3센터': '#F97316',
}

/* ── 입고 실적 (inbound_brand_daily / inbound_worker_daily) ── */
// 표준시간 개념 없음(피킹과 차이) — 시간당 수량/금액/파렛트로 생산성 표현
export interface InboundBrandDaily {
  id:         number
  work_date:  string
  center:     string
  brand:      string          // '일룸' | '퍼시스' | '데스커' | '3PL'
  qty_normal: number
  qty_return: number
  qty_cut:    number
  qty_total:  number
  amt_normal: number
  amt_return: number
  amt_cut:    number
  amt_total:  number
  pallets:    number
  hours:      number
}

export interface InboundWorkerDaily {
  id:             number
  work_date:      string
  center:         string
  brand:          string
  worker:         string       // raw ([주간]/[야간] 태그 포함)
  worker_display: string       // 태그 제거
  qty_normal: number
  qty_return: number
  qty_cut:    number
  qty_total:  number
  amt_normal: number
  amt_return: number
  amt_cut:    number
  amt_total:  number
  pallets:    number
  hours:      number
}
