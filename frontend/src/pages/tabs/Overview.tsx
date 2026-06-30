import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart,
  CartesianGrid,
} from 'recharts'
import { useAllZoneData } from '../../hooks/useAllZoneData'
import { periodToRange, dateToWeekStart, weekLabel, getWeekEnd } from '../../lib/weekUtils'
import { OWNER_COLOR, OWNERS } from '../../lib/supabase'
import type { ZoneDaily } from '../../lib/supabase'
import type { Period } from '../../lib/types'

export type Metric = 'amount' | 'box'

interface Props { period: Period; metric: Metric }

/* ── 포맷 헬퍼 ───────────────────────────────────────────────── */
const fmtM   = (v: number) => `${v.toFixed(1)}M`
const fmtNum = (v: number) => v.toLocaleString('ko-KR')
const fmtPct = (v: number) => `${v.toFixed(1)}%`

function metricVal(r: ZoneDaily, metric: Metric) {
  return metric === 'amount' ? (r.pick_amount ?? 0) : (r.pick_box ?? 0)
}
function metricScale(metric: Metric) { return metric === 'amount' ? 1_000_000 : 1 }
function metricUnit(metric: Metric)  { return metric === 'amount' ? 'M₩' : '박스' }

/* ── KPI 집계 ────────────────────────────────────────────────── */
function computeKpi(rows: ZoneDaily[], metric: Metric) {
  let amount = 0, box = 0, std = 0, act = 0
  const zones = new Set<string>()
  for (const r of rows) {
    amount += r.pick_amount ?? 0
    box    += r.pick_box    ?? 0
    std    += r.std_time_hr
    act    += r.act_time_hr
    zones.add(`${r.owner}|${r.zone}`)
  }
  return {
    primary: metric === 'amount' ? amount / 1_000_000 : box,
    box, amount,
    eff: std > 0 ? (act / std) * 100 : 0,
    zones: zones.size,
  }
}

/* ── S1: 주간 피킹실적 추이 ─────────────────────────────────── */
function toS1Data(rows: ZoneDaily[], metric: Metric) {
  const scale = metricScale(metric)
  const map = new Map<string, Record<string, number>>()
  for (const r of rows) {
    const ws = dateToWeekStart(r.work_date)
    if (!map.has(ws)) map.set(ws, {})
    const e = map.get(ws)!
    e[r.owner] = (e[r.owner] ?? 0) + metricVal(r, metric) / scale
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ws, e]) => ({
      weekLabel: weekLabel(ws),
      ...Object.fromEntries(OWNERS.map(o => [o, +(e[o] ?? 0).toFixed(2)])),
      total: +OWNERS.reduce((s, o) => s + (e[o] ?? 0), 0).toFixed(2),
    }))
}

/* ── S2: 브랜드 비중 도넛 ───────────────────────────────────── */
function toDonutData(rows: ZoneDaily[], metric: Metric) {
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(r.owner, (map.get(r.owner) ?? 0) + metricVal(r, metric))
  }
  return OWNERS
    .filter(o => (map.get(o) ?? 0) > 0)
    .map(o => ({ name: o, value: map.get(o) ?? 0, color: OWNER_COLOR[o] }))
}

/* ── S3: 브랜드별 월별 비교 ──────────────────────────────────── */
interface MonthRow { label: string; [k: string]: string | number }
function toMonthData(rows: ZoneDaily[], metric: Metric): MonthRow[] {
  const scale = metricScale(metric)
  const map = new Map<string, MonthRow>()
  for (const r of rows) {
    const m   = parseInt(r.work_date.slice(5, 7))
    const key = r.work_date.slice(0, 7)
    if (!map.has(key)) map.set(key, { label: `${m}월` })
    const e = map.get(key)!
    e[r.owner] = +((+(e[r.owner] ?? 0)) + metricVal(r, metric) / scale).toFixed(2)
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'ko'))
}

/* ── 서브컴포넌트 ───────────────────────────────────────────── */

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode
}) {
  const c = color ?? '#6b7280'
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
      {/* 컬러 상단 라인 */}
      <div className="h-[3px]" style={{ backgroundColor: c }} />
      <div className="px-5 py-4">
        <div className="flex items-start justify-between mb-3">
          <p className="text-[11.5px] text-gray-500 font-medium">{label}</p>
          {icon && (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${c}18` }}>
              <span style={{ color: c }}>{icon}</span>
            </div>
          )}
        </div>
        <p className="text-[26px] font-bold text-gray-800 leading-none">{value}</p>
        {sub && (
          <p className="text-[11px] mt-1.5 font-medium" style={{ color: c }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}

function SectionCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_4px_rgba(0,0,0,0.07)]">
      <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
        <p className="text-[13px] font-bold text-gray-800">{title}</p>
        {sub && <p className="text-[11px] text-gray-400 ml-1">{sub}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function DonutChart({ data, title, metric }: {
  data: { name: string; value: number; color: string }[]
  title: string
  metric: Metric
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return (
    <div className="flex flex-col items-center">
      <p className="text-[11px] text-gray-400 mb-2">{title}</p>
      <div className="flex items-center justify-center h-[140px] text-gray-300 text-[12px]">데이터 없음</div>
    </div>
  )
  const scale = metricScale(metric)
  const fmt   = (v: number) => metric === 'amount' ? fmtM(v / scale) : fmtNum(v)

  return (
    <div className="flex flex-col items-center">
      <p className="text-[11px] text-gray-400 mb-1 font-medium">{title}</p>
      <PieChart width={160} height={160}>
        <Pie
          data={data} cx={78} cy={78}
          innerRadius={46} outerRadius={72}
          dataKey="value" paddingAngle={2}
        >
          {data.map(d => <Cell key={d.name} fill={d.color} />)}
        </Pie>
        <Tooltip
          formatter={(v: number, name: string) => [
            `${fmt(v)} (${((v / total) * 100).toFixed(1)}%)`, name
          ]}
        />
      </PieChart>
      <div className="space-y-1 w-full mt-1">
        {data.map(d => (
          <div key={d.name} className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: d.color }} />
              <span className="text-gray-600">{d.name}</span>
            </span>
            <span className="font-semibold text-gray-700">{((d.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── 메인 컴포넌트 ──────────────────────────────────────────── */
export default function Overview({ period, metric }: Props) {
  const { rows, loading } = useAllZoneData()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-letusOrange border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[12px]">데이터 로딩 중...</p>
        </div>
      </div>
    )
  }

  /* 기간 필터 */
  const { start, end } = periodToRange(period)
  const pRows = rows.filter(r => r.work_date >= start && r.work_date <= end)

  /* KPI */
  const kpi = computeKpi(pRows, metric)

  /* S1 data */
  const s1Data = toS1Data(pRows, metric)

  /* S2 data — 3 고정 기간 */
  const now = new Date()
  const localDate  = (d: Date) => {
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0')
    return `${y}-${m}-${day}`
  }
  const todayStr   = localDate(now)
  const thisWs     = dateToWeekStart(todayStr)
  const thisWe     = new Date(thisWs); thisWe.setDate(thisWe.getDate() + 6)
  const thisWeStr  = localDate(thisWe)
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const s2Week  = toDonutData(rows.filter(r => r.work_date >= thisWs  && r.work_date <= thisWeStr), metric)
  const s2Month = toDonutData(rows.filter(r => r.work_date >= monthStart), metric)
  const s2All   = toDonutData(rows, metric)

  /* S3 data */
  const s3Data = toMonthData(rows, metric)

  const unit = metricUnit(metric)
  const isAmt = metric === 'amount'

  return (
    <div className="space-y-5 animate-fade-in">

      {/* KPI 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label={isAmt ? '총 피킹금액' : '총 피킹박스수'}
          value={isAmt ? `${fmtM(kpi.primary)}₩` : fmtNum(kpi.primary)}
          sub={isAmt ? `${fmtNum(Math.round(kpi.primary * 100))}만원` : `${fmtM(kpi.primary / 1)}박스`}
          color="#FF6B35"
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>}
        />
        <StatCard
          label="평균 가동률"
          value={fmtPct(kpi.eff)}
          sub={kpi.eff >= 100 ? '✓ 목표 달성' : `목표 100% (${(kpi.eff - 100).toFixed(1)}%p)`}
          color={kpi.eff >= 100 ? '#10b981' : kpi.eff >= 80 ? '#f97316' : '#ef4444'}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
        />
        <StatCard
          label="피킹박스수"
          value={fmtNum(kpi.box)}
          sub={`${unit} 기준`}
          color="#6366f1"
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-2.18c.07-.44.18-.87.18-1.3C18 2.57 15.43 0 12.3 0c-1.68 0-3.19.8-4.18 2.05L12 6H20zm-7.4 0l-3.24-3.68C9.07 2.12 9 1.83 9 1.5 9 .67 9.67 0 10.5 0S12 .67 12 1.5V6h.6zM4 6c.07-.44.18-.87.18-1.3C4.18 2.57 1.61 0-1.52 0H-2l-2 6H4z"/><path d="M2 8v13h20V8H2zm9 11H7v-2h4v2zm0-4H7v-2h4v2zm6 4h-4v-2h4v2zm0-4h-4v-2h4v2z"/></svg>}
        />
        <StatCard
          label="활동 구역수"
          value={String(kpi.zones)}
          sub="개 구역 활동"
          color="#0ea5e9"
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>}
        />
      </div>

      {/* S1: 주간 피킹실적 추이 */}
      <SectionCard title={`주간 피킹실적 추이 (${unit})`}>
        {s1Data.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-300 text-[12px]">
            선택 기간에 데이터가 없습니다
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={s1Data} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="weekLabel" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={v => isAmt ? `${v}M` : fmtNum(v)}
              />
              <Tooltip
                formatter={(v: number, name: string) =>
                  name === 'total'
                    ? [`${isAmt ? fmtM(v) : fmtNum(v)}${isAmt ? '₩' : ''}`, '합계']
                    : [`${isAmt ? fmtM(v) : fmtNum(v)}${isAmt ? '₩' : ''}`, name]
                }
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={(v: string) => v === 'total' ? '합계' : v}
              />
              {OWNERS.map(o => (
                <Bar key={o} dataKey={o} stackId="a" fill={OWNER_COLOR[o]} radius={o === '3PL' ? [3,3,0,0] : [0,0,0,0]} />
              ))}
              <Line
                dataKey="total" stroke="#FF6B35" strokeWidth={2}
                dot={{ r: 3, fill: '#FF6B35' }} activeDot={{ r: 5 }}
                type="monotone"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* S2 + S3 나란히 */}
      <div className="grid grid-cols-2 gap-5">

        {/* S2: 브랜드 비중 도넛 3종 */}
        <SectionCard title={`브랜드 비중 (${unit})`}>
          <div className="grid grid-cols-3 gap-2">
            <DonutChart data={s2Week}  title="이번주" metric={metric} />
            <DonutChart data={s2Month} title="이번달" metric={metric} />
            <DonutChart data={s2All}   title="전체기간" metric={metric} />
          </div>
        </SectionCard>

        {/* S3: 브랜드별 월별 비교 */}
        <SectionCard title={`브랜드별 월별 실적 (${unit})`}>
          {s3Data.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-300 text-[12px]">데이터 없음</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={s3Data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickFormatter={v => isAmt ? `${v}M` : fmtNum(v)}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [
                    `${isAmt ? fmtM(v) : fmtNum(v)}${isAmt ? '₩' : ''}`, name
                  ]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                {OWNERS.map(o => (
                  <Bar key={o} dataKey={o} fill={OWNER_COLOR[o]} radius={[3,3,0,0]} maxBarSize={48} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
