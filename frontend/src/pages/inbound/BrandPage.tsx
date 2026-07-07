import { useOutletContext } from 'react-router-dom'
import InboundBrand from '../tabs/InboundBrand'
import type { InboundCtx } from './InboundLayout'

export default function BrandPage() {
  const { period, metric, granularity } = useOutletContext<InboundCtx>()
  return <InboundBrand period={period} metric={metric} granularity={granularity} />
}
