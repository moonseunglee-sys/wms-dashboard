import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import type { Period } from '../../lib/types'
import { thisWeek, thisMonth } from '../../lib/weekUtils'
import type { Metric } from '../tabs/Overview'

export interface PickingCtx {
  period: Period
  metric: Metric
}

const PERIOD_OPTS: { label: string; make: () => Period }[] = [
  { label: '이번주',   make: thisWeek },
  { label: '이번달',   make: thisMonth },
  { label: '전체기간', make: (): Period => ({ type: 'all' }) },
]

const PAGE_LABELS: Record<string, string> = {
  '/picking/overview':     '종합현황',
  '/picking/brand':        '브랜드별 상세',
  '/picking/productivity': '생산성 분석',
  '/picking/worker':       '작업자별 상세',
}

export default function PickingLayout() {
  const [periodLabel, setPeriodLabel] = useState('이번달')
  const [period, setPeriod]           = useState<Period>(thisMonth())
  const [metric, setMetric]           = useState<Metric>('amount')
  const { pathname } = useLocation()

  function handlePeriod(label: string, make: () => Period) {
    setPeriodLabel(label)
    setPeriod(make())
  }

  const pageLabel = PAGE_LABELS[pathname] ?? '피킹생산성'
  const ctx: PickingCtx = { period, metric }

  return (
    <div className="flex flex-col">

      {/* 서브 헤더 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center px-6 gap-3 h-11">
          <span className="text-sm font-semibold text-gray-700">{pageLabel}</span>
          <span className="text-gray-200 select-none">|</span>
          <span className="text-xs text-gray-400">피킹생산성</span>

          <div className="flex-1" />

          {/* 기간 선택 */}
          <div className="flex items-center gap-1">
            {PERIOD_OPTS.map(({ label, make }) => (
              <button
                key={label}
                onClick={() => handlePeriod(label, make)}
                className={[
                  'px-3 py-1 rounded text-xs font-medium transition-all',
                  periodLabel === label
                    ? 'bg-letusBlue text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 지표 토글 */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-md p-0.5">
            {(['amount', 'box'] as Metric[]).map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={[
                  'px-3 py-1 rounded text-[11.5px] font-medium transition-all',
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

      {/* 콘텐츠 */}
      <div className="p-5 flex-1">
        <Outlet context={ctx} />
      </div>
    </div>
  )
}
