import { useState } from 'react'
import type { Period } from '../lib/types'
import { thisWeek, thisMonth } from '../lib/weekUtils'
import Overview, { type Metric } from './tabs/Overview'
import BrandDetail from './tabs/BrandDetail'
import WorkerDetail from './tabs/WorkerDetail'
import Productivity from './tabs/Productivity'

type TabId = 'overview' | 'brand' | 'productivity' | 'worker'

const today = new Date().toLocaleDateString('ko-KR', {
  year: 'numeric', month: 'long', day: 'numeric',
})

const PERIOD_OPTS: { label: string; make: () => Period }[] = [
  { label: '이번주',   make: thisWeek },
  { label: '이번달',   make: thisMonth },
  { label: '전체기간', make: () => ({ type: 'all' }) },
]

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',     label: '종합현황'     },
  { id: 'brand',        label: '브랜드별 상세' },
  { id: 'productivity', label: '생산성 분석'  },
  { id: 'worker',       label: '작업자 상세'  },
]

export default function Dashboard() {
  const [periodLabel, setPeriodLabel] = useState('이번달')
  const [period, setPeriod]           = useState<Period>(thisMonth())
  const [metric, setMetric]           = useState<Metric>('amount')
  const [tab, setTab]                 = useState<TabId>('overview')

  function handlePeriod(label: string, make: () => Period) {
    setPeriodLabel(label)
    setPeriod(make())
  }

  return (
    <div className="min-h-screen flex flex-col">

      {/* 서브 헤더: 탭 + 컨트롤 */}
      <div className="bg-white border-b border-gray-100 sticky top-[52px] z-10 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">

        <div className="flex items-center px-6 gap-4 h-11">
          {/* 날짜 */}
          <span className="text-[11px] text-gray-400 hidden sm:block">양지센터 · {today}</span>

          <div className="flex-1" />

          {/* 기간 선택 */}
          <div className="flex items-center gap-1">
            {PERIOD_OPTS.map(({ label, make }) => (
              <button
                key={label}
                onClick={() => handlePeriod(label, make)}
                className={[
                  'px-3 py-1 rounded text-[11.5px] font-medium transition-all',
                  periodLabel === label
                    ? 'bg-letusOrange text-white shadow-sm'
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
                    ? 'bg-white text-letusOrange shadow-sm'
                    : 'text-gray-400 hover:text-gray-600',
                ].join(' ')}
              >
                {m === 'amount' ? '금액' : '박스수'}
              </button>
            ))}
          </div>
        </div>

        {/* 탭 바 */}
        <div className="flex px-6 border-t border-gray-50">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                'px-5 py-2 text-[12.5px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                tab === t.id
                  ? 'border-letusOrange text-letusOrange'
                  : 'border-transparent text-gray-400 hover:text-gray-600',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="p-5 flex-1">
        {tab === 'overview'     && <Overview period={period} metric={metric} />}
        {tab === 'brand'        && <BrandDetail period={period} metric={metric} />}
        {tab === 'productivity' && <Productivity period={period} metric={metric} />}
        {tab === 'worker'       && <WorkerDetail period={period} metric={metric} />}
      </div>
    </div>
  )
}
