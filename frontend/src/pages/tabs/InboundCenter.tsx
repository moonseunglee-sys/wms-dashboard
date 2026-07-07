import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useAllInboundData } from '../../hooks/useAllInboundData'
import { periodToRange, dateToBucket, bucketLabel } from '../../lib/weekUtils'
import type { Granularity } from '../../lib/weekUtils'
import {
  OWNER_COLOR, CENTERS, CENTER_COLOR, CENTER_OWNERS, INBOUND_TYPES,
} from '../../lib/supabase'
import type { Period } from '../../lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartTooltip } from '@/components/ChartTooltip'
import type { InboundMetric } from '../inbound/InboundLayout'
import {
  aggInbound, aggMetricValue, metricFmt, fmtM, fmtNum, fmtPct, fmtHr,
} from '../../lib/inboundUtils'

interface Props { period: Period; metric: InboundMetric; granularity?: Granularity }

export default function InboundCenter({ period, metric, granularity = 'day' }: Props) {
  const { rows, loading } = useAllInboundData()
  const location = useLocation()
  const [selected, setSelected] = useState<string>(
    (location.state as { center?: string } | null)?.center ?? '1센터'
  )

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
  const pRows = rows.filter(r => r.work_date >= start && r.work_date <= end)

  const centerAgg = Object.fromEntries(
    CENTERS.map(c => [c, aggInbound(pRows.filter(r => CENTER_OWNERS[c].includes(r.brand)))])
  )
  const total = aggInbound(pRows)

  /* 선택 센터 */
  const selRows  = pRows.filter(r => CENTER_OWNERS[selected].includes(r.brand))
  const selAgg   = centerAgg[selected]
  const selBrands = CENTER_OWNERS[selected]

  /* 선택 센터 브랜드별 집계 */
  const brandAggs = selBrands.map(b => ({
    brand: b,
    agg: aggInbound(selRows.filter(r => r.brand === b)),
  }))

  /* 유형 구성 (정산용 6유형) — 값 있는 유형만 */
  const typeRows = INBOUND_TYPES
    .map(t => ({ ...t, ...selAgg.byType[t.key] }))
    .filter(t => t.qty > 0 || t.amt > 0)

  /* 일별 추이 (센터별 스택) */
  const trendMap = new Map<string, Record<string, number>>()
  for (const r of pRows) {
    const bucket = dateToBucket(r.work_date, granularity)
    if (!trendMap.has(bucket)) trendMap.set(bucket, {})
    const e = trendMap.get(bucket)!
    const c = CENTERS.find(cc => CENTER_OWNERS[cc].includes(r.brand))
    if (!c) continue
    const v = metric === 'amount' ? (Number(r.amt_total) || 0) / 1_000_000
      : metric === 'qty' ? Number(r.qty_total) || 0 : Number(r.pallets) || 0
    e[c] = (e[c] ?? 0) + v
    e['_total'] = (e['_total'] ?? 0) + v
  }
  const trendData = [...trendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, e]) => ({
      label: bucketLabel(bucket, granularity),
      ...Object.fromEntries(CENTERS.map(c => [c, +(e[c] ?? 0).toFixed(2)])),
      total: +(e['_total'] ?? 0).toFixed(2),
    }))

  const share = (v: number) => {
    const t = aggMetricValue(total, metric)
    return t > 0 ? (v / t) * 100 : 0
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── 센터 카드 (선택) ── */}
      <div className="grid grid-cols-3 gap-4">
        {CENTERS.map(c => {
          const a = centerAgg[c]
          const active = c === selected
          return (
            <Card
              key={c}
              className={`cursor-pointer transition-all ${active ? 'ring-2 ring-letusBlue shadow-md' : 'hover:shadow-md'}`}
              onClick={() => setSelected(c)}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: CENTER_COLOR[c] }} />
                    <span className="text-sm font-bold text-gray-700">{c}</span>
                    <span className="text-xs text-gray-400">{CENTER_OWNERS[c].join(' · ')}</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-400">
                    {fmtPct(share(aggMetricValue(a, metric)))}
                  </span>
                </div>
                <p className="text-2xl font-bold mb-2" style={{ color: CENTER_COLOR[c] }}>
                  {metricFmt(aggMetricValue(a, metric), metric)}
                </p>
                <div className="flex gap-3 text-xs text-gray-400">
                  <span>{fmtHr(a.hours)}</span>
                  <span>·</span>
                  <span>{fmtM(a.amtPerHr)}/h</span>
                  <span>·</span>
                  <span>{fmtNum(Math.round(a.qtyPerHr))}개/h</span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ── 선택 센터: 브랜드별 + 유형 구성 ── */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="px-5 py-3.5 border-b border-border">
            <CardTitle className="text-sm font-semibold">{selected} 브랜드별 실적</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {brandAggs.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-gray-300 text-xs">데이터 없음</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-100">
                    <th className="text-left  py-2 font-medium">브랜드</th>
                    <th className="text-right py-2 font-medium">입고수량</th>
                    <th className="text-right py-2 font-medium">입고금액</th>
                    <th className="text-right py-2 font-medium">파렛트</th>
                    <th className="text-right py-2 font-medium">시간</th>
                    <th className="text-right py-2 font-medium">시간당 금액</th>
                  </tr>
                </thead>
                <tbody>
                  {brandAggs.map(({ brand, agg }) => (
                    <tr key={brand} className="border-b border-gray-50">
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: OWNER_COLOR[brand] }} />
                          <span className="font-semibold text-gray-700">{brand}</span>
                        </div>
                      </td>
                      <td className="text-right text-gray-700">{fmtNum(agg.qty)}</td>
                      <td className="text-right text-gray-700">{fmtM(agg.amount)}</td>
                      <td className="text-right text-gray-700">{fmtNum(agg.pallets)}</td>
                      <td className="text-right text-gray-700">{fmtHr(agg.hours)}</td>
                      <td className="text-right font-semibold text-gray-800">{fmtM(agg.amtPerHr)}/h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-5 py-3.5 border-b border-border">
            <CardTitle className="text-sm font-semibold">{selected} 입고유형 구성 (정산 기준)</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {typeRows.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-gray-300 text-xs">데이터 없음</div>
            ) : (
              <div className="space-y-3">
                {/* 스택 바 */}
                <div className="flex h-4 rounded-full overflow-hidden">
                  {typeRows.map(t => {
                    const totalQty = typeRows.reduce((s, x) => s + x.qty, 0)
                    const w = totalQty > 0 ? (t.qty / totalQty) * 100 : 0
                    return <div key={t.key} style={{ width: `${w}%`, background: t.color }} title={`${t.label} ${fmtNum(t.qty)}개`} />
                  })}
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100">
                      <th className="text-left  py-1.5 font-medium">유형</th>
                      <th className="text-right py-1.5 font-medium">수량</th>
                      <th className="text-right py-1.5 font-medium">금액</th>
                      <th className="text-right py-1.5 font-medium">비중</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeRows.map(t => {
                      const totalQty = typeRows.reduce((s, x) => s + x.qty, 0)
                      return (
                        <tr key={t.key} className="border-b border-gray-50">
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                              <span className="text-gray-700">{t.label}</span>
                            </div>
                          </td>
                          <td className="text-right text-gray-700">{fmtNum(t.qty)}</td>
                          <td className="text-right text-gray-700">{fmtM(t.amt / 1_000_000)}</td>
                          <td className="text-right font-semibold text-gray-800">
                            {fmtPct(totalQty > 0 ? (t.qty / totalQty) * 100 : 0)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 센터별 추이 ── */}
      <Card>
        <CardHeader className="px-5 py-3.5 border-b border-border">
          <CardTitle className="text-sm font-semibold">센터별 입고 추이</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          {trendData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-300 text-xs">데이터가 없습니다</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={trendData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                <Tooltip
                  content={(props: any) => (
                    <ChartTooltip
                      active={props.active}
                      payload={props.payload}
                      label={props.label}
                      formatter={(v) => metricFmt(v, metric)}
                    />
                  )}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  formatter={(v: string) => v === 'total' ? '합계' : v} />
                {CENTERS.map((c, i) => (
                  <Bar key={c} dataKey={c} stackId="a" fill={CENTER_COLOR[c]}
                    radius={i === CENTERS.length - 1 ? [3,3,0,0] : [0,0,0,0]} />
                ))}
                <Line dataKey="total" stroke="#94a3b8" strokeWidth={2}
                  dot={{ r: 3, fill: '#94a3b8' }} activeDot={{ r: 5 }} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
