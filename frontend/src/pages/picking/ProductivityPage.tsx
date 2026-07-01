import { useOutletContext } from 'react-router-dom'
import Productivity from '../tabs/Productivity'
import type { PickingCtx } from './PickingLayout'

export default function ProductivityPage() {
  const { period, metric, granularity } = useOutletContext<PickingCtx>()
  return <Productivity period={period} metric={metric} granularity={granularity} />
}
