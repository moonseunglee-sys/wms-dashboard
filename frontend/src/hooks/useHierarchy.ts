import { useState } from 'react'
import type { HierarchyFilter } from '../lib/types'

/** 센터 > 브랜드 > 구역 > 작업자 계층 드릴다운 상태 관리
 *
 *  하위 선택 시 그 아래는 자동 초기화:
 *    owner 선택  → zone, worker 초기화
 *    zone 선택   → worker 초기화
 *    worker 선택 → 그대로 (말단)
 */
export function useHierarchy() {
  const [filter, setFilter] = useState<HierarchyFilter>({})

  function selectOwner(owner: string | undefined) {
    setFilter({ owner })
  }

  function selectZone(zone: string | undefined) {
    setFilter(f => ({ owner: f.owner, zone }))
  }

  function selectWorker(worker: string | undefined) {
    setFilter(f => ({ owner: f.owner, zone: f.zone, worker }))
  }

  function reset() {
    setFilter({})
  }

  /** 현재 드릴다운 깊이: 0=전체, 1=브랜드, 2=구역, 3=작업자 */
  const depth =
    filter.worker ? 3 :
    filter.zone   ? 2 :
    filter.owner  ? 1 : 0

  /** 빵부스러기 경로 배열 */
  const breadcrumb: { label: string; onClick: () => void }[] = [
    { label: '전체', onClick: reset },
    ...(filter.owner  ? [{ label: filter.owner,  onClick: () => selectOwner(filter.owner) }] : []),
    ...(filter.zone   ? [{ label: filter.zone,   onClick: () => selectZone(filter.zone)   }] : []),
    ...(filter.worker ? [{ label: filter.worker, onClick: () => {} }] : []),
  ]

  return { filter, depth, breadcrumb, selectOwner, selectZone, selectWorker, reset }
}
