import { useOutletContext } from 'react-router-dom'
import BrandDetail from '../tabs/BrandDetail'
import type { PickingCtx } from './PickingLayout'

export default function BrandPage() {
  const { period, metric } = useOutletContext<PickingCtx>()
  return <BrandDetail period={period} metric={metric} />
}
