import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine,
  LabelList, ResponsiveContainer,
} from 'recharts'
import { api } from '../api/client'
import type { WorkerSummary } from '../api/client'
import { useAuth } from '../hooks/useAuth'

/* ── 색상 / 포맷 ────────────────────────────────────────────────── */
const effColor = (r: number) => r >= 1 ? '#52C41A' : r >= 0.8 ? '#FF6B35' : '#FF4444'

const fmt = {
  pct: (v: number) => `${(v * 100).toFixed(1)}%`,
  h:   (m: number) => `${(m / 60).toFixed(1)}h`,
  n:   (v: number) => v.toLocaleString('ko-KR'),
}

/* ── 실시간 시계 ─────────────────────────────────────────────────── */
function Clock() {
  const [t, setT] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="text-[12px] text-gray-500 tabular-nums">
      {t.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}

/* ── 상태 뱃지 ───────────────────────────────────────────────────── */
function EffBadge({ ratio }: { ratio: number }) {
  const base = 'text-[11px] font-bold px-2 py-1 rounded border'
  if (ratio >= 1)   return <span className={`${base} bg-green-50 text-green-600 border-green-200`}>달성</span>
  if (ratio >= 0.8) return <span className={`${base} bg-amber-50 text-amber-600 border-amber-200`}>주의</span>
  return              <span className={`${base} bg-red-50  text-red-600  border-red-200`}>미달</span>
}

/* ── 화주사 뱃지 ─────────────────────────────────────────────────── */
function OwnerBadge({ owner }: { owner: string }) {
  const cls = owner === '일룸'
    ? 'bg-blue-50 text-blue-600 border-blue-200'
    : 'bg-green-50 text-green-700 border-green-200'
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${cls}`}>{owner}</span>
}

/* ── 도넛 KPI 카드 ───────────────────────────────────────────────── */
interface KpiRow { label: string; value: string }

function DonutKpi({
  title, centerMain, centerSub, pct, fill, rows, delay = '0ms',
}: {
  title: string
  centerMain: string
  centerSub?: string
  pct: number
  fill: string
  rows: KpiRow[]
  delay?: string
}) {
  const safe = Math.min(Math.max(pct, 0), 100)
  return (
    <div
      className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4 animate-slide-up"
      style={{ animationDelay: delay }}
    >
      {/* 도넛 */}
      <div className="relative w-24 h-24 shrink-0">
        <PieChart width={96} height={96}>
          <Pie
            data={[{ v: safe }, { v: 100 - safe }]}
            dataKey="v" cx={47} cy={47}
            innerRadius={31} outerRadius={45}
            startAngle={90} endAngle={-270} stroke="none"
          >
            <Cell fill={fill} />
            <Cell fill="#f0f0f0" />
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[14px] font-bold text-gray-800 leading-none">{centerMain}</span>
          {centerSub && <span className="text-[10px] text-gray-400 mt-0.5">{centerSub}</span>}
        </div>
      </div>

      {/* 수치 */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-400 font-semibold mb-2 uppercase tracking-wide">{title}</p>
        {rows.map(({ label, value }) => (
          <div key={label} className="flex justify-between items-center mb-1.5 last:mb-0">
            <span className="text-[12px] text-gray-500">{label}</span>
            <span className="text-[13px] font-semibold text-gray-700">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── 필터 상태 ───────────────────────────────────────────────────── */
interface Filters { start_date: string; end_date: string; shift_type: string; owner: string }
const INIT: Filters = { start_date: '', end_date: '', shift_type: '', owner: '' }

const selectCls = 'h-7 border border-gray-300 rounded px-2 text-[12px] text-gray-700 outline-none focus:border-letusBlue bg-white transition-colors cursor-pointer'
const inputCls  = 'h-7 border border-gray-300 rounded px-2 text-[12px] text-gray-700 outline-none focus:border-letusBlue bg-white transition-colors'

/* ── 메인 ────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { user } = useAuth()

  const [workers, setWorkers]           = useState<WorkerSummary[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [filterOpen, setFilterOpen]     = useState(true)
  const [filters, setFilters]           = useState<Filters>(INIT)
  const [selectedRow, setSelectedRow]   = useState<string | null>(null)

  const filtersRef = useRef(filters)
  filtersRef.current = filters

  const doLoad = async (f: Filters) => {
    setLoading(true); setError('')
    try {
      const p: Record<string, string> = {}
      if (f.start_date) p.start_date = f.start_date
      if (f.end_date)   p.end_date   = f.end_date
      if (f.shift_type) p.shift_type = f.shift_type
      setWorkers(await api.workers(p))
    } catch {
      setError('API 서버에 연결할 수 없습니다. FastAPI(8000)를 먼저 실행해주세요.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { doLoad(INIT) }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch  = () => doLoad(filtersRef.current)
  const handleRefresh = () => doLoad(filtersRef.current)

  const set = (key: keyof Filters) => (e: ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    setFilters(prev => ({ ...prev, [key]: e.target.value }))

  /* 집계 */
  const shown      = filters.owner ? workers.filter(w => w.화주사 === filters.owner) : workers
  const totalStd   = shown.reduce((s, w) => s + w.표준시간_min, 0)
  const totalReal  = shown.reduce((s, w) => s + w.실적시간_min, 0)
  const totalPick  = shown.reduce((s, w) => s + w.피킹건수, 0)
  const eff        = totalReal > 0 ? totalStd / totalReal : 0
  const aboveCnt   = shown.filter(w => w.가동률 >= 1).length
  const belowCnt   = shown.filter(w => w.가동률 < 1).length
  const iloomPick  = workers.filter(w => w.화주사 === '일룸').reduce((s, w) => s + w.피킹건수, 0)
  const fursisPick = workers.filter(w => w.화주사 === '퍼시스').reduce((s, w) => s + w.피킹건수, 0)

  const barData = [...shown]
    .sort((a, b) => b.가동률 - a.가동률)
    .map(w => ({ name: w.작업자, pct: parseFloat((w.가동률 * 100).toFixed(1)), ratio: w.가동률 }))

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50 animate-fade-in">

      {/* ════ 상단 헤더 ════ */}
      <header className="bg-white border-b border-gray-200 h-11 px-6 flex items-center justify-between sticky top-0 z-30 shrink-0">
        {/* 브레드크럼 */}
        <nav className="flex items-center gap-1.5 text-[12px] text-gray-400">
          <span>홈</span>
          <span className="text-gray-300">/</span>
          <span>피킹관리</span>
          <span className="text-gray-300">/</span>
          <span className="text-gray-700 font-medium">피킹 대시보드</span>
        </nav>
        {/* 우측 */}
        <div className="flex items-center gap-3.5">
          <span className="text-[12px] text-gray-500">{user?.username}</span>
          <Clock />
          <button
            onClick={handleRefresh}
            className="px-3 py-1 text-[12px] text-gray-500 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            ↻ 새로고침
          </button>
        </div>
      </header>

      {/* ════ 스크롤 영역 ════ */}
      <div className="flex-1 overflow-auto px-6 py-4">

        {/* 페이지 제목 */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-letusOrange text-base">★</span>
          <h1 className="text-[16px] font-bold text-gray-800">피킹 대시보드</h1>
          <span className="text-[12px] text-gray-400 ml-1">양지1센터 피킹 생산성 현황</span>
        </div>

        {/* ── 필터바 ── */}
        <div className="bg-white rounded-lg border border-gray-200 mb-4 overflow-hidden">
          <button
            onClick={() => setFilterOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="text-[13px] font-semibold text-gray-700">검색조건</span>
            <span className="text-[11px] text-gray-400">{filterOpen ? '▲ 접기' : '▼ 펼치기'}</span>
          </button>

          {filterOpen && (
            <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-1.5 text-[12px] text-gray-500">
                창고
                <select disabled className={`${selectCls} text-gray-400 bg-gray-50`}>
                  <option>양지1센터</option>
                </select>
              </label>

              <label className="flex items-center gap-1.5 text-[12px] text-gray-500">
                화주사
                <select value={filters.owner} onChange={set('owner')} className={selectCls}>
                  <option value="">전체</option>
                  <option value="일룸">일룸</option>
                  <option value="퍼시스">퍼시스</option>
                </select>
              </label>

              <label className="flex items-center gap-1.5 text-[12px] text-gray-500">
                시작일
                <input type="date" value={filters.start_date} onChange={set('start_date')} className={inputCls} />
              </label>

              <label className="flex items-center gap-1.5 text-[12px] text-gray-500">
                종료일
                <input type="date" value={filters.end_date} onChange={set('end_date')} className={inputCls} />
              </label>

              <label className="flex items-center gap-1.5 text-[12px] text-gray-500">
                주야간
                <select value={filters.shift_type} onChange={set('shift_type')} className={selectCls}>
                  <option value="">전체</option>
                  <option value="주간">주간</option>
                  <option value="야간">야간</option>
                </select>
              </label>

              <button
                onClick={handleSearch}
                className="ml-auto px-5 py-1.5 bg-letusOrange hover:bg-letusOrange/90 text-white text-[13px] font-semibold rounded transition-colors"
              >
                조회하기
              </button>
            </div>
          )}
        </div>

        {/* 에러 */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-600">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 text-[13px] text-gray-400">
            데이터를 불러오는 중…
          </div>
        ) : (
          <>
            {/* ════ KPI 도넛 3개 ════ */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <DonutKpi
                title="전체 가동률"
                centerMain={fmt.pct(eff)}
                centerSub="효율"
                pct={eff * 100}
                fill={effColor(eff)}
                delay="0ms"
                rows={[
                  { label: '완료 (달성)', value: `${aboveCnt}명` },
                  { label: '잔여 (미달)', value: `${belowCnt}명` },
                  { label: '합계',        value: `${shown.length}명` },
                ]}
              />
              <DonutKpi
                title="표준시간"
                centerMain={fmt.h(totalStd)}
                centerSub="std"
                pct={totalReal > 0 ? Math.min((totalStd / totalReal) * 100, 100) : 0}
                fill="#FF6B35"
                delay="60ms"
                rows={[
                  { label: '완료', value: fmt.h(totalStd) },
                  { label: '잔여', value: fmt.h(Math.max(0, totalReal - totalStd)) },
                  { label: '합계', value: fmt.h(totalReal) },
                ]}
              />
              <DonutKpi
                title="피킹건수"
                centerMain={fmt.n(totalPick)}
                centerSub="건"
                pct={totalPick > 0 ? (iloomPick / totalPick) * 100 : 0}
                fill="#2563eb"
                delay="120ms"
                rows={[
                  { label: '일룸',   value: fmt.n(iloomPick) },
                  { label: '퍼시스', value: fmt.n(fursisPick) },
                  { label: '합계',   value: fmt.n(totalPick) },
                ]}
              />
            </div>

            {/* ════ 작업자별 가동률 수평 바 차트 ════ */}
            <div className="bg-white rounded-lg border border-gray-200 px-5 py-4 mb-4 animate-slide-up">
              <div className="flex items-baseline gap-2 mb-3">
                <h2 className="text-[14px] font-bold text-gray-800">작업자별 가동률</h2>
                <span className="text-[12px] text-gray-400">기준선 100% 대비</span>
              </div>

              <ResponsiveContainer width="100%" height={Math.max(160, barData.length * 34)}>
                <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 54, left: 70, bottom: 0 }}>
                  <XAxis type="number" domain={[0, 150]} hide />
                  <YAxis type="category" dataKey="name" width={68}
                    tick={{ fontSize: 12, fill: '#555' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                    formatter={(v: unknown) => [`${(v as number).toFixed(1)}%`, '가동률']}
                    contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6 }}
                  />
                  <ReferenceLine x={100} stroke="#d1d5db" strokeDasharray="4 2" />
                  <Bar dataKey="pct" radius={[0, 3, 3, 0]} maxBarSize={18}>
                    {barData.map((d, i) => <Cell key={i} fill={effColor(d.ratio)} />)}
                    <LabelList
                      dataKey="pct" position="right"
                      formatter={(v: unknown) => `${(v as number).toFixed(1)}%`}
                      style={{ fontSize: 11, fill: '#6b7280' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* 범례 */}
              <div className="flex gap-5 pt-3 mt-2 border-t border-gray-100">
                {([['#52C41A', '≥100% 달성'], ['#FF6B35', '80~99%'], ['#FF4444', '<80%']] as [string, string][]).map(([c, l]) => (
                  <div key={c} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
                    <span className="text-[11px] text-gray-400">{l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ════ 상세 테이블 ════ */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden animate-slide-up">
              {/* 테이블 헤더 */}
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                <h2 className="text-[14px] font-bold text-gray-800">작업자별 상세 집계</h2>
                <span className="text-[12px] text-gray-400">
                  {shown.length}명 · {fmt.n(totalPick)}건
                  {selectedRow && <span className="ml-2 text-letusBlue">— {selectedRow} 선택됨</span>}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50">
                      {([
                        ['작업자',     'text-left'],
                        ['화주사',     'text-center'],
                        ['피킹건수',   'text-right'],
                        ['표준시간(h)', 'text-right'],
                        ['실적시간(h)', 'text-right'],
                        ['가동률',     'text-right'],
                        ['상태',       'text-center'],
                      ] as [string, string][]).map(([h, align]) => (
                        <th
                          key={h}
                          className={`p-4 ${align} text-[12px] font-semibold text-gray-500 whitespace-nowrap border-b border-gray-200`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700">
                    {shown.map(w => (
                      <tr
                        key={`${w.작업자}-${w.화주사}`}
                        onClick={() => setSelectedRow(s => s === w.작업자 ? null : w.작업자)}
                        className={`transition-colors cursor-pointer ${
                          selectedRow === w.작업자 ? 'bg-blue-50' : 'hover:bg-blue-50/30'
                        }`}
                      >
                        <td className="p-4 font-medium text-gray-800">{w.작업자}</td>
                        <td className="p-4 text-center"><OwnerBadge owner={w.화주사} /></td>
                        <td className="p-4 text-right tabular-nums">{fmt.n(w.피킹건수)}</td>
                        <td className="p-4 text-right tabular-nums">{fmt.h(w.표준시간_min)}</td>
                        <td className="p-4 text-right tabular-nums">{fmt.h(w.실적시간_min)}</td>
                        <td className="p-4 text-right tabular-nums font-bold" style={{ color: effColor(w.가동률) }}>
                          {fmt.pct(w.가동률)}
                        </td>
                        <td className="p-4 text-center"><EffBadge ratio={w.가동률} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
