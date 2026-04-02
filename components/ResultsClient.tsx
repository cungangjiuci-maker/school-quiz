'use client'

import { useRouter } from 'next/navigation'
import { AnswerRecord } from '@/types'
import * as XLSX from 'xlsx'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

interface QuizSummary {
  id: string
  title: string
  code: string
  subject: string
  total_points: number
  created_at: string
}

interface Props {
  quizzes: QuizSummary[]
  answers: AnswerRecord[]
  selectedQuizId: string
}

export default function ResultsClient({ quizzes, answers, selectedQuizId }: Props) {
  const router = useRouter()
  const selectedQuiz = quizzes.find(q => q.id === selectedQuizId)

  const totalPoints = selectedQuiz?.total_points || 10

  // 統計計算
  const scores = answers.map(a => a.score)
  const avg = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0
  const max = scores.length > 0 ? Math.max(...scores) : 0
  const min = scores.length > 0 ? Math.min(...scores) : 0

  // 生徒ごとにグループ化（出席番号優先、なければ氏名）
  const studentMap: Record<string, AnswerRecord[]> = {}
  answers.forEach(a => {
    const key = a.student_number || a.student_name
    if (!studentMap[key]) studentMap[key] = []
    studentMap[key].push(a)
  })

  // 生徒ごとの集計行（複数回受験に対応）
  const studentRows = Object.values(studentMap).map(records => {
    const sorted = [...records].sort((a, b) =>
      new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
    )
    const first = sorted[0]
    const latest = sorted[sorted.length - 1]
    const growthPt = latest.score - first.score          // 伸び点数
    const growthRank = growthPt >= 3 ? 'A' : growthPt >= 1 ? 'B' : growthPt === 0 ? 'C' : 'D'
    return { first, latest, sorted, growthPt, growthRank, count: sorted.length }
  }).sort((a, b) =>
    (parseInt(a.first.student_number) || 0) - (parseInt(b.first.student_number) || 0)
  )

  // グラフデータ（提出時刻順）
  const chartData = answers
    .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
    .map((a, i) => ({
      name: `${i + 1}`,
      score: a.score,
      avg: Math.round(avg * 10) / 10,
    }))

  const handleExport = () => {
    const rows = studentRows.map((r, i) => ({
      No: i + 1,
      出席番号: r.latest.student_number,
      氏名: r.latest.student_name,
      最新点数: r.latest.score,
      合計点: r.latest.total_points,
      正解率: `${Math.round((r.latest.score / r.latest.total_points) * 100)}%`,
      受験回数: r.count,
      伸び点数: r.count > 1 ? (r.growthPt > 0 ? `+${r.growthPt}` : r.growthPt) : '—',
      伸びランク: r.count > 1 ? r.growthRank : '—',
      最終提出: new Date(r.latest.submitted_at).toLocaleString('ja-JP'),
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '成績')

    // 列幅設定
    ws['!cols'] = [
      { wch: 6 }, { wch: 10 }, { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 20 }
    ]

    XLSX.writeFile(wb, `成績_${selectedQuiz?.title || 'quiz'}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">成績集計</h1>
        {answers.length > 0 && (
          <button
            onClick={handleExport}
            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            Excelエクスポート
          </button>
        )}
      </div>

      {/* テスト選択 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">テストを選択</label>
        <select
          value={selectedQuizId}
          onChange={e => router.push(`/dashboard/results?quiz_id=${e.target.value}`)}
          className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-auto"
        >
          {quizzes.map(q => (
            <option key={q.id} value={q.id}>
              [{q.code}] {q.title} ({new Date(q.created_at).toLocaleDateString('ja-JP')})
            </option>
          ))}
        </select>
      </div>

      {answers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <p>まだ回答がありません</p>
        </div>
      ) : (
        <>
          {/* 統計カード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: '受験者数', value: `${answers.length}人` },
              { label: '平均点', value: `${Math.round(avg * 10) / 10}点` },
              { label: '最高点', value: `${max}点` },
              { label: '最低点', value: `${min}点` },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5 text-center">
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* グラフ */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-4">得点推移</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" label={{ value: '提出順', position: 'insideBottom', offset: -5 }} />
                <YAxis domain={[0, totalPoints]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="score" name="得点" stroke="#2563eb" strokeWidth={2} dot={true} />
                <Line type="monotone" dataKey="avg" name="平均" stroke="#9ca3af" strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 成績一覧テーブル */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">生徒別成績一覧</h2>
              <p className="text-xs text-gray-400">複数回受験の場合は最新点を表示・伸び率を算出</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left font-medium text-gray-600">出席番号</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">氏名</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">最新点数</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">正解率</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">受験回数</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">伸び</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">伸びランク</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">最終提出</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {studentRows.map(({ first, latest, count, growthPt, growthRank }) => {
                    const pct = Math.round((latest.score / latest.total_points) * 100)
                    const rankColors: Record<string, string> = {
                      A: 'bg-green-100 text-green-700',
                      B: 'bg-blue-100 text-blue-700',
                      C: 'bg-gray-100 text-gray-600',
                      D: 'bg-red-100 text-red-600',
                    }
                    return (
                      <tr key={first.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700">{latest.student_number}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{latest.student_name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold ${pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {latest.score}
                          </span>
                          <span className="text-gray-400">/{latest.total_points}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            pct >= 80 ? 'bg-green-100 text-green-700' :
                            pct >= 60 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {pct}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500">{count}回</td>
                        <td className="px-4 py-3 text-center">
                          {count > 1 ? (
                            <span className={`font-bold ${growthPt > 0 ? 'text-green-600' : growthPt < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                              {growthPt > 0 ? `+${growthPt}` : growthPt}点
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {count > 1 ? (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${rankColors[growthRank]}`}>
                              {growthRank}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500 text-xs">
                          {new Date(latest.submitted_at).toLocaleString('ja-JP')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
