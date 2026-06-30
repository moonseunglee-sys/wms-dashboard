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
