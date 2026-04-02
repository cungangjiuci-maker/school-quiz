'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Mode = 'login' | 'signup'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('メールアドレスまたはパスワードが正しくありません')
        setLoading(false)
      } else {
        // router.push ではなく window.location でハードナビゲーション
        // → Supabase Cookie がサーバーに正しく送信される
        window.location.href = '/dashboard'
      }
    } else {
      const { error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) {
        setError('登録に失敗しました: ' + signUpError.message)
        setLoading(false)
        return
      }
      // 登録直後にサインインを試みる（メール確認不要設定の場合は即遷移）
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setMessage('登録しました。確認メールのリンクをクリック後、ログインしてください。')
        setLoading(false)
      } else {
        window.location.href = '/dashboard'
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">工業簿記 小テストシステム</h1>
          <p className="text-gray-500 mt-1 text-sm">教員向け管理画面</p>
        </div>

        {/* タブ切り替え */}
        <div className="flex rounded-lg border border-gray-200 mb-6 overflow-hidden">
          <button
            onClick={() => { setMode('login'); setError(''); setMessage('') }}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mode === 'login' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            ログイン
          </button>
          <button
            onClick={() => { setMode('signup'); setError(''); setMessage('') }}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mode === 'signup' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            新規登録
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="teacher@school.jp"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              パスワード {mode === 'signup' && <span className="text-gray-400 font-normal">（6文字以上）</span>}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              minLength={6}
              required
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
          )}
          {message && (
            <p className="text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg p-3">{message}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading
              ? (mode === 'login' ? 'ログイン中...' : '登録中...')
              : (mode === 'login' ? 'ログイン' : 'アカウントを作成')
            }
          </button>
        </form>

        {mode === 'signup' && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
            <strong>Supabase設定について:</strong> メール確認を無効にすると登録後すぐにログインできます。
            Supabase ダッシュボード → Authentication → Providers → Email →
            「Confirm email」をオフにしてください。
          </div>
        )}
      </div>
    </div>
  )
}
