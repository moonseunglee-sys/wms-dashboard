import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/* ── SVG 아이콘 ─────────────────────────────────────────────────── */
const IcoHome = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
  </svg>
)
const IcoBar = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 9.2h3V19H5zm5.6-4.2h2.8v14h-2.8zm5.6 8H19v6h-2.8z" />
  </svg>
)
const IcoLogout = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
  </svg>
)
const IcoUser = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
  </svg>
)

/* ── 네비 그룹 ────────────────────────────────────────────────────── */
const GROUPS = [
  {
    label: '나의 워크스페이스',
    items: [{ to: '/dashboard', text: '피킹 대시보드', Icon: IcoBar }],
  },
]

/* ── 컴포넌트 ─────────────────────────────────────────────────────── */
export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <aside className="w-[220px] min-w-[220px] bg-letusSidebar min-h-screen flex flex-col shrink-0">

      {/* 로고 */}
      <div className="px-5 py-5 border-b border-white/10">
        <p className="text-[15px] font-extrabold tracking-[0.12em]">
          <span className="text-white">LETUS </span>
          <span className="text-letusOrange">LOGIS</span>
        </p>
        <p className="text-[11px] text-slate-400 mt-1">WMS 생산성 관리 시스템</p>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {GROUPS.map((g, gi) => (
          <div key={gi} className="mb-1">
            {g.label && (
              <p className="px-3 pt-3 pb-1.5 text-[10px] text-slate-500 font-bold tracking-widest uppercase">
                {g.label}
              </p>
            )}
            {g.items.map(({ to, text, Icon }) => (
              <NavLink
                key={to + text}
                to={to}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-2.5 px-3 py-2.5 text-[13px] rounded-lg transition-all duration-150',
                    isActive
                      ? 'bg-letusOrange text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/5',
                  ].join(' ')
                }
              >
                <Icon />
                <span>{text}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* 사용자 + 로그아웃 */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-slate-300">
            <IcoUser />
          </div>
          <div>
            <p className="text-[12px] text-white font-semibold leading-tight">{user?.username}</p>
            <p className="text-[10px] text-slate-500 leading-tight">관리자</p>
          </div>
        </div>
        <button
          onClick={() => { logout(); navigate('/login') }}
          className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] text-slate-400 border border-white/10 hover:text-white hover:bg-white/8 transition-colors"
        >
          <IcoLogout />
          로그아웃
        </button>
      </div>
    </aside>
  )
}
