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
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>

      {/* LL 스타일 상단 바 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">

        {/* 상단 row: 제목 + 컨트롤 */}
        <div className="flex items-center h-14 px-6 gap-4">

          {/* 왼쪽: 페이지 타이틀 */}
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 text-gray-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            <h1 className="text-[16px] font-bold text-gray-800 whitespace-nowrap">피킹 생산성 대시보드</h1>
            <span className="text-[11px] text-gray-400 ml-1 hidden sm:block">양지센터 · {today}</span>
          </div>

          <div className="flex-1" />

          {/* 오른쪽: 기간 + 지표 */}
          <div className="flex items-center gap-3 shrink-0">

            {/* 기간 선택 */}
            <div className="flex items-center gap-1">
              {PERIOD_OPTS.map(({ label, make }) => (
                <button
                  key={label}
                  onClick={() => handlePeriod(label, make)}
                  className={[
                    'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all',
                    periodLabel === label
                      ? 'bg-letusOrange text-white border-letusOrange shadow-sm'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-letusOrange hover:text-letusOrange',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 지표 토글 */}
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-1">
              {(['amount', 'box'] as Metric[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={[
                    'px-3 py-1.5 rounded text-[12px] font-medium transition-all',
                    metric === m
                      ? 'bg-white text-letusOrange shadow-sm'
                      : 'text-gray-400 hover:text-gray-600',
                  ].join(' ')}
                >
                  {m === 'amount' ? '💰 금액' : '📦 박스수'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 탭 바 */}
        <div className="flex gap-0 px-6 border-t border-gray-50">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                'px-5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
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
      <div className="p-6">
        {tab === 'overview'     && <Overview period={period} metric={metric} />}
        {tab === 'brand'        && <BrandDetail period={period} metric={metric} />}
        {tab === 'productivity' && <Productivity period={period} metric={metric} />}
        {tab === 'worker'       && <WorkerDetail period={period} metric={metric} />}
      </div>
    </div>
  )
}
