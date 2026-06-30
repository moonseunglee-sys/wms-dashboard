export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="p-5 flex items-center justify-center" style={{ minHeight: 'calc(100vh - 52px)' }}>
      <div className="text-center">
        <div className="text-[48px] mb-4">🚧</div>
        <p className="text-[15px] font-semibold text-gray-500 mb-1">{title}</p>
        <p className="text-[12px] text-gray-400">구현 예정입니다</p>
      </div>
    </div>
  )
}
