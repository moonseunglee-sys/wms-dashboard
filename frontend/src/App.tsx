import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import PickingLayout from './pages/picking/PickingLayout'
import OverviewPage from './pages/picking/OverviewPage'
import BrandPage from './pages/picking/BrandPage'
import ProductivityPage from './pages/picking/ProductivityPage'
import WorkerPage from './pages/picking/WorkerPage'
import CenterPage from './pages/picking/CenterPage'
import ComingSoon from './pages/ComingSoon'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/picking" element={<PickingLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview"     element={<OverviewPage />} />
            <Route path="brand"        element={<BrandPage />} />
            <Route path="productivity" element={<ProductivityPage />} />
            <Route path="worker"       element={<WorkerPage />} />
            <Route path="center"       element={<CenterPage />} />
          </Route>
          <Route path="/incoming"            element={<ComingSoon title="입고생산성" />} />
          <Route path="/cbm"                 element={<ComingSoon title="CBM관리" />} />
          <Route path="/equipment/terminal"  element={<ComingSoon title="단말기 관리" />} />
        </Route>
        <Route path="*" element={<Navigate to="/picking/overview" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
