import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
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

export type Metric = 'amount' | 'box'

interface Props { period: Period; metric: Metric; granularity: Granularity }

/* ── 포맷 헬퍼 ── */
const fmtM   = (v: number) => `${v.toFixed(1)}M`
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

/* ── 집계 헬퍼 ── */
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
    eff:       std > 0 ? (act / std) * 100 : 0,
    amtPerHr:  act > 0 ? (amount / 1_000_000) / act : 0,
    boxPerHr:  act > 0 ? box / act : 0,
  }
}

/* ── 추이 데이터 ── */
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

/* ── 서브컴포넌트: 전체 KPI 카드 ── */
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

/* ── 서브컴포넌트: 센터 요약 카드 ── */
function CenterCard({ center, kpi, metric }: {
  center: string; kpi: KpiResult; metric: Metric
}) {
  const color = CENTER_COLOR[center]
  const owners = CENTER_OWNERS[center]
  const isAmt = metric === 'amount'
  return (
    <Card>
      <CardContent className="p-5">
        {/* 헤더 */}
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
        {/* 주요 지표 */}
        <p className="text-2xl font-bold mb-3" style={{ color }}>
          {isAmt ? fmtM(kpi.amount) : fmtNum(kpi.box)}
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

/* ── 서브컴포넌트: 브랜드 요약 카드 ── */
function OwnerCard({ owner, kpi, metric }: {
  owner: string; kpi: KpiResult; metric: Metric
}) {
  const color = OWNER_COLOR[owner]
  const isAmt = metric === 'amount'
  const center = CENTER_OWNER[owner]
  return (
    <Card>
      <CardContent className="p-5">
        {/* 헤더 */}
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
        {/* 주요 수치 */}
        <p className="text-xl font-bold mb-3" style={{ color }}>
          {isAmt ? fmtM(kpi.amount) : fmtNum(kpi.box)}
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

/* ── 메인 컴포넌트 ── */
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

  /* 기간 필터 — KPI/요약 카드 전용 */
  const { start, end } = periodToRange(period)
  const pRows = rows.filter(r => r.work_date >= start && r.work_date <= end)

  /* 전체 KPI */
  const total = aggregateKpi(pRows)

  /* 센터별 KPI */
  const centerKpi = Object.fromEntries(
    CENTERS.map(c => [c, aggregateKpi(pRows.filter(r => CENTER_OWNERS[c].includes(r.owner)))])
  )

  /* 브랜드별 KPI */
  const ownerKpi = Object.fromEntries(
    OWNERS.map(o => [o, aggregateKpi(pRows.filter(r => r.owner === o))])
  )

  /* 추이 차트 — 전체 히스토리 */
  const trendData = toTrendData(rows, granularity)
  const granLabel = granularity === 'week' ? '주간' : '월간'
  const isAmt = metric === 'amount'

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
          value={fmtNum(total.box)}
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

      {/* ── 피킹실적 추이 — 전체 히스토리 ── */}
      <Card>
        <CardHeader className="px-5 py-3.5 border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">{granLabel} 피킹금액 추이 (M)</CardTitle>
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
                  tickFormatter={v => `${v}M`}
                />
                <Tooltip
                  formatter={(v: number, name: string) =>
                    name === 'total'
                      ? [fmtM(v), '합계']
                      : [fmtM(v), name]
                  }
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
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
