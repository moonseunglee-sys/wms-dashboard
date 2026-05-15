import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// ── SVG 아이콘 ──────────────────────────────────────────────────────
const IconHome = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
  </svg>
)
const IconBar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 9.2h3V19H5zm5.6-4.2h2.8v14h-2.8zm5.6 8H19v6h-2.8z" />
  </svg>
)
const IconLogout = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
  </svg>
)

// ── 네비 구조 ──────────────────────────────────────────────────────
const NAV = [
  {
    group: null,
    items: [{ label: '대시보드', to: '/dashboard', Icon: IconHome }],
  },
  {
    group: '피킹관리',
    items: [{ label: '피킹 대시보드', to: '/dashboard', Icon: IconBar }],
  },
]

const S = {
  sidebar: {
    width: 180,
    minWidth: 180,
    background: '#1a2332',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  } as React.CSSProperties,

  logo: {
    padding: '18px 16px 14px',
    borderBottom: '1px solid #243048',
    flexShrink: 0,
  } as React.CSSProperties,

  groupLabel: {
    padding: '16px 16px 4px',
    fontSize: 10,
    color: '#4a5a72',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  } as React.CSSProperties,

  bottom: {
    borderTop: '1px solid #243048',
    padding: '12px 14px',
    flexShrink: 0,
  } as React.CSSProperties,

  logoutBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px',
    background: 'transparent',
    border: '1px solid #2d3f55',
    borderRadius: 4,
    color: '#8898aa',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'all 0.15s',
  } as React.CSSProperties,
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside style={S.sidebar}>
      {/* ── 로고 ── */}
      <div style={S.logo}>
        <div style={{ fontSize: 11, color: '#FF6B35', fontWeight: 800, letterSpacing: '0.12em' }}>
          LETUS LOGIS
        </div>
        <div style={{ fontSize: 13, color: '#fff', fontWeight: 700, marginTop: 5, lineHeight: 1.3 }}>
          WMS 관리시스템
        </div>
      </div>

      {/* ── 네비게이션 ── */}
      <nav style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
        {NAV.map((section, si) => (
          <div key={si}>
            {section.group && (
              <div style={S.groupLabel}>{section.group}</div>
            )}
            {section.items.map(({ label, to, Icon }) => (
              <NavLink
                key={to + label}
                to={to}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                style={{ color: '#8898aa' }}
              >
                <Icon />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* ── 사용자 + 로그아웃 ── */}
      <div style={S.bottom}>
        <div style={{ fontSize: 11, color: '#4a5a72', marginBottom: 2 }}>접속자</div>
        <div style={{ fontSize: 13, color: '#e0e8f0', fontWeight: 600, marginBottom: 10 }}>
          {user?.username}
        </div>
        <button
          onClick={handleLogout}
          style={S.logoutBtn}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = '#8898aa'
          }}
        >
          <IconLogout />
          로그아웃
        </button>
      </div>
    </aside>
  )
}
