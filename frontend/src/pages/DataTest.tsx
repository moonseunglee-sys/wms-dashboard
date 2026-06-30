import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function DataTest() {
  const [zoneRows, setZoneRows]   = useState<number | null>(null)
  const [workerRows, setWorkerRows] = useState<number | null>(null)
  const [sample, setSample]       = useState<unknown[]>([])
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    async function check() {
      // 1) picking_zone_daily 행수
      const { count: zc, error: e1 } = await supabase
        .from('picking_zone_daily')
        .select('*', { count: 'exact', head: true })
      if (e1) { setError(`zone_daily: ${e1.message}`); return }
      setZoneRows(zc)

      // 2) picking_worker_daily 행수
      const { count: wc, error: e2 } = await supabase
        .from('picking_worker_daily')
        .select('*', { count: 'exact', head: true })
      if (e2) { setError(`worker_daily: ${e2.message}`); return }
      setWorkerRows(wc)

      // 3) 샘플 5행
      const { data, error: e3 } = await supabase
        .from('picking_zone_daily')
        .select('work_date, owner, zone, std_time_hr, act_time_hr, pick_box, pick_amount')
        .order('work_date', { ascending: false })
        .limit(5)
      if (e3) { setError(`sample: ${e3.message}`); return }
      setSample(data ?? [])
    }
    check()
  }, [])

  return (
    <div className="p-8 font-mono text-sm">
      <h1 className="text-xl font-bold mb-4">Supabase 연결 테스트</h1>
      {error && <p className="text-red-600 mb-4">⚠ {error}</p>}
      {!error && (
        <>
          <p>picking_zone_daily: <strong>{zoneRows ?? '...'}</strong>행</p>
          <p>picking_worker_daily: <strong>{workerRows ?? '...'}</strong>행</p>
          <pre className="mt-4 bg-gray-100 p-3 rounded overflow-auto">
            {JSON.stringify(sample, null, 2)}
          </pre>
        </>
      )}
    </div>
  )
}
