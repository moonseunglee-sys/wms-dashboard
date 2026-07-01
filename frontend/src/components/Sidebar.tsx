import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

/* ── 아이콘 ──────────────────────────────────────────── */
const IcoSearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
)
const IcoStar = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)
const IcoChevron = ({ open }: { open: boolean }) => (
  <svg
    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
)
const IcoPicking = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)
const IcoIncoming = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 12H2" /><path d="M12 22V12" />
    <path d="M7 17l5 5 5-5" />
    <path d="M2 7l10-5 10 5" /><path d="M2 7v5" /><path d="M22 7v5" />
  </svg>
)
const IcoCbm = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
)
const IcoTerminal = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" /><path d="m7 8 3 3-3 3" /><line x1="13" y1="14" x2="17" y2="14" />
  </svg>
)

/* ── 메뉴 데이터 ─────────────────────────────────────── */
interface Leaf {
  kind: 'leaf'
  label: string
  to: string
}
interface Group {
  kind: 'group'
  label: string
  Icon: () => JSX.Element
  comingSoon?: boolean
  to?: string          // coming-soon 아이템의 링크 (선택)
  children: Leaf[]
}
interface Category {
  label: string
  items: Group[]
}

const MENU: Category[] = [
  {
    label: '생산성',
    items: [
      {
        kind: 'group', label: '피킹생산성', Icon: IcoPicking,
        children: [
          { kind: 'leaf', label: '종합현황',      to: '/picking/overview' },
          { kind: 'leaf', label: '브랜드별',       to: '/picking/brand' },
          { kind: 'leaf', label: '생산성',         to: '/picking/productivity' },
          { kind: 'leaf', label: '작업자별 상세',  to: '/picking/worker' },
          { kind: 'leaf', label: '센터별 분석',    to: '/picking/center' },
        ],
      },
      {
        kind: 'group', label: '입고생산성', Icon: IcoIncoming,
        comingSoon: true, to: '/incoming', children: [],
      },
    ],
  },
  {
    label: 'CBM관리',
    items: [
      {
        kind: 'group', label: 'CBM관리', Icon: IcoCbm,
        comingSoon: true, to: '/cbm', children: [],
      },
    ],
  },
  {
    label: '장비관리',
    items: [
      {
        kind: 'group', label: '단말기 관리', Icon: IcoTerminal,
        comingSoon: true, to: '/equipment/terminal', children: [],
      },
    ],
  },
]

/* 현재 경로가 속한 그룹 키 반환 */
function activeGroupKey(pathname: string): string | null {
  for (const cat of MENU) {
    for (const item of cat.items) {
      if (item.children.some(c => pathname.startsWith(c.to))) {
        return `${cat.label}::${item.label}`
      }
    }
  }
  return null
}

/* ── 컴포넌트 ─────────────────────────────────────────── */
export default function Sidebar() {
  const [search, setSearch] = useState('')
  const { pathname } = useLocation()

  const initKey = activeGroupKey(pathname)
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    initKey ? new Set([initKey]) : new Set(['생산성::피킹생산성'])
  )

  useEffect(() => {
    const key = activeGroupKey(pathname)
    if (key) setOpenGroups(prev => new Set([...prev, key]))
  }, [pathname])

  const toggle = (key: string) =>
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <aside className="w-[248px] min-w-[248px] bg-letusSidebar min-h-screen flex flex-col shrink-0">

      {/* 로고 */}
      <div className="px-5 py-[18px] border-b border-white/8">
        <p className="text-[15px] font-extrabold tracking-[0.10em]">
          <span className="text-white">LETUS </span>
          <span className="text-letusOrange">LOGIS</span>
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5 tracking-wide">WMS 생산성 관리</p>
      </div>

      {/* 메뉴 검색 */}
      <div className="px-3 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2 bg-white/6 rounded-md px-3 py-2">
          <span className="text-slate-500"><IcoSearch /></span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="메뉴 검색..."
            className="flex-1 bg-transparent text-[12px] text-slate-300 placeholder-slate-600 outline-none"
          />
        </div>
      </div>

      {/* 즐겨찾기 탭 */}
      <div className="flex border-b border-white/5 text-[11px]">
        <button className="flex-1 flex items-center justify-center gap-1.5 py-2 text-letusOrange border-b-2 border-letusOrange font-semibold">
          <IcoStar />
          즐겨찾기
        </button>
        <button className="flex-1 flex items-center justify-center py-2 text-slate-500 hover:text-slate-300 transition-colors">
          전체메뉴
        </button>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto py-1.5">
        {MENU.map(cat => {
          const visibleItems = cat.items.filter(item => {
            if (!search) return true
            if (item.label.toLowerCase().includes(search.toLowerCase())) return true
            return item.children.some(c => c.label.toLowerCase().includes(search.toLowerCase()))
          })
          if (visibleItems.length === 0) return null

          return (
            <div key={cat.label} className="mb-0.5">
              {/* 카테고리 헤더 */}
              <div className="px-4 pt-3 pb-1">
                <p className="text-[9.5px] text-slate-600 font-bold tracking-[0.14em] uppercase select-none">
                  {cat.label}
                </p>
              </div>

              {visibleItems.map(item => {
                const key = `${cat.label}::${item.label}`
                const isOpen = openGroups.has(key)
                const hasChildren = item.children.length > 0

                return (
                  <div key={item.label}>
                    {/* 그룹 행 */}
                    {item.comingSoon && item.to ? (
                      /* 구현예정 — NavLink로 이동 가능하되 흐리게 */
                      <NavLink
                        to={item.to}
                        className={({ isActive }) => [
                          'flex items-center gap-2.5 mx-2 px-3 py-2 rounded-md text-[12.5px] transition-all',
                          isActive ? 'bg-white/8 text-slate-300' : 'text-slate-600 hover:text-slate-400',
                        ].join(' ')}
                      >
                        <span className="opacity-60 shrink-0"><item.Icon /></span>
                        <span className="flex-1 text-left">{item.label}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/80 text-slate-500 font-medium shrink-0">예정</span>
                      </NavLink>
                    ) : (
                      /* 일반 그룹 — 클릭 시 펼침/접힘 */
                      <button
                        onClick={() => toggle(key)}
                        className="w-full flex items-center gap-2.5 mx-2 px-3 py-2.5 rounded-md text-[14px] font-medium text-slate-300 hover:text-white hover:bg-white/6 transition-all duration-150"
                        style={{ width: 'calc(100% - 1rem)' }}
                      >
                        <span className="opacity-70 shrink-0"><item.Icon /></span>
                        <span className="flex-1 text-left">{item.label}</span>
                        {hasChildren && <IcoChevron open={isOpen} />}
                      </button>
                    )}

                    {/* 리프 아이템 */}
                    {hasChildren && isOpen && (
                      <div className="mb-0.5">
                        {item.children
                          .filter(c => !search || c.label.toLowerCase().includes(search.toLowerCase()))
                          .map(child => (
                            <NavLink
                              key={child.to}
                              to={child.to}
                              className={({ isActive }) => [
                                'flex items-center gap-2.5 pl-[42px] pr-3 py-2 mx-2 rounded-md text-[13.5px] transition-all duration-150',
                                isActive
                                  ? 'bg-letusBlue text-white font-semibold'
                                  : 'text-slate-400 hover:text-white hover:bg-white/5',
                              ].join(' ')}
                            >
                              <span className="w-1 h-1 rounded-full bg-current opacity-50 shrink-0" />
                              {child.label}
                            </NavLink>
                          ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* 사용자 */}
      <div className="border-t border-white/8 px-3 py-3">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-md">
          <div className="w-7 h-7 rounded-full bg-letusOrange/80 flex items-center justify-center text-white shrink-0 text-[11px] font-bold">
            이
          </div>
          <div>
            <p className="text-[12px] text-white font-semibold leading-tight">이문승</p>
            <p className="text-[10px] text-slate-500 leading-tight">바로스 · 관리자</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
