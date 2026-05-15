import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { WorkerSummary, DailySummary } from '../api/client'

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl p-5 bg-white shadow-sm">
      <p className="text-xs font-medium" style={{ color: '#64748b' }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: '#0f172a' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>{sub}</p>}
    </div>
  )
}

function EffBar({ ratio, color }: { ratio: number; color: string }) {
  const pct = Math.min(ratio * 100, 150)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-full h-2" style={{ backgroundColor: '#e2e8f0' }}>
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-semibold w-12 text-right" style={{ color }}>
        {(ratio * 100).toFixed(1)}%
      </span>
    </div>
  )
}

function effColor(r: number) {
  if (r >= 1) return '#22c55e'
  if (r >= 0.8) return '#f59e0b'
  return '#ef4444'
}

export default function Dashboard() {
  const [workers, setWorkers]   = useState<WorkerSummary[]>([])
  const [daily, setDaily]       = useState<DailySummary[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [shiftFilter, setShift] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const f = shiftFilter ? { shift_type: shiftFilter } : undefined
      const [w, d] = await Promise.all([api.workers(f), api.daily(f)])
      setWorkers(w)
      setDaily(d)
    } catch {
      setError('API 서버에 연결할 수 없습니다. FastAPI 서버(8000)가 실행 중인지 확인하세요.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [shiftFilter])

  const totalPicks = workers.reduce((s, w) => s + w.피킹건수, 0)
  const totalStd   = workers.reduce((s, w) => s + w.표준시간_min, 0)
  const totalReal  = workers.reduce((s, w) => s + w.실적시간_min, 0)
  const overallEff = totalReal > 0 ? totalStd / totalReal : 0

  return (
    <div className="p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#0f172a' }}>피킹 생산성 대시보드</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>양지1센터 | 실시간 데이터</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={shiftFilter}
            onChange={(e) => setShift(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm border outline-none"
            style={{ borderColor: '#e2e8f0', backgroundColor: '#fff', color: '#374151' }}
          >
            <option value="">전체 (주/야간)</option>
            <option value="주간">주간</option>
            <option value="야간">야간</option>
          </select>
          <button
            onClick={load}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
            style={{ backgroundColor: '#3b82f6' }}
          >
            새로고침
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl px-5 py-4 mb-6 text-sm" style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-32 text-sm" style={{ color: '#94a3b8' }}>
          데이터를 불러오는 중...
        </div>
      ) : (
        <>
          {/* KPI 카드 */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <KpiCard label="전체 피킹 가동률" value={`${(overallEff * 100).toFixed(1)}%`} sub="표준 / 실적" />
            <KpiCard label="총 피킹 품목수" value={totalPicks.toLocaleString()} sub="건" />
            <KpiCard label="총 표준시간" value={`${(totalStd / 60).toFixed(1)} h`} />
            <KpiCard label="총 실적시간" value={`${(totalReal / 60).toFixed(1)} h`} />
          </div>

          <div className="grid grid-cols-2 gap-5">
            {/* 작업자별 가동률 */}
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold mb-4" style={{ color: '#0f172a' }}>
                작업자별 피킹 가동률
              </h2>
              <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1">
                {workers.map((w) => (
                  <div key={`${w.작업자}-${w.화주사}`}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium" style={{ color: '#1e293b' }}>
                        {w.작업자}
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: w.화주사 === '일룸' ? '#eff6ff' : '#f0fdf4', color: w.화주사 === '일룸' ? '#3b82f6' : '#16a34a' }}>
                          {w.화주사}
                        </span>
                      </span>
                      <span style={{ color: '#64748b' }}>{w.피킹건수.toLocaleString()}건</span>
                    </div>
                    <EffBar ratio={w.가동률} color={effColor(w.가동률)} />
                  </div>
                ))}
              </div>
            </div>

            {/* 일별 가동률 추이 */}
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold mb-4" style={{ color: '#0f172a' }}>
                일별 가동률 추이
              </h2>
              <div className="flex flex-col gap-3">
                {daily.map((d) => (
                  <div key={d.작업일}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium" style={{ color: '#1e293b' }}>{d.작업일}</span>
                      <span style={{ color: '#64748b' }}>
                        {d.피킹건수.toLocaleString()}건 · {(d.실적시간_min / 60).toFixed(1)}h
                      </span>
                    </div>
                    <EffBar ratio={d.가동률} color={effColor(d.가동률)} />
                  </div>
                ))}
              </div>

              {/* 범례 */}
              <div className="flex gap-4 mt-5 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
                {[['#22c55e', '≥100% (목표 달성)'], ['#f59e0b', '80~99%'], ['#ef4444', '<80%']].map(([c, l]) => (
                  <div key={c} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                    <span className="text-xs" style={{ color: '#64748b' }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 상세 테이블 */}
          <div className="bg-white rounded-xl p-5 shadow-sm mt-5">
            <h2 className="text-sm font-semibold mb-4" style={{ color: '#0f172a' }}>
              작업자별 상세 집계
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {['작업자', '화주사', '피킹건수', '표준시간(h)', '실적시간(h)', '가동률'].map((h) => (
                      <th key={h} className="pb-3 text-left text-xs font-semibold" style={{ color: '#64748b' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w) => (
                    <tr key={`${w.작업자}-${w.화주사}`} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td className="py-2.5 font-medium" style={{ color: '#0f172a' }}>{w.작업자}</td>
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: w.화주사 === '일룸' ? '#eff6ff' : '#f0fdf4', color: w.화주사 === '일룸' ? '#3b82f6' : '#16a34a' }}>
                          {w.화주사}
                        </span>
                      </td>
                      <td className="py-2.5" style={{ color: '#374151' }}>{w.피킹건수.toLocaleString()}</td>
                      <td className="py-2.5" style={{ color: '#374151' }}>{(w.표준시간_min / 60).toFixed(2)}</td>
                      <td className="py-2.5" style={{ color: '#374151' }}>{(w.실적시간_min / 60).toFixed(2)}</td>
                      <td className="py-2.5 font-semibold" style={{ color: effColor(w.가동률) }}>
                        {(w.가동률 * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
