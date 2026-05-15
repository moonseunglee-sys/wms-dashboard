import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div className="flex" style={{ minHeight: '100vh' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto" style={{ backgroundColor: '#f0f2f5' }}>
        <Outlet />
      </main>
    </div>
  )
}
