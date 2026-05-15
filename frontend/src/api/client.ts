const BASE = '/api'

async function request<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(BASE + path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v))
  }
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

export interface WorkerSummary {
  작업자: string
  화주사: string
  피킹건수: number
  표준시간_min: number
  실적시간_min: number
  가동률: number
}

export interface DailySummary {
  작업일: string
  피킹건수: number
  표준시간_min: number
  실적시간_min: number
  가동률: number
}

export interface PickingDetail {
  id: number
  작업자: string
  WAVE명: string
  ITEM_ID: string
  피킹수량: number
  LOCATION: string
  작업일시: string
  shift_type: string
  zone: string
  예상작업시간_min: number
  wave별_작업시간_min: number
  wave별_가동률: number
}

export type FilterParams = {
  start_date?: string
  end_date?: string
  shift_type?: string
  worker?: string
}

export const api = {
  health: () => request<{ status: string; db: string }>('/health'),
  workers: (f?: FilterParams) => request<WorkerSummary[]>('/picking/workers', f as Record<string, string>),
  daily: (f?: FilterParams) => request<DailySummary[]>('/picking/daily', f as Record<string, string>),
  detail: (f?: FilterParams & { limit?: string; offset?: string }) =>
    request<PickingDetail[]>('/picking/detail', f as Record<string, string>),
  workerList: () => request<string[]>('/picking/workers/list'),
}
