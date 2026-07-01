interface Payload {
  name: string
  value: number
  color?: string
  fill?: string
  stroke?: string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: Payload[]
  label?: string
  formatter?: (v: number, name: string) => string
}

export function ChartTooltip({ active, payload, label, formatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const visiblePayload = payload.filter(p => p.value != null && p.value !== 0)
  if (!visiblePayload.length) return null

  return (
    <div className="bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.10)] border border-gray-100/80 py-2.5 px-3.5 min-w-[150px]">
      {label && (
        <p className="text-[11px] font-semibold text-gray-400 mb-2 pb-1.5 border-b border-gray-50">
          {label}
        </p>
      )}
      <div className="space-y-1.5">
        {visiblePayload.map((p, i) => {
          const c = p.fill ?? p.color ?? p.stroke ?? '#94a3b8'
          const n = p.name === 'total' ? '합계' : p.name
          const v = formatter ? formatter(p.value, p.name) : p.value.toLocaleString('ko-KR')
          return (
            <div key={i} className="flex items-center justify-between gap-5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: c }} />
                <span className="text-[11px] text-gray-500 truncate">{n}</span>
              </div>
              <span className="text-[12px] font-bold text-gray-800">{v}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
