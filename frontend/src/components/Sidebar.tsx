import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/* ── SVG 아이콘 ─────────────────────────────────────────────────── */
const IcoHome = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
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

/* ── 네비 그룹 ────────────────────────────────────────────────────── */
const GROUPS = [
  {
    label: null,
    items: [{ to: '/dashboard', text: '대시보드',      Icon: IcoHome }],
  },
  {
    label: '피킹관리',
    items: [{ to: '/dashboard', text: '피킹 대시보드', Icon: IcoBar  }],
  },
]

/* NavLink 스타일 헬퍼 */
const linkCls = (active: boolean) =>
  [
    'flex items-center gap-2.5 px-4 py-[9px] text-[13px]',
    'border-l-2 transition-colors duration-150',
    active
      ? 'border-letusBlue text-white font-semibold'
      : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5',
  ].join(' ')

const linkStyle = (active: boolean): React.CSSProperties =>
  active ? { background: 'rgba(37,99,235,0.13)' } : {}

/* ── 컴포넌트 ─────────────────────────────────────────────────────── */
export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <aside className="w-[180px] min-w-[180px] bg-letusSidebar min-h-screen flex flex-col shrink-0">

      {/* 로고 */}
      <div className="px-4 py-[18px] border-b border-white/10">
        <p className="text-[11px] text-letusOrange font-bold tracking-widest">LETUS LOGIS</p>
        <p className="text-[13px] text-white font-bold mt-1.5 leading-snug">WMS 관리시스템</p>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto py-2">
        {GROUPS.map((g, gi) => (
          <div key={gi}>
            {g.label && (
              <p className="px-4 pt-4 pb-1 text-[10px] text-slate-500 font-bold tracking-widest uppercase">
                {g.label}
              </p>
            )}
            {g.items.map(({ to, text, Icon }) => (
              <NavLink
                key={to + text}
                to={to}
                className={({ isActive }) => linkCls(isActive)}
                style={({ isActive }) => linkStyle(isActive)}
              >
                <Icon />
                <span>{text}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* 사용자 + 로그아웃 */}
      <div className="border-t border-white/10 px-4 py-3.5">
        <p className="text-[11px] text-slate-500 mb-0.5">접속자</p>
        <p className="text-[13px] text-slate-200 font-semibold mb-3">{user?.username}</p>
        <button
          onClick={() => { logout(); navigate('/login') }}
          className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] text-slate-400 border border-white/10 hover:text-white hover:bg-white/8 transition-colors"
        >
          <IcoLogout />
          로그아웃
        </button>
      </div>
    </aside>
  )
}
