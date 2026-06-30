import { useOutletContext } from 'react-router-dom'
import WorkerDetail from '../tabs/WorkerDetail'
import type { PickingCtx } from './PickingLayout'

export default function WorkerPage() {
  const { period, metric } = useOutletContext<PickingCtx>()
  return <WorkerDetail period={period} metric={metric} />
}
