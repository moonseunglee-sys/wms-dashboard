import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

interface NavItem {
  label: string
  to: string
  icon: string
}

const NAV: NavItem[] = [
  { label: '피킹 대시보드', to: '/dashboard', icon: '📊' },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside
      style={{ backgroundColor: '#0f1e3c', width: '220px', minHeight: '100vh' }}
      className="flex flex-col text-white shrink-0"
    >
      {/* 로고 */}
      <div
        style={{ borderBottom: '1px solid #1e3054' }}
        className="px-5 py-5"
      >
        <div className="text-xs font-semibold tracking-widest" style={{ color: '#60a5fa' }}>
          LETUS LOGIS
        </div>
        <div className="text-sm font-bold mt-1 leading-tight">
          WMS 생산성<br />관리 시스템
        </div>
      </div>

      {/* 사용자 */}
      <div
        style={{ borderBottom: '1px solid #1e3054', backgroundColor: '#162444' }}
        className="px-5 py-3"
      >
        <div className="text-xs" style={{ color: '#94a3b8' }}>접속중</div>
        <div className="text-sm font-medium mt-0.5">{user?.username}</div>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-3 py-4">
        <div className="text-xs font-semibold px-2 mb-2" style={{ color: '#64748b' }}>
          MENU
        </div>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm mb-1 transition-colors',
                isActive
                  ? 'font-semibold'
                  : 'hover:bg-white/10',
              ].join(' ')
            }
            style={({ isActive }) =>
              isActive
                ? { backgroundColor: '#3b82f6', color: '#fff' }
                : { color: '#cbd5e1' }
            }
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* 로그아웃 */}
      <div style={{ borderTop: '1px solid #1e3054' }} className="p-4">
        <button
          onClick={handleLogout}
          className="w-full text-sm py-2 rounded-lg transition-colors hover:bg-white/10"
          style={{ color: '#94a3b8' }}
        >
          로그아웃
        </button>
      </div>
    </aside>
  )
}
