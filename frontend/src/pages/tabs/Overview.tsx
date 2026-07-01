import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts'
import { useAllZoneData } from '../../hooks/useAllZoneData'
import { periodToRange, dateToBucket, bucketLabel } from '../../lib/weekUtils'
import type { Granularity } from '../../lib/weekUtils'
import {
  OWNER_COLOR, OWNERS,
  CENTERS, CENTER_COLOR, CENTER_OWNERS, CENTER_OWNER,
} from '../../lib/supabase'
import type { ZoneDaily } from '../../lib/supabase'
import type { Period } from '../../lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartTooltip } from '@/components/ChartTooltip'

export type Metric = 'amount' | 'box'

interface Props { period: Period; metric: Metric; granularity: Granularity }

const fmtM   = (v: number) => `${v.toFixed(1)}백만`
const fmtBox = (v: number) => `${v.toLocaleString('ko-KR')}박스`
const fmtNum = (v: number) => v.toLocaleString('ko-KR')
const fmtPct = (v: number) => `${v.toFixed(1)}%`

function effColor(eff: number) {
  return eff >= 100 ? '#10b981' : eff >= 80 ? '#f97316' : '#ef4444'
}
function effBadge(eff: number) {
  return eff >= 100
    ? 'bg-emerald-50 text-emerald-600'
    : eff >= 80 ? 'bg-orange-50 text-orange-500'
    : 'bg-red-50 text-red-500'
}

interface KpiResult {
  amount: number; box: number
  std: number;    act: number
  zones: number
  eff: number
  amtPerHr: number
  boxPerHr: number
}

function aggregateKpi(rows: ZoneDaily[]): KpiResult {
  let amount = 0, box = 0, std = 0, act = 0
  const zoneSet = new Set<string>()
  for (const r of rows) {
    amount += r.pick_amount ?? 0
    box    += r.pick_box    ?? 0
    std    += r.std_time_hr
    act    += r.act_time_hr
    zoneSet.add(r.zone)
  }
  return {
    amount: amount / 1_000_000,
    box,
    std, act,
    zones: zoneSet.size,
    eff:       act > 0 ? (std / act) * 100 : 0,
    amtPerHr:  act > 0 ? (amount / 1_000_000) / act : 0,
    boxPerHr:  act > 0 ? box / act : 0,
  }
}

function toTrendData(allRows: ZoneDaily[], gran: Granularity) {
  const map = new Map<string, Record<string, number>>()
  for (const r of allRows) {
    const bucket = dateToBucket(r.work_date, gran)
    if (!map.has(bucket)) map.set(bucket, {})
    const e = map.get(bucket)!
    e[r.owner]  = (e[r.owner]  ?? 0) + (r.pick_amount ?? 0) / 1_000_000
    e['_total'] = (e['_total'] ?? 0) + (r.pick_amount ?? 0) / 1_000_000
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, e]) => ({
      label: bucketLabel(bucket, gran),
      ...Object.fromEntries(OWNERS.map(o => [o, +(e[o] ?? 0).toFixed(2)])),
      total: +(e['_total'] ?? 0).toFixed(2),
    }))
}

function KpiCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-muted-foreground font-medium mb-3">{label}</p>
        <p className="text-2xl font-bold leading-none"
          style={{ color: color ?? 'hsl(var(--foreground))' }}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-2">{sub}</p>}
      </CardContent>
    </Card>
  )
}

/* ── 도넛 비중 카드 ── */
function DonutCard({ title, data, colors, total, totalLabel }: {
  title: string
  data: { name: string; value: number }[]
  colors: string[]
  total: string
  totalLabel: string
}) {
  const sum = data.reduce((s, d) => s + d.value, 0)
  return (
    <Card>
      <CardHeader className="px-5 py-3.5 border-b border-border">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        <div className="flex items-center gap-6">
          <div className="relative shrink-0">
            <PieChart width={130} height={130}>
              <Pie
                data={data}
                cx={65} cy={65}
                innerRadius={42} outerRadius={60}
                paddingAngle={2}
                dataKey="value"
                startAngle={90} endAngle={-270}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]} strokeWidth={0} />
                ))}
              </Pie>
            </PieChart>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-sm font-bold text-gray-800 leading-tight">{total}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{totalLabel}</p>
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            {data.map((d, i) => {
              const pct = sum > 0 ? ((d.value / sum) * 100).toFixed(1) : '0.0'
              return (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: colors[i] }} />
                  <span className="text-xs text-gray-600 flex-1 truncate">{d.name}</span>
                  <span className="text-xs font-bold text-gray-700">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CenterCard({ center, kpi, metric }: {
  center: string; kpi: KpiResult; metric: Metric
}) {
  const color = CENTER_COLOR[center]
  const owners = CENTER_OWNERS[center]
  const isAmt = metric === 'amount'
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span className="text-sm font-bold text-gray-700">{center}</span>
            <span className="text-xs text-gray-400">{owners.join(' · ')}</span>
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${effBadge(kpi.eff)}`}>
            {fmtPct(kpi.eff)}
          </span>
        </div>
        <p className="text-2xl font-bold mb-3" style={{ color }}>
          {isAmt ? fmtM(kpi.amount) : fmtBox(kpi.box)}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-400 mb-0.5">시간당 금액</p>
            <p className="text-sm font-semibold text-gray-700">{fmtM(kpi.amtPerHr)}/h</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-400 mb-0.5">시간당 박스</p>
            <p className="text-sm font-semibold text-gray-700">{fmtNum(Math.round(kpi.boxPerHr))}/h</p>
          </div>
        </div>
        <div className="flex gap-4 mt-3 text-xs text-gray-400">
          <span>표준 {kpi.std.toFixed(0)}h</span>
          <span>/</span>
          <span>실적 {kpi.act.toFixed(0)}h</span>
          <span>·</span>
          <span>구역 {kpi.zones}개</span>
        </div>
      </CardContent>
    </Card>
  )
}

function OwnerCard({ owner, kpi, metric }: {
  owner: string; kpi: KpiResult; metric: Metric
}) {
  const color = OWNER_COLOR[owner]
  const isAmt = metric === 'amount'
  const center = CENTER_OWNER[owner]
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span className="text-sm font-bold text-gray-700">{owner}</span>
            <span className="text-xs text-gray-300">{center}</span>
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${effBadge(kpi.eff)}`}>
            {fmtPct(kpi.eff)}
          </span>
        </div>
        <p className="text-xl font-bold mb-3" style={{ color }}>
          {isAmt ? fmtM(kpi.amount) : fmtBox(kpi.box)}
        </p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">시간당 금액</span>
            <span className="font-medium text-gray-700">{fmtM(kpi.amtPerHr)}/h</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">시간당 박스</span>
            <span className="font-medium text-gray-700">{fmtNum(Math.round(kpi.boxPerHr))}/h</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">표준/실적</span>
            <span className="font-medium text-gray-700">{kpi.std.toFixed(0)}h / {kpi.act.toFixed(0)}h</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Overview({ period, metric, granularity }: Props) {
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

  const total = aggregateKpi(pRows)
  const centerKpi = Object.fromEntries(
    CENTERS.map(c => [c, aggregateKpi(pRows.filter(r => CENTER_OWNERS[c].includes(r.owner)))])
  )
  const ownerKpi = Object.fromEntries(
    OWNERS.map(o => [o, aggregateKpi(pRows.filter(r => r.owner === o))])
  )

  const chartRows = granularity === 'day' ? pRows : rows
  const trendData = toTrendData(chartRows, granularity)
  const granLabel = granularity === 'day' ? '일별' : granularity === 'week' ? '주간' : '월간'

  /* 도넛 데이터 */
  const brandDonutData = OWNERS.map(o => ({
    name: o,
    value: isAmt ? ownerKpi[o].amount : ownerKpi[o].box,
  }))
  const centerDonutData = CENTERS.map(c => ({
    name: c,
    value: isAmt ? centerKpi[c].amount : centerKpi[c].box,
  }))

  const donutTotal = isAmt ? fmtM(total.amount) : fmtBox(total.box)

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── 전체 KPI ── */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="총 피킹금액"
          value={fmtM(total.amount)}
          sub={`${fmtNum(Math.round(total.amount * 100))}만원`}
          color="#FF6B35"
        />
        <KpiCard
          label="총 피킹박스수"
          value={fmtBox(total.box)}
          color="#6366f1"
        />
        <KpiCard
          label="평균 가동률"
          value={fmtPct(total.eff)}
          sub={total.eff >= 100 ? '목표 달성' : `목표까지 ${(100 - total.eff).toFixed(1)}%p`}
          color={effColor(total.eff)}
        />
        <KpiCard
          label="시간당 피킹금액"
          value={`${fmtM(total.amtPerHr)}/h`}
          sub={`${fmtNum(Math.round(total.boxPerHr))}박스/h`}
          color="#0ea5e9"
        />
      </div>

      {/* ── 비중 분석 (도넛) ── */}
      <div className="grid grid-cols-2 gap-4">
        <DonutCard
          title="브랜드별 피킹 비중"
          data={brandDonutData}
          colors={OWNERS.map(o => OWNER_COLOR[o])}
          total={donutTotal}
          totalLabel="합계"
        />
        <DonutCard
          title="센터별 피킹 비중"
          data={centerDonutData}
          colors={CENTERS.map(c => CENTER_COLOR[c])}
          total={donutTotal}
          totalLabel="합계"
        />
      </div>

      {/* ── 센터별 현황 ── */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">센터별 현황</p>
        <div className="grid grid-cols-3 gap-4">
          {CENTERS.map(c => (
            <CenterCard key={c} center={c} kpi={centerKpi[c]} metric={metric} />
          ))}
        </div>
      </div>

      {/* ── 브랜드별 현황 ── */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">브랜드별 현황</p>
        <div className="grid grid-cols-4 gap-4">
          {OWNERS.map(o => (
            <OwnerCard key={o} owner={o} kpi={ownerKpi[o]} metric={metric} />
          ))}
        </div>
      </div>

      {/* ── 피킹실적 추이 ── */}
      <Card>
        <CardHeader className="px-5 py-3.5 border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">{granLabel} 피킹금액 추이 (백만원)</CardTitle>
            <span className="text-xs text-muted-foreground">전체 기간 기준</span>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {trendData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-300 text-xs">데이터가 없습니다</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={trendData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickFormatter={v => `${v}백만`}
                />
                <Tooltip
                  content={(props: any) => (
                    <ChartTooltip
                      active={props.active}
                      payload={props.payload}
                      label={props.label}
                      formatter={(v) => fmtM(v)}
                    />
                  )}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  formatter={(v: string) => v === 'total' ? '합계' : v}
                />
                {OWNERS.map(o => (
                  <Bar key={o} dataKey={o} stackId="a" fill={OWNER_COLOR[o]}
                    radius={o === '3PL' ? [3,3,0,0] : [0,0,0,0]} />
                ))}
                <Line
                  dataKey="total" stroke="#94a3b8" strokeWidth={2}
                  dot={{ r: 3, fill: '#94a3b8' }} activeDot={{ r: 5 }} type="monotone"
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
