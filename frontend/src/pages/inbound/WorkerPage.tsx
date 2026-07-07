import { useOutletContext } from 'react-router-dom'
import InboundWorker from '../tabs/InboundWorker'
import type { InboundCtx } from './InboundLayout'

export default function WorkerPage() {
  const { period, metric, granularity } = useOutletContext<InboundCtx>()
  return <InboundWorker period={period} metric={metric} granularity={granularity} />
}
