export default function InboundPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center">
        <div className="text-[40px] mb-3">🚧</div>
        <p className="text-[14px] font-semibold text-gray-500 mb-1">{label}</p>
        <p className="text-[12px] text-gray-400">구현 예정입니다 — 종합현황부터 순서대로 진행 중</p>
      </div>
    </div>
  )
}
