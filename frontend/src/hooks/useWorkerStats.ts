import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { periodToRange } from '../lib/weekUtils'
import type { Period, WorkerAgg, DailyPoint } from '../lib/types'

function calcEff(std: number, act: number) {
  return act > 0 ? Math.round((std / act) * 1000) / 10 : 0
}

/** picking_worker_daily 기반 계층 드릴다운 훅
 *
 *  - owner만 지정 → 해당 브랜드 전체 작업자 집계
 *  - owner + zone → 해당 구역 작업자 집계
 *  - owner + zone + worker → 해당 작업자 날짜별 상세
 */
export function useWorkerStats(
  period: Period,
  filters: { owner?: string; zone?: string; worker?: string } = {}
) {
  const [workerAggs, setWorkerAggs] = useState<WorkerAgg[]>([])
  const [dailyPoints, setDailyPoints] = useState<DailyPoint[]>([])  // worker 선택 시만
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      setError(null)

      const { start, end } = periodToRange(period)

      let q = supabase
        .from('picking_worker_daily')
        .select('work_date, owner, zone, worker_name, shift, std_time_hr, act_time_hr, pick_box, pick_amount')
        .gte('work_date', start)
        .lte('work_date', end)

      if (filters.owner)  q = q.eq('owner',       filters.owner)
      if (filters.zone)   q = q.eq('zone',         filters.zone)
      if (filters.worker) q = q.eq('worker_name',  filters.worker)

      const { data, error: err } = await q.order('work_date')
      if (err) { setError(err.message); setLoading(false); return }

      const rows = data ?? []

      /* ── 작업자별 집계 ── */
      const wMap = new Map<string, WorkerAgg>()
      for (const r of rows) {
        const key = `${r.owner}|${r.zone}|${r.worker_name}`
        const cur = wMap.get(key) ?? {
          owner: r.owner, zone: r.zone,
          worker_name: r.worker_name, shift: r.shift,
          std_time_hr: 0, act_time_hr: 0, pick_box: 0, pick_amount: 0, efficiency: 0,
        }
        cur.std_time_hr += r.std_time_hr
        cur.act_time_hr += r.act_time_hr
        cur.pick_box    += r.pick_box    ?? 0
        cur.pick_amount += r.pick_amount ?? 0
        wMap.set(key, cur)
      }
      const aggs = [...wMap.values()]
        .map(w => ({ ...w, efficiency: calcEff(w.std_time_hr, w.act_time_hr) }))
        .sort((a, b) => b.efficiency - a.efficiency)

      /* ── 날짜별 상세 (작업자 선택 시) ── */
      const daily: DailyPoint[] = filters.worker
        ? rows.map(r => ({
            work_date:   r.work_date,
            owner:       r.owner,
            zone:        r.zone,
            std_time_hr: r.std_time_hr,
            act_time_hr: r.act_time_hr,
            pick_box:    r.pick_box    ?? 0,
            pick_amount: r.pick_amount ?? 0,
          }))
        : []

      setWorkerAggs(aggs)
      setDailyPoints(daily)
      setLoading(false)
    }

    fetch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(period), filters.owner, filters.zone, filters.worker])

  return { workerAggs, dailyPoints, loading, error }
}
