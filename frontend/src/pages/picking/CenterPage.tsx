import { useOutletContext } from 'react-router-dom'
import CenterPageTab from '../tabs/CenterPage'
import type { PickingCtx } from './PickingLayout'

export default function CenterPage() {
  const { period, metric, granularity } = useOutletContext<PickingCtx>()
  return <CenterPageTab period={period} metric={metric} granularity={granularity} />
}
