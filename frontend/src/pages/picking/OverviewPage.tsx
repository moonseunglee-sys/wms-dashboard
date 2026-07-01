import { useOutletContext } from 'react-router-dom'
import Overview from '../tabs/Overview'
import type { PickingCtx } from './PickingLayout'

export default function OverviewPage() {
  const { period, metric, granularity } = useOutletContext<PickingCtx>()
  return <Overview period={period} metric={metric} granularity={granularity} />
}
