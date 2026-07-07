import { useOutletContext } from 'react-router-dom'
import InboundOverview from '../tabs/InboundOverview'
import type { InboundCtx } from './InboundLayout'

export default function OverviewPage() {
  const { period, metric, granularity } = useOutletContext<InboundCtx>()
  return <InboundOverview period={period} metric={metric} granularity={granularity} />
}
