import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ZoneDaily } from '../lib/supabase'

/** picking_zone_daily 전체 행 fetch (in-memory 집계용) */
export function useAllZoneData() {
  const [rows, setRows]     = useState<ZoneDaily[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('picking_zone_daily')
      .select('*')
      .order('work_date')
      .then(({ data }) => {
        setRows(data ?? [])
        setLoading(false)
      })
  }, [])

  return { rows, loading }
}
