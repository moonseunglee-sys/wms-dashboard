import { useOutletContext } from 'react-router-dom'
import InboundCenter from '../tabs/InboundCenter'
import type { InboundCtx } from './InboundLayout'

export default function CenterPage() {
  const { period, metric, granularity } = useOutletContext<InboundCtx>()
  return <InboundCenter period={period} metric={metric} granularity={granularity} />
}
