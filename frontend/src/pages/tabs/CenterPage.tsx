import {
  ComposedChart, Bar, Line, BarChart,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useAllZoneData } from '../../hooks/useAllZoneData'
import { periodToRange, dateToBucket, bucketLabel } from '../../lib/weekUtils'
import type { Granularity } from '../../lib/weekUtils'
import { OWNER_COLOR, CENTERS, CENTER_COLOR, CENTER_OWNERS, CENTER_OWNER } from '../../lib/supabase'
import type { ZoneDaily } from '../../lib/supabase'
import type { Period } from '../../lib/types'
import type { Metric } from './Overview'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props { period: Period; metric: Metric; granularity: Granularity }

const fmtM   = (v: number) => `${v.toFixed(1)}M`
const fmtNum = (v: number) => v.toLocaleString('ko-KR')
const fmtPct = (v: number) => `${v.toFixed(1)}%`

function metricVal(r: ZoneDaily, metric: Metric) {
  return metric === 'amount' ? (r.pick_amount ?? 0) : (r.pick_box ?? 0)
}
function metricScale(metric: Metric) { return metric === 'amount' ? 1_000_000 : 1 }

function effBadge(eff: number) {
  return eff >= 100 ? 'bg-emerald-50 text-emerald-600'
    : eff >= 80 ? 'bg-orange-50 text-orange-500'
    : 'bg-red-50 text-red-500'
}

function SectionCard({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="px-5 py-3.5 border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  )
}

export default function CenterPage({ period, metric, granularity }: Props) {
  const { rows, loading } = useAllZoneData()

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
  const isAmt = metric === 'amount'
  const scale = metricScale(metric)
  const unit = isAmt ? 'M' : '박스'
  const granLabel = granularity === 'day' ? '일별' : granularity === 'week' ? '주간' : '월간'

  /* ── 센터별 KPI (선택 기간) ─────────────────────── */
  const centerKpi = CENTERS.map(center => {
    const cOwners = CENTER_OWNERS[center]
    const cRows = pRows.filter(r => cOwners.includes(r.owner))
    let std = 0, act = 0, val = 0
    const zones = new Set<string>()
    for (const r of cRows) {
      std += r.std_time_hr
      act += r.act_time_hr
      val += metricVal(r, metric) / scale
      zones.add(r.zone)
    }
    return {
      center,
      val: +val.toFixed(2),
      eff: act > 0 ? (std / act) * 100 : 0,
      std, act,
      zones: zones.size,
      owners: cOwners,
    }
  })

  /* ── 센터별 실적 추이 — 일별은 선택 기간, 주간/월간은 전체 ── */
  const chartRows = granularity === 'day' ? pRows : rows
  const trendMap = new Map<string, Record<string, number>>()
  for (const r of chartRows) {
    const bucket = dateToBucket(r.work_date, granularity)
    const center = CENTER_OWNER[r.owner] ?? '기타'
    if (!trendMap.has(bucket)) trendMap.set(bucket, {})
    const e = trendMap.get(bucket)!
    e[center]   = (e[center]   ?? 0) + metricVal(r, metric) / scale
    e['_total'] = (e['_total'] ?? 0) + metricVal(r, metric) / scale
  }
  const trendData = [...trendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, e]) => ({
      label: bucketLabel(bucket, granularity),
      ...Object.fromEntries(CENTERS.map(c => [c, +(e[c] ?? 0).toFixed(2)])),
      total: +(e['_total'] ?? 0).toFixed(2),
    }))

  /* ── 1센터 브랜드 비중 추이 ─────────────────────── */
  const c1Owners = CENTER_OWNERS['1센터']
  const c1TrendMap = new Map<string, Record<string, number>>()
  for (const r of chartRows.filter(r => c1Owners.includes(r.owner))) {
    const bucket = dateToBucket(r.work_date, granularity)
    if (!c1TrendMap.has(bucket)) c1TrendMap.set(bucket, {})
    const e = c1TrendMap.get(bucket)!
    e[r.owner] = (e[r.owner] ?? 0) + metricVal(r, metric) / scale
  }
  const c1TrendData = [...c1TrendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, e]) => ({
      label: bucketLabel(bucket, granularity),
      ...Object.fromEntries(c1Owners.map(o => [o, +(e[o] ?? 0).toFixed(2)])),
    }))

  return (
    <div className="space-y-5 animate-fade-in">

      {/* 센터 KPI 카드 3개 */}
      <div className="grid grid-cols-3 gap-4">
        {centerKpi.map(c => (
          <Card key={c.center}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: CENTER_COLOR[c.center] }} />
                  <p className="text-sm font-semibold text-gray-700">{c.center}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${effBadge(c.eff)}`}>
                  {fmtPct(c.eff)}
                </span>
              </div>
              <p className="text-2xl font-bold" style={{ color: CENTER_COLOR[c.center] }}>
                {isAmt ? fmtM(c.val) : fmtNum(c.val)}
              </p>
              <div className="flex gap-3 mt-2 text-xs text-gray-400">
                <span>{c.owners.join(' · ')}</span>
                <span>·</span>
                <span>구역 {c.zones}개</span>
              </div>
              <div className="flex gap-3 mt-1 text-xs text-gray-400">
                <span>표준 {c.std.toFixed(0)}h</span>
                <span>/</span>
                <span>실적 {c.act.toFixed(0)}h</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 센터별 실적 추이 — 전체 히스토리 */}
      <SectionCard title={`센터별 피킹실적 ${granLabel} 추이 (${unit})`}>
        {trendData.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-300 text-xs">데이터 없음</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={trendData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={v => isAmt ? `${v}M` : fmtNum(v)}
              />
              <Tooltip
                formatter={(v: number, name: string) =>
                  name === 'total'
                    ? [isAmt ? fmtM(v) : fmtNum(v), '합계']
                    : [isAmt ? fmtM(v) : fmtNum(v), name]
                }
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={(v: string) => v === 'total' ? '합계' : v}
              />
              {[...CENTERS].reverse().map((c, i) => (
                <Bar key={c} dataKey={c} stackId="a"
                  fill={CENTER_COLOR[c]}
                  radius={i === CENTERS.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
              <Line dataKey="total" stroke="#94a3b8" strokeWidth={2}
                dot={{ r: 3, fill: '#94a3b8' }} activeDot={{ r: 5 }} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* 센터별 가동률 + 1센터 브랜드 비중 나란히 */}
      <div className="grid grid-cols-2 gap-5">

        {/* 센터별 가동률 — 프로그레스 바 */}
        <SectionCard title="센터별 가동률" subtitle="선택 기간 기준">
          <div className="space-y-5 pt-1">
            {[...centerKpi].sort((a, b) => b.eff - a.eff).map(c => (
              <div key={c.center}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: CENTER_COLOR[c.center] }} />
                    <span className="text-sm font-medium text-gray-600">{c.center}</span>
                    <span className="text-xs text-gray-400">({c.owners.join('·')})</span>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${effBadge(c.eff)}`}>
                    {fmtPct(c.eff)}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(c.eff, 120) / 1.2}%`,
                      background: CENTER_COLOR[c.center],
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-xs text-gray-400">
                  <span>표준 {c.std.toFixed(0)}h</span>
                  <span>실적 {c.act.toFixed(0)}h</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 1센터 브랜드 비중 추이 */}
        <SectionCard title={`1센터 브랜드별 추이 (${unit})`} subtitle="퍼시스 · 일룸">
          {c1TrendData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-300 text-xs">데이터 없음</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={c1TrendData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickFormatter={v => isAmt ? `${v}M` : fmtNum(v)}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [isAmt ? fmtM(v) : fmtNum(v), name]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                {c1Owners.map((o, i) => (
                  <Bar key={o} dataKey={o} stackId="a"
                    fill={OWNER_COLOR[o]}
                    radius={i === c1Owners.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
