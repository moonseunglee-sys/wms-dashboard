import { Fragment, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAllInboundWorkerData } from '../../hooks/useAllInboundWorkerData'
import { periodToRange } from '../../lib/weekUtils'
import type { Granularity } from '../../lib/weekUtils'
import { OWNER_COLOR, OWNERS, INBOUND_TYPES } from '../../lib/supabase'
import type { InboundWorkerDaily } from '../../lib/supabase'
import type { Period } from '../../lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { InboundMetric } from '../inbound/InboundLayout'
import { aggInbound, fmtM, fmtNum, fmtPct, fmtHr } from '../../lib/inboundUtils'

interface Props { period: Period; metric: InboundMetric; granularity?: Granularity }

function shiftBadge(worker: string) {
  if (worker.startsWith('[주간]')) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-500 font-medium">주간</span>
  if (worker.startsWith('[야간]')) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 font-medium">야간</span>
  return null
}

export default function InboundWorker({ period }: Props) {
  const { rows, loading } = useAllInboundWorkerData()
  const location = useLocation()
  const st = location.state as { brand?: string; worker?: string } | null
  const [brand, setBrand]   = useState<string>(st?.brand ?? '일룸')
  const [openWorker, setOpenWorker] = useState<string | null>(st?.worker ?? null)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-letusOrange border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs">데이터 로딩 중...</p>
        </div>
      </div>
    )
  }

  const { start, end } = periodToRange(period)
  const pRows = rows.filter(r => r.work_date >= start && r.work_date <= end && r.brand === brand)

  /* 작업자별 그룹 */
  const grouped = new Map<string, InboundWorkerDaily[]>()
  for (const r of pRows) {
    const list = grouped.get(r.worker) ?? []
    list.push(r)
    grouped.set(r.worker, list)
  }
  const workers = [...grouped.entries()]
    .map(([worker, list]) => ({
      worker,
      display: list[0].worker_display,
      days: new Set(list.map(x => x.work_date)).size,
      list: [...list].sort((a, b) => a.work_date.localeCompare(b.work_date)),
      agg: aggInbound(list),
    }))
    .sort((a, b) => b.agg.qty - a.agg.qty)

  const brandAgg = aggInbound(pRows)

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── 브랜드 필터 ── */}
      <div className="flex items-center gap-2">
        {OWNERS.map(o => (
          <button
            key={o}
            onClick={() => { setBrand(o); setOpenWorker(null) }}
            className={[
              'flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all',
              brand === o
                ? 'bg-white border-letusBlue text-letusBlue shadow-sm'
                : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600',
            ].join(' ')}
          >
            <div className="w-2 h-2 rounded-full" style={{ background: OWNER_COLOR[o] }} />
            {o}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-xs text-gray-400">
          {workers.length}명 · 수량 {fmtNum(brandAgg.qty)}개 · {fmtHr(brandAgg.hours)}
        </span>
      </div>

      {/* ── 작업자 목록 ── */}
      <Card>
        <CardHeader className="px-5 py-3.5 border-b border-border">
          <CardTitle className="text-sm font-semibold">{brand} 작업자별 상세</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {workers.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-300 text-xs">데이터 없음</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left  py-2.5 pl-5 font-medium">작업자</th>
                  <th className="text-right py-2.5 font-medium">근무일</th>
                  <th className="text-right py-2.5 font-medium">입고수량</th>
                  <th className="text-right py-2.5 font-medium">입고금액</th>
                  <th className="text-right py-2.5 font-medium">파렛트</th>
                  <th className="text-right py-2.5 font-medium">실적시간</th>
                  <th className="text-right py-2.5 font-medium">시간당 수량</th>
                  <th className="text-right py-2.5 pr-5 font-medium">시간당 금액</th>
                </tr>
              </thead>
              <tbody>
                {workers.map(w => {
                  const open = openWorker === w.worker
                  /* 유형 분해 (정산 기준) */
                  const typeRows = INBOUND_TYPES
                    .map(t => ({ ...t, ...w.agg.byType[t.key] }))
                    .filter(t => t.qty > 0 || t.amt > 0)
                  const typeQtySum = typeRows.reduce((s, t) => s + t.qty, 0)

                  return (
                    <Fragment key={w.worker}>
                      <tr
                        className={`border-b border-gray-50 cursor-pointer transition-colors ${open ? 'bg-blue-50/40' : 'hover:bg-gray-50'}`}
                        onClick={() => setOpenWorker(open ? null : w.worker)}
                      >
                        <td className="py-2.5 pl-5">
                          <div className="flex items-center gap-2">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                              className="text-gray-300"
                              style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                              <path d="m9 18 6-6-6-6" />
                            </svg>
                            <span className="font-semibold text-gray-700">{w.display}</span>
                            {shiftBadge(w.worker)}
                          </div>
                        </td>
                        <td className="text-right text-gray-500">{w.days}일</td>
                        <td className="text-right text-gray-700">{fmtNum(w.agg.qty)}</td>
                        <td className="text-right text-gray-700">{fmtM(w.agg.amount)}</td>
                        <td className="text-right text-gray-700">{fmtNum(w.agg.pallets)}</td>
                        <td className="text-right text-gray-700">{fmtHr(w.agg.hours)}</td>
                        <td className="text-right font-semibold text-gray-800">{fmtNum(Math.round(w.agg.qtyPerHr))}개/h</td>
                        <td className="text-right pr-5 font-semibold text-gray-800">{fmtM(w.agg.amtPerHr)}/h</td>
                      </tr>

                      {open && (
                        <tr className="border-b border-gray-100 bg-gray-50/40">
                          <td colSpan={8} className="px-5 py-4">
                            <div className="grid grid-cols-2 gap-6">
                              {/* 유형 분해 (정산 기준) */}
                              <div>
                                <p className="text-[11px] font-semibold text-gray-500 mb-2">입고유형 분해 (정산 기준)</p>
                                {typeRows.length === 0 ? (
                                  <p className="text-gray-300">데이터 없음</p>
                                ) : (
                                  <table className="w-full">
                                    <thead>
                                      <tr className="text-gray-400 border-b border-gray-200">
                                        <th className="text-left  py-1.5 font-medium">유형</th>
                                        <th className="text-right py-1.5 font-medium">수량</th>
                                        <th className="text-right py-1.5 font-medium">금액</th>
                                        <th className="text-right py-1.5 font-medium">비중</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {typeRows.map(t => (
                                        <tr key={t.key} className="border-b border-gray-100">
                                          <td className="py-1.5">
                                            <div className="flex items-center gap-1.5">
                                              <div className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                                              <span className="text-gray-600">{t.label}</span>
                                            </div>
                                          </td>
                                          <td className="text-right text-gray-700">{fmtNum(t.qty)}</td>
                                          <td className="text-right text-gray-700">{fmtM(t.amt / 1_000_000)}</td>
                                          <td className="text-right font-semibold text-gray-700">
                                            {fmtPct(typeQtySum > 0 ? (t.qty / typeQtySum) * 100 : 0)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>

                              {/* 일별 실적 */}
                              <div>
                                <p className="text-[11px] font-semibold text-gray-500 mb-2">일별 실적</p>
                                <table className="w-full">
                                  <thead>
                                    <tr className="text-gray-400 border-b border-gray-200">
                                      <th className="text-left  py-1.5 font-medium">날짜</th>
                                      <th className="text-right py-1.5 font-medium">수량</th>
                                      <th className="text-right py-1.5 font-medium">금액</th>
                                      <th className="text-right py-1.5 font-medium">시간</th>
                                      <th className="text-right py-1.5 font-medium">시간당 수량</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {w.list.map(d => {
                                      const hrs = Number(d.hours) || 0
                                      const q   = Number(d.qty_total) || 0
                                      return (
                                        <tr key={d.work_date} className="border-b border-gray-100">
                                          <td className="py-1.5 text-gray-600">{d.work_date}</td>
                                          <td className="text-right text-gray-700">{fmtNum(q)}</td>
                                          <td className="text-right text-gray-700">{fmtM((Number(d.amt_total) || 0) / 1_000_000)}</td>
                                          <td className="text-right text-gray-700">{fmtHr(hrs)}</td>
                                          <td className="text-right font-semibold text-gray-700">
                                            {hrs > 0 ? `${fmtNum(Math.round(q / hrs))}개/h` : '-'}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
