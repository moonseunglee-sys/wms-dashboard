import { useState, useRef, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import type { Period } from '../../lib/types'
import {
  today, yesterday, recentDataWeek, recentDataMonth,
} from '../../lib/weekUtils'
import type { Granularity } from '../../lib/weekUtils'
import type { Metric } from '../tabs/Overview'

export interface PickingCtx {
  period: Period
  metric: Metric
  granularity: Granularity
}

const PAGE_LABELS: Record<string, string> = {
  '/picking/overview':     '종합현황',
  '/picking/center':       '센터별 분석',
  '/picking/brand':        '브랜드별 분석',
  '/picking/productivity': '생산성 집계',
  '/picking/worker':       '작업자별 상세',
}

type Shortcut = '전일' | '이번주' | '이번달' | '전체기간'

function makeShortcutPeriod(s: Shortcut): Period {
  if (s === '전일')   return { type: 'custom', start: yesterday(), end: yesterday() }
  if (s === '이번주') return recentDataWeek()
  if (s === '이번달') return recentDataMonth()
  return { type: 'all' }
}

/** 집계 단위 변경 시 기본 기간 자동 설정 */
function defaultPeriodFor(g: Granularity): { period: Period; shortcut: Shortcut } {
  if (g === 'day')   return { period: makeShortcutPeriod('전일'),   shortcut: '전일' }
  if (g === 'week')  return { period: makeShortcutPeriod('이번주'), shortcut: '이번주' }
  return               { period: makeShortcutPeriod('이번달'), shortcut: '이번달' }
}

function CalendarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8"  y1="2" x2="8"  y2="6" />
      <line x1="3"  y1="10" x2="21" y2="10" />
    </svg>
  )
}

export default function PickingLayout() {
  const init = defaultPeriodFor('day')
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [shortcut, setShortcut]       = useState<Shortcut | null>(init.shortcut)
  const [period, setPeriod]           = useState<Period>(init.period)
  const [metric, setMetric]           = useState<Metric>('amount')

  // 달력 팝오버
  const [showPicker, setShowPicker]   = useState(false)
  const [pickerStart, setPickerStart] = useState(today())
  const [pickerEnd, setPickerEnd]     = useState(today())
  const pickerRef = useRef<HTMLDivElement>(null)

  const { pathname } = useLocation()
  const pageLabel = PAGE_LABELS[pathname] ?? '피킹생산성'
  const ctx: PickingCtx = { period, metric, granularity }

  function handleGranularity(g: Granularity) {
    const def = defaultPeriodFor(g)
    setGranularity(g)
    setPeriod(def.period)
    setShortcut(def.shortcut)
    setShowPicker(false)
  }

  function handleShortcut(s: Shortcut) {
    setShortcut(s)
    setPeriod(makeShortcutPeriod(s))
    setShowPicker(false)
  }

  function applyCustomRange() {
    if (!pickerStart || !pickerEnd) return
    const start = pickerStart <= pickerEnd ? pickerStart : pickerEnd
    const end   = pickerStart <= pickerEnd ? pickerEnd   : pickerStart
    setPeriod({ type: 'custom', start, end })
    setShortcut(null)
    setShowPicker(false)
  }

  useEffect(() => {
    if (!showPicker) return
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
        setShowPicker(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showPicker])

  const isCustom = period.type === 'custom'
  const customLabel = isCustom
    ? `${(period as { start: string; end: string }).start.slice(5)}~${(period as { start: string; end: string }).end.slice(5)}`
    : null

  const GRAN_OPTS: { key: Granularity; label: string }[] = [
    { key: 'day',   label: '일별' },
    { key: 'week',  label: '주간' },
    { key: 'month', label: '월간' },
  ]
  const SHORTCUTS: Shortcut[] = ['전일', '이번주', '이번달', '전체기간']

  return (
    <div className="flex flex-col">

      {/* ── 서브 헤더 ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center px-6 gap-3 h-11">

          <span className="text-sm font-semibold text-gray-700 shrink-0">{pageLabel}</span>
          <span className="text-gray-200 select-none">|</span>
          <span className="text-xs text-gray-400 shrink-0">피킹생산성</span>

          <div className="flex-1" />

          {/* 집계 단위 */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {GRAN_OPTS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleGranularity(key)}
                className={[
                  'px-3 py-1 rounded-md text-xs font-medium transition-all',
                  granularity === key
                    ? 'bg-white text-letusBlue shadow-sm'
                    : 'text-gray-400 hover:text-gray-600',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 기간 단축키 + 달력 */}
          <div className="flex items-center gap-1">
            {SHORTCUTS.map(s => (
              <button
                key={s}
                onClick={() => handleShortcut(s)}
                className={[
                  'px-3 py-1 rounded text-xs font-medium transition-all',
                  shortcut === s
                    ? 'bg-letusBlue text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                {s}
              </button>
            ))}

            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => setShowPicker(v => !v)}
                className={[
                  'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all',
                  (showPicker || (isCustom && !shortcut))
                    ? 'bg-letusBlue text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50',
                ].join(' ')}
                title="기간 직접 선택"
              >
                <CalendarIcon />
                {customLabel && !shortcut && <span>{customLabel}</span>}
              </button>

              {showPicker && (
                <div className="absolute right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-gray-100 p-4 z-50 w-[220px]">
                  <p className="text-[11px] font-semibold text-gray-600 mb-3">기간 직접 선택</p>
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[10px] text-gray-400 block mb-1">시작일</label>
                      <input
                        type="date"
                        value={pickerStart}
                        onChange={e => setPickerStart(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-letusBlue"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 block mb-1">종료일</label>
                      <input
                        type="date"
                        value={pickerEnd}
                        onChange={e => setPickerEnd(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-letusBlue"
                      />
                    </div>
                  </div>
                  <button
                    onClick={applyCustomRange}
                    disabled={!pickerStart || !pickerEnd}
                    className="mt-3 w-full bg-letusBlue hover:bg-blue-600 text-white text-xs font-semibold py-1.5 rounded-lg disabled:opacity-40 transition-colors"
                  >
                    적용
                  </button>
                </div>
              )}
            </div>
          </div>

          <span className="text-gray-200 select-none">|</span>

          {/* 단위 표시 */}
          {metric === 'amount' && (
            <span className="text-[10px] text-gray-400 border border-gray-200 px-2 py-0.5 rounded shrink-0">
              단위: 백만원
            </span>
          )}

          {/* 지표 토글 */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-md p-0.5">
            {(['amount', 'box'] as Metric[]).map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={[
                  'px-3 py-1 rounded text-xs font-medium transition-all',
                  metric === m
                    ? 'bg-white text-letusBlue shadow-sm'
                    : 'text-gray-400 hover:text-gray-600',
                ].join(' ')}
              >
                {m === 'amount' ? '금액' : '박스수'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 콘텐츠 ── */}
      <div className="p-5 flex-1">
        <Outlet context={ctx} />
      </div>
    </div>
  )
}
