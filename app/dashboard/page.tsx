import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: quizzes } = await supabase
    .from('quizzes')
    .select('*')
    .eq('teacher_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        <Link
          href="/dashboard/create"
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
        >
          + 新しい問題を作成
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">作成済みテスト</p>
          <p className="text-3xl font-bold text-blue-700 mt-1">{quizzes?.length ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">生徒CBT用URL</p>
          <p className="text-sm font-mono text-gray-700 mt-1 break-all">/quiz</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">使い方</p>
          <p className="text-sm text-gray-600 mt-1">授業プリントをアップロードしてAIが自動作問</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">作成済みテスト一覧</h2>
        </div>
        {!quizzes || quizzes.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400">
            <p>まだテストが作成されていません</p>
            <Link href="/dashboard/create" className="mt-4 inline-block text-blue-600 hover:underline">
              最初のテストを作成する →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {quizzes.map(quiz => (
              <div key={quiz.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{quiz.title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {quiz.subject} · {quiz.estimated_minutes}分 · {quiz.total_points}点
                    · 作成日: {new Date(quiz.created_at).toLocaleDateString('ja-JP')}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="bg-blue-100 text-blue-700 font-mono font-bold text-lg px-3 py-1 rounded">
                    {quiz.code}
                  </span>
                  <Link
                    href={`/dashboard/results?quiz_id=${quiz.id}`}
                    className="text-sm text-gray-600 hover:text-blue-600"
                  >
                    成績確認
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
