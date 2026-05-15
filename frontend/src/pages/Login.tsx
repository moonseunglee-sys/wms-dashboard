import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    await new Promise((r) => setTimeout(r, 300))
    const ok = login(username, password)
    setLoading(false)
    if (ok) navigate('/dashboard')
    else setError('아이디 또는 비밀번호가 올바르지 않습니다.')
  }

  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: '100vh', backgroundColor: '#0f1e3c' }}
    >
      <div className="w-full max-w-sm">
        {/* 브랜드 헤더 */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ backgroundColor: '#3b82f6' }}
          >
            <span className="text-2xl">📦</span>
          </div>
          <h1
            className="text-lg font-bold tracking-widest"
            style={{ color: '#60a5fa' }}
          >
            LETUS LOGIS
          </h1>
          <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>
            WMS 생산성 관리 시스템
          </p>
        </div>

        {/* 로그인 카드 */}
        <div
          className="rounded-2xl p-8 shadow-2xl"
          style={{ backgroundColor: '#162444' }}
        >
          <h2 className="text-white text-xl font-semibold mb-6">로그인</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: '#94a3b8' }}
              >
                아이디
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="아이디를 입력하세요"
                required
                className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition-all"
                style={{
                  backgroundColor: '#0f1e3c',
                  border: '1px solid #1e3054',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#3b82f6')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#1e3054')}
              />
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: '#94a3b8' }}
              >
                비밀번호
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                required
                className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition-all"
                style={{
                  backgroundColor: '#0f1e3c',
                  border: '1px solid #1e3054',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#3b82f6')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#1e3054')}
              />
            </div>

            {error && (
              <div
                className="rounded-lg px-4 py-2.5 text-sm"
                style={{ backgroundColor: '#450a0a', color: '#fca5a5' }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity mt-2"
              style={{ backgroundColor: '#3b82f6', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          <p className="text-xs text-center mt-6" style={{ color: '#475569' }}>
            테스트 계정: admin / admin1234
          </p>
        </div>
      </div>
    </div>
  )
}
