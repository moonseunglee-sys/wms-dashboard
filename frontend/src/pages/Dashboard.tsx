import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent } from 'react'
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine,
  LabelList, ResponsiveContainer,
} from 'recharts'
import { api } from '../api/client'
import type { WorkerSummary } from '../api/client'
import { useAuth } from '../hooks/useAuth'

// ── 색상 ──────────────────────────────────────────────────────────
const C = {
  orange: '#FF6B35',
  red:    '#FF4444',
  green:  '#52C41A',
  blue:   '#1890FF',
  border: '#e8e8e8',
  bg:     '#F5F5F5',
  text:   '#333',
  sub:    '#999',
  head:   '#666',
}

const effColor = (r: number) => r >= 1 ? C.green : r >= 0.8 ? C.orange : C.red

// ── 포맷 ──────────────────────────────────────────────────────────
const fmt = {
  pct: (v: number) => `${(v * 100).toFixed(1)}%`,
  h:   (min: number) => `${(min / 60).toFixed(1)}h`,
  n:   (v: number) => v.toLocaleString('ko-KR'),
}

// ── 공용 카드 스타일 ───────────────────────────────────────────────
const card: CSSProperties = {
  background: '#fff',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
}

// ── Clock ──────────────────────────────────────────────────────────
function Clock() {
  const [t, setT] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{ fontSize: 12, color: C.head }}>
      {t.toLocaleString('ko-KR', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })}
    </span>
  )
}

// ── DonutKpi ───────────────────────────────────────────────────────
interface KpiRow { label: string; value: string }

function DonutKpi({
  title, centerMain, centerSub, pct, fill, rows,
}: {
  title: string
  centerMain: string
  centerSub?: string
  pct: number         // 0–100
  fill: string
  rows: KpiRow[]
}) {
  const safe = Math.min(Math.max(pct, 0), 100)
  const data = [{ v: safe }, { v: 100 - safe }]
  return (
    <div style={{ ...card, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      {/* 도넛 */}
      <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
        <PieChart width={96} height={96}>
          <Pie
            data={data} dataKey="v"
            cx={47} cy={47}
            innerRadius={31} outerRadius={45}
            startAngle={90} endAngle={-270}
            stroke="none"
          >
            <Cell fill={fill} />
            <Cell fill="#f0f0f0" />
          </Pie>
        </PieChart>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          textAlign: 'center', pointerEvents: 'none', lineHeight: 1.25,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#222' }}>{centerMain}</div>
          {centerSub && <div style={{ fontSize: 10, color: C.sub, marginTop: 1 }}>{centerSub}</div>}
        </div>
      </div>

      {/* 우측 수치 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, fontWeight: 600 }}>{title}</div>
        {rows.map(({ label, value }) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 5,
          }}>
            <span style={{ fontSize: 12, color: C.head }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 필터 상태 ──────────────────────────────────────────────────────
interface Filters {
  start_date: string
  end_date:   string
  shift_type: string
  owner:      string   // 클라이언트 필터
}

const INPUT: CSSProperties = {
  border: `1px solid #d9d9d9`, borderRadius: 4,
  padding: '5px 8px', fontSize: 12, color: C.text,
  outline: 'none', background: '#fff', height: 28,
}
const SELECT: CSSProperties = { ...INPUT, cursor: 'pointer' }

// ── 메인 ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth()

  const [workers, setWorkers]       = useState<WorkerSummary[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [filterOpen, setFilterOpen] = useState(true)
  const [filters, setFilters]       = useState<Filters>({
    start_date: '', end_date: '', shift_type: '', owner: '',
  })

  // 최신 필터를 ref에 동기화 (클릭 핸들러에서 읽기)
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  const doLoad = async (f: Filters) => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string> = {}
      if (f.start_date) params.start_date = f.start_date
      if (f.end_date)   params.end_date   = f.end_date
      if (f.shift_type) params.shift_type = f.shift_type
      const w = await api.workers(params)
      setWorkers(w)
    } catch {
      setError('API 서버에 연결할 수 없습니다. FastAPI(8000)가 실행 중인지 확인하세요.')
    } finally {
      setLoading(false)
    }
  }

  // 마운트 시 최초 조회
  useEffect(() => { doLoad(filters) }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => doLoad(filtersRef.current)
  const set = (key: keyof Filters) => (e: ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    setFilters(prev => ({ ...prev, [key]: e.target.value }))

  // 클라이언트 화주사 필터
  const displayed = filters.owner
    ? workers.filter(w => w.화주사 === filters.owner)
    : workers

  // 집계
  const totalStd  = displayed.reduce((s, w) => s + w.표준시간_min, 0)
  const totalReal = displayed.reduce((s, w) => s + w.실적시간_min, 0)
  const totalPick = displayed.reduce((s, w) => s + w.피킹건수, 0)
  const eff       = totalReal > 0 ? totalStd / totalReal : 0
  const aboveCnt  = displayed.filter(w => w.가동률 >= 1).length
  const belowCnt  = displayed.filter(w => w.가동률 < 1).length

  const iloomPick  = workers.filter(w => w.화주사 === '일룸').reduce((s, w) => s + w.피킹건수, 0)
  const fursisPick = workers.filter(w => w.화주사 === '퍼시스').reduce((s, w) => s + w.피킹건수, 0)

  // 바 차트 데이터 (가동률 내림차순)
  const barData = [...displayed]
    .sort((a, b) => b.가동률 - a.가동률)
    .map(w => ({
      name:  w.작업자,
      owner: w.화주사,
      pct:   parseFloat((w.가동률 * 100).toFixed(1)),
      ratio: w.가동률,
    }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100vh', background: C.bg }}>

      {/* ════ 상단 헤더 ════ */}
      <div style={{
        background: '#fff', borderBottom: `1px solid ${C.border}`,
        padding: '0 24px', height: 44, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 30,
      }}>
        {/* 브레드크럼 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.sub }}>
          <span>홈</span>
          <span style={{ color: '#ccc' }}>/</span>
          <span>피킹관리</span>
          <span style={{ color: '#ccc' }}>/</span>
          <span style={{ color: C.text }}>피킹 대시보드</span>
        </div>
        {/* 우측 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 12, color: C.head }}>{user?.username}</span>
          <Clock />
          <button
            onClick={handleSearch}
            style={{
              border: `1px solid #d9d9d9`, borderRadius: 4,
              padding: '3px 10px', fontSize: 12,
              cursor: 'pointer', background: '#fff', color: '#555',
            }}
          >
            ↻ 새로고침
          </button>
        </div>
      </div>

      {/* ════ 스크롤 영역 ════ */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 24px 28px' }}>

        {/* 페이지 제목 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ color: C.orange, fontSize: 15 }}>★</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#222' }}>피킹 대시보드</span>
          <span style={{ fontSize: 12, color: C.sub }}>양지1센터 피킹 생산성 현황</span>
        </div>

        {/* ── 필터바 ── */}
        <div style={{ ...card, marginBottom: 14, overflow: 'hidden' }}>
          {/* 헤더 행 */}
          <div
            onClick={() => setFilterOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 16px', cursor: 'pointer', userSelect: 'none',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>검색조건</span>
            <span style={{ fontSize: 11, color: C.sub }}>{filterOpen ? '▲ 접기' : '▼ 펼치기'}</span>
          </div>

          {filterOpen && (
            <div style={{
              borderTop: `1px solid #f0f0f0`, padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            }}>
              {/* 창고 (비활성) */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.head }}>
                창고
                <select disabled style={{ ...SELECT, color: C.sub, background: C.bg }}>
                  <option>양지1센터</option>
                </select>
              </label>

              {/* 화주사 */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.head }}>
                화주사
                <select value={filters.owner} onChange={set('owner')} style={SELECT}>
                  <option value="">전체</option>
                  <option value="일룸">일룸</option>
                  <option value="퍼시스">퍼시스</option>
                </select>
              </label>

              {/* 시작일 */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.head }}>
                시작일
                <input type="date" value={filters.start_date} onChange={set('start_date')} style={INPUT} />
              </label>

              {/* 종료일 */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.head }}>
                종료일
                <input type="date" value={filters.end_date} onChange={set('end_date')} style={INPUT} />
              </label>

              {/* 주야간 */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.head }}>
                주야간
                <select value={filters.shift_type} onChange={set('shift_type')} style={SELECT}>
                  <option value="">전체</option>
                  <option value="주간">주간</option>
                  <option value="야간">야간</option>
                </select>
              </label>

              {/* 조회 버튼 */}
              <button
                onClick={handleSearch}
                style={{
                  marginLeft: 'auto', background: C.orange, color: '#fff',
                  border: 'none', borderRadius: 4, padding: '6px 22px',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                조회하기
              </button>
            </div>
          )}
        </div>

        {/* 에러 */}
        {error && (
          <div style={{
            background: '#fff2f0', border: '1px solid #ffccc7',
            borderRadius: 8, padding: '9px 14px', fontSize: 13,
            color: '#ff4d4f', marginBottom: 14,
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: C.sub, fontSize: 14 }}>
            데이터를 불러오는 중...
          </div>
        ) : (
          <>
            {/* ════ KPI 도넛 3개 ════ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 14 }}>
              {/* 전체 가동률 */}
              <DonutKpi
                title="전체 가동률"
                centerMain={fmt.pct(eff)}
                centerSub="효율"
                pct={eff * 100}
                fill={effColor(eff)}
                rows={[
                  { label: '완료 (달성)', value: `${aboveCnt}명` },
                  { label: '잔여 (미달)', value: `${belowCnt}명` },
                  { label: '합계',        value: `${displayed.length}명` },
                ]}
              />

              {/* 표준시간 */}
              <DonutKpi
                title="표준시간"
                centerMain={fmt.h(totalStd)}
                centerSub="std"
                pct={totalReal > 0 ? Math.min((totalStd / totalReal) * 100, 100) : 0}
                fill={C.orange}
                rows={[
                  { label: '완료', value: fmt.h(totalStd) },
                  { label: '잔여', value: fmt.h(Math.max(0, totalReal - totalStd)) },
                  { label: '합계', value: fmt.h(totalReal) },
                ]}
              />

              {/* 피킹건수 */}
              <DonutKpi
                title="피킹건수"
                centerMain={fmt.n(totalPick)}
                centerSub="건"
                pct={totalPick > 0 ? (iloomPick / totalPick) * 100 : 0}
                fill={C.blue}
                rows={[
                  { label: '일룸',   value: fmt.n(iloomPick) },
                  { label: '퍼시스', value: fmt.n(fursisPick) },
                  { label: '합계',   value: fmt.n(totalPick) },
                ]}
              />
            </div>

            {/* ════ 작업자별 가동률 (수평 바 차트) ════ */}
            <div style={{ ...card, padding: '16px 20px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#222' }}>작업자별 가동률</span>
                <span style={{ fontSize: 11, color: C.sub }}>기준선 100% 대비</span>
              </div>

              <ResponsiveContainer width="100%" height={Math.max(180, barData.length * 34)}>
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ top: 0, right: 58, left: 72, bottom: 0 }}
                >
                  <XAxis type="number" domain={[0, 150]} hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={70}
                    tick={{ fontSize: 12, fill: '#555' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                    formatter={(val: unknown) => [`${(val as number).toFixed(1)}%`, '가동률']}
                    contentStyle={{ fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 4 }}
                  />
                  <ReferenceLine x={100} stroke="#ccc" strokeDasharray="4 2" />
                  <Bar dataKey="pct" radius={[0, 3, 3, 0]} maxBarSize={20}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={effColor(entry.ratio)} />
                    ))}
                    <LabelList
                      dataKey="pct"
                      position="right"
                      formatter={(v: unknown) => `${(v as number).toFixed(1)}%`}
                      style={{ fontSize: 11, fill: '#666' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* 범례 */}
              <div style={{
                display: 'flex', gap: 20, marginTop: 10,
                paddingTop: 10, borderTop: '1px solid #f0f0f0',
              }}>
                {([
                  [C.green,  '≥100% 달성'],
                  [C.orange, '80~99%'],
                  [C.red,    '<80%'],
                ] as [string, string][]).map(([clr, lbl]) => (
                  <div key={clr} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: clr }} />
                    <span style={{ fontSize: 11, color: C.sub }}>{lbl}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ════ 상세 테이블 ════ */}
            <div style={{ ...card, overflow: 'hidden' }}>
              {/* 테이블 헤더 */}
              <div style={{
                padding: '12px 16px', borderBottom: '1px solid #f0f0f0',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#222' }}>작업자별 상세 집계</span>
                <span style={{ fontSize: 12, color: C.sub }}>
                  {displayed.length}명 · {fmt.n(totalPick)}건
                </span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: C.bg }}>
                      {([
                        ['작업자',     'left'],
                        ['화주사',     'left'],
                        ['피킹건수',   'right'],
                        ['표준시간(h)', 'right'],
                        ['실적시간(h)', 'right'],
                        ['가동률',     'right'],
                      ] as [string, CSSProperties['textAlign']][]).map(([h, align]) => (
                        <th key={h} style={{
                          padding: '9px 12px', fontSize: 12, color: C.head,
                          fontWeight: 600, textAlign: align,
                          borderBottom: `1px solid ${C.border}`,
                          whiteSpace: 'nowrap',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map((w, i) => (
                      <tr
                        key={`${w.작업자}-${w.화주사}-${i}`}
                        style={{
                          height: 40,
                          borderBottom: '1px solid #f0f0f0',
                          background: i % 2 === 0 ? '#fff' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '0 12px', fontSize: 13, color: C.text, fontWeight: 500 }}>
                          {w.작업자}
                        </td>
                        <td style={{ padding: '0 12px' }}>
                          <span style={{
                            fontSize: 11, padding: '2px 7px', borderRadius: 3,
                            background: w.화주사 === '일룸' ? '#e6f4ff' : '#f6ffed',
                            color:      w.화주사 === '일룸' ? '#1677ff' : '#389e0d',
                            fontWeight: 500,
                          }}>
                            {w.화주사}
                          </span>
                        </td>
                        <td style={{ padding: '0 12px', fontSize: 13, color: C.text, textAlign: 'right' }}>
                          {fmt.n(w.피킹건수)}
                        </td>
                        <td style={{ padding: '0 12px', fontSize: 13, color: C.text, textAlign: 'right' }}>
                          {fmt.h(w.표준시간_min)}
                        </td>
                        <td style={{ padding: '0 12px', fontSize: 13, color: C.text, textAlign: 'right' }}>
                          {fmt.h(w.실적시간_min)}
                        </td>
                        <td style={{ padding: '0 12px', textAlign: 'right' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: effColor(w.가동률) }}>
                            {fmt.pct(w.가동률)}
                          </span>
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
    </div>
  )
}
