import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import { useAllZoneData } from '../../hooks/useAllZoneData'
import { periodToRange, dateToBucket, bucketLabel } from '../../lib/weekUtils'
import type { Granularity } from '../../lib/weekUtils'
import { OWNER_COLOR, OWNERS } from '../../lib/supabase'
import type { ZoneDaily } from '../../lib/supabase'
import type { Period } from '../../lib/types'
import type { Metric } from './Overview'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartTooltip } from '@/components/ChartTooltip'

interface Props { period: Period; metric: Metric; granularity: Granularity }

const fmtPct = (v: number) => `${v.toFixed(1)}%`
const fmtM   = (v: number) => `${v.toFixed(1)}백만`
const fmtBox = (v: number) => `${v.toLocaleString('ko-KR')}박스`
const fmtNum = (v: number) => v.toLocaleString('ko-KR')

function metricVal(r: ZoneDaily, metric: Metric) {
  return metric === 'amount' ? (r.pick_amount ?? 0) : (r.pick_box ?? 0)
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

/* ── 브랜드별 가동률 추이 (전체 데이터, granularity) ── */
function weeklyEffByOwner(rows: ZoneDaily[], gran: Granularity) {
  const map = new Map<string, Map<string, { std: number; act: number }>>()
  for (const r of rows) {
    const bucket = dateToBucket(r.work_date, gran)
    if (!map.has(bucket)) map.set(bucket, new Map())
    const bm = map.get(bucket)!
    if (!bm.has(r.owner)) bm.set(r.owner, { std: 0, act: 0 })
    const e = bm.get(r.owner)!
    e.std += r.std_time_hr
    e.act += r.act_time_hr
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, bm]) => ({
      label: bucketLabel(bucket, gran),
      ...Object.fromEntries(OWNERS.map(o => {
        const e = bm.get(o) ?? { std: 0, act: 0 }
        return [o, e.act > 0 ? +((e.std / e.act) * 100).toFixed(1) : null]
      })),
    }))
}

/* ── 구역별 가동률 집계 ── */
interface ZoneEffRow {
  zone: string; owner: string; eff: number; std: number; act: number
}
function zoneEfficiency(rows: ZoneDaily[]): ZoneEffRow[] {
  const map = new Map<string, ZoneEffRow>()
  for (const r of rows) {
    const key = `${r.owner}|${r.zone}`
    if (!map.has(key)) map.set(key, { zone: r.zone, owner: r.owner, eff: 0, std: 0, act: 0 })
    const e = map.get(key)!
    e.std += r.std_time_hr
    e.act += r.act_time_hr
  }
  return [...map.values()]
    .map(e => ({ ...e, eff: e.act > 0 ? +((e.std / e.act) * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.eff - a.eff)
}

/* ── 브랜드별 시간당 피킹 (전체 데이터, granularity) — 그룹 바용 ── */
function pickPerHourByBrand(rows: ZoneDaily[], metric: Metric, gran: Granularity) {
  const scale = metric === 'amount' ? 1_000_000 : 1
  const map = new Map<string, Map<string, { val: number; act: number }>>()
  for (const r of rows) {
    const bucket = dateToBucket(r.work_date, gran)
    if (!map.has(bucket)) map.set(bucket, new Map())
    const bm = map.get(bucket)!
    if (!bm.has(r.owner)) bm.set(r.owner, { val: 0, act: 0 })
    const e = bm.get(r.owner)!
    e.val += metricVal(r, metric) / scale
    e.act += r.act_time_hr
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, bm]) => ({
      label: bucketLabel(bucket, gran),
      ...Object.fromEntries(OWNERS.map(o => {
        const e = bm.get(o) ?? { val: 0, act: 0 }
        return [o, e.act > 0 ? +(e.val / e.act).toFixed(3) : null]
      })),
    }))
}

/* ── 메인 컴포넌트 ── */
export default function Productivity({ period, metric, granularity }: Props) {
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
  const unit = isAmt ? '백만원' : '박스'
  const granLabel = granularity === 'day' ? '일별' : granularity === 'week' ? '주간' : '월간'

  /* 전체 KPI — 선택 기간 기준 */
  let totalStd = 0, totalAct = 0, totalVal = 0
  const scale = isAmt ? 1_000_000 : 1
  for (const r of pRows) {
    totalStd += r.std_time_hr
    totalAct += r.act_time_hr
    totalVal += metricVal(r, metric) / scale
  }
  const overallEff = totalAct > 0 ? (totalStd / totalAct) * 100 : 0
  const pickPerHr  = totalAct > 0 ? totalVal / totalAct : 0

  /* 차트 데이터 — 일별은 선택 기간, 주간/월간은 전체 기반 */
  const chartRows = granularity === 'day' ? pRows : rows
  const effTrend  = weeklyEffByOwner(chartRows, granularity)
  const zoneEff   = zoneEfficiency(pRows)       // 구역별 가동률은 기간 기준 유지
  const pphTrend  = pickPerHourByBrand(chartRows, metric, granularity)

  return (
    <div className="space-y-5 animate-fade-in">

      {/* KPI 요약 — 선택 기간 기준 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">전체 가동률</p>
            <p className="text-2xl font-bold" style={{
              color: overallEff >= 100 ? '#10b981' : overallEff >= 80 ? '#f97316' : '#ef4444'
            }}>{fmtPct(overallEff)}</p>
            <p className="text-xs text-muted-foreground mt-1">목표 100%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">
              시간당 피킹 ({unit}/h)
            </p>
            <p className="text-2xl font-bold text-[#FF6B35]">
              {isAmt ? fmtM(pickPerHr) : fmtBox(Math.round(pickPerHr))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">실적시간 기준</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">표준/실적 시간</p>
            <p className="text-2xl font-bold">{totalStd.toFixed(0)}h</p>
            <p className="text-xs text-muted-foreground mt-1">실적 {totalAct.toFixed(0)}h</p>
          </CardContent>
        </Card>
      </div>

      {/* 브랜드별 가동률 추이 — 전체 히스토리 */}
      <SectionCard title={`브랜드별 가동률 ${granLabel} 추이 (%)`} subtitle="표준시간/실적시간">
        {effTrend.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-300 text-xs">데이터 없음</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={effTrend} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                domain={[50, 120]}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip
                content={(props: any) => (
                  <ChartTooltip
                    active={props.active}
                    payload={props.payload}
                    label={props.label}
                    formatter={(v) => `${v}%`}
                  />
                )}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <ReferenceLine y={100} stroke="#6b7280" strokeDasharray="4 2" strokeWidth={1} label={{ value: '100%', position: 'right', fontSize: 10, fill: '#6b7280' }} />
              {OWNERS.map(o => (
                <Line
                  key={o} dataKey={o}
                  stroke={OWNER_COLOR[o]} strokeWidth={2.5}
                  dot={{ r: 4, fill: OWNER_COLOR[o] }} activeDot={{ r: 6 }}
                  type="monotone" connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* 구역별 가동률 + 브랜드별 시간당 나란히 */}
      <div className="grid grid-cols-2 gap-5">

        {/* 구역별 가동률 수평 막대 — 선택 기간 기준 */}
        <SectionCard title="구역별 가동률 비교 (%)" subtitle="가동률 순">
          {zoneEff.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-300 text-xs">데이터 없음</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, zoneEff.length * 28)}>
              <BarChart
                data={zoneEff}
                layout="vertical"
                margin={{ top: 4, right: 40, left: 24, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis
                  type="number" domain={[0, 120]}
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickFormatter={v => `${v}%`}
                />
                <YAxis
                  type="category" dataKey="zone"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  width={36}
                />
                <Tooltip
                  formatter={(v: number, _: string, props) => {
                    const item = props.payload as ZoneEffRow
                    return [`${v}%`, `${item?.owner ?? ''} · ${item?.zone ?? ''}`]
                  }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <ReferenceLine x={100} stroke="#6b7280" strokeDasharray="4 2" strokeWidth={1} />
                <Bar dataKey="eff" radius={[0, 4, 4, 0]} maxBarSize={20}
                  label={{ position: 'right', fontSize: 10, fill: '#6b7280', formatter: (v: number) => `${v}%` }}
                >
                  {zoneEff.map(z => (
                    <Cell key={z.zone} fill={OWNER_COLOR[z.owner]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* 브랜드별 시간당 피킹 — 그룹 바, 전체 히스토리 */}
        <SectionCard
          title={`브랜드별 시간당 피킹 ${granLabel} 추이 (${unit}/h)`}
          subtitle="실적시간 기준"
        >
          {pphTrend.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-300 text-xs">데이터 없음</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={pphTrend} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickFormatter={v => isAmt ? `${v}백만` : fmtNum(v)}
                />
                <Tooltip
                  content={(props: any) => (
                    <ChartTooltip
                      active={props.active}
                      payload={props.payload}
                      label={props.label}
                      formatter={(v) => isAmt ? `${fmtM(v)}/h` : `${fmtBox(Math.round(v))}/h`}
                    />
                  )}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                {OWNERS.map(o => (
                  <Bar key={o} dataKey={o} fill={OWNER_COLOR[o]} radius={[3,3,0,0]} maxBarSize={20} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
