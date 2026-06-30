import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const IcoSearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
)
const IcoBar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 9.2h3V19H5zm5.6-4.2h2.8v14h-2.8zm5.6 8H19v6h-2.8z" />
  </svg>
)
const IcoLogout = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
  </svg>
)
const IcoUser = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
  </svg>
)
const IcoChevron = ({ open }: { open: boolean }) => (
  <svg
    width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
)
const IcoStar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)

const GROUPS = [
  {
    label: '나의 워크스페이스',
    items: [{ to: '/dashboard', text: '피킹 대시보드', Icon: IcoBar }],
  },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({ 0: true })

  const toggleGroup = (i: number) =>
    setOpenGroups(prev => ({ ...prev, [i]: !prev[i] }))

  return (
    <aside className="w-[220px] min-w-[220px] bg-letusSidebar min-h-screen flex flex-col shrink-0">

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
          <span className="text-letusOrange"><IcoStar /></span>
          즐겨찾기
        </button>
        <button className="flex-1 flex items-center justify-center py-2 text-slate-500 hover:text-slate-300 transition-colors">
          전체메뉴
        </button>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto py-2">
        {GROUPS.map((g, gi) => (
          <div key={gi}>
            <button
              onClick={() => toggleGroup(gi)}
              className="w-full flex items-center justify-between px-4 py-2 text-[10px] text-slate-500 font-bold tracking-widest uppercase hover:text-slate-400 transition-colors"
            >
              <span>{g.label}</span>
              <IcoChevron open={openGroups[gi] ?? true} />
            </button>

            {(openGroups[gi] ?? true) && g.items
              .filter(item => !search || item.text.includes(search))
              .map(({ to, text, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-2.5 mx-2 px-3 py-2 text-[12.5px] rounded-md transition-all duration-150',
                      isActive
                        ? 'bg-letusOrange/90 text-white font-semibold'
                        : 'text-slate-400 hover:text-white hover:bg-white/6',
                    ].join(' ')
                  }
                >
                  <Icon />
                  <span>{text}</span>
                </NavLink>
              ))
            }
          </div>
        ))}
      </nav>

      {/* 사용자 영역 */}
      <div className="border-t border-white/8 px-3 py-3">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-white/5 transition-colors">
          <div className="w-7 h-7 rounded-full bg-letusOrange/80 flex items-center justify-center text-white shrink-0">
            <IcoUser />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-white font-semibold leading-tight truncate">{user?.username}</p>
            <p className="text-[10px] text-slate-500 leading-tight">바로스 · 관리자</p>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            title="로그아웃"
          >
            <IcoLogout />
          </button>
        </div>
      </div>
    </aside>
  )
}
