import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { InboundWorkerDaily } from '../lib/supabase'

const PAGE = 1000

/** inbound_worker_daily 전체 행 fetch (페이지네이션으로 1000건 제한 우회) */
export function useAllInboundWorkerData() {
  const [rows, setRows]       = useState<InboundWorkerDaily[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      const all: InboundWorkerDaily[] = []
      let from = 0

      while (true) {
        const { data, error } = await supabase
          .from('inbound_worker_daily')
          .select('*')
          .order('work_date')
          .range(from, from + PAGE - 1)

        if (error || !data || data.length === 0) break
        all.push(...data)
        if (data.length < PAGE) break
        from += PAGE
      }

      if (!cancelled) {
        setRows(all)
        setLoading(false)
      }
    }

    fetchAll()
    return () => { cancelled = true }
  }, [])

  return { rows, loading }
}
