import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [id, setId]           = useState('')
  const [pw, setPw]           = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    await new Promise(r => setTimeout(r, 280))
    const ok = login(id, pw)
    setLoading(false)
    if (ok) navigate('/dashboard')
    else setError('아이디 또는 비밀번호가 올바르지 않습니다.')
  }

  return (
    <div className="min-h-screen bg-letusSidebar flex items-center justify-center px-4">
      <div className="w-full max-w-[360px] animate-slide-up">

        {/* 브랜드 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-letusOrange mb-4 text-2xl shadow-lg">
            📦
          </div>
          <h1 className="text-[15px] font-extrabold tracking-[0.15em] text-letusOrange">
            LETUS LOGIS
          </h1>
          <p className="text-[12px] text-slate-400 mt-1">WMS 생산성 관리 시스템</p>
        </div>

        {/* 카드 */}
        <div className="bg-[#1e2d3d] rounded-2xl px-8 py-8 shadow-2xl">
          <h2 className="text-white text-[18px] font-bold mb-6">로그인</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* 아이디 */}
            <div>
              <label className="block text-[12px] font-medium text-slate-400 mb-1.5">
                아이디
              </label>
              <input
                type="text"
                value={id}
                onChange={e => setId(e.target.value)}
                placeholder="아이디 입력"
                required
                autoFocus
                className="
                  w-full bg-letusSidebar border border-white/10 rounded-lg
                  px-4 py-2.5 text-[13px] text-white placeholder-slate-600
                  outline-none focus:border-letusOrange transition-colors
                "
              />
            </div>

            {/* 비밀번호 */}
            <div>
              <label className="block text-[12px] font-medium text-slate-400 mb-1.5">
                비밀번호
              </label>
              <input
                type="password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder="비밀번호 입력"
                required
                className="
                  w-full bg-letusSidebar border border-white/10 rounded-lg
                  px-4 py-2.5 text-[13px] text-white placeholder-slate-600
                  outline-none focus:border-letusOrange transition-colors
                "
              />
            </div>

            {/* 에러 */}
            {error && (
              <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-4 py-2.5">
                {error}
              </p>
            )}

            {/* 로그인 버튼 */}
            <button
              type="submit"
              disabled={loading}
              className="
                w-full mt-1 py-2.5 rounded-lg text-[14px] font-semibold text-white
                bg-letusOrange hover:bg-letusOrange/90 transition-colors
                disabled:opacity-60 disabled:cursor-not-allowed
              "
            >
              {loading ? '로그인 중…' : '로그인'}
            </button>
          </form>

          <p className="text-[11px] text-slate-600 text-center mt-5">
            테스트 계정: <span className="text-slate-400">admin / admin1234</span>
          </p>
        </div>
      </div>
    </div>
  )
}
