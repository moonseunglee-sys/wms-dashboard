import { useOutletContext } from 'react-router-dom'
import InboundProductivity from '../tabs/InboundProductivity'
import type { InboundCtx } from './InboundLayout'

export default function ProductivityPage() {
  const { period, metric, granularity } = useOutletContext<InboundCtx>()
  return <InboundProductivity period={period} metric={metric} granularity={granularity} />
}
