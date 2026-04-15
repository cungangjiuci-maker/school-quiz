'use client'

import { useState } from 'react'
import { Quiz, StudentAnswer, GradingDetail, Question, JournalEntryAnswer, CalculationBlank, TableData } from '@/types'
import QuizTaker from '@/components/QuizTaker'

// SSRを完全に無効化
export const dynamic = 'force-dynamic'

type Phase = 'code' | 'info' | 'quiz' | 'result'

// ---- 正解表示コンポーネント ----
function CorrectAnswerDisplay({ question, correctAnswer }: { question: Question; correctAnswer: unknown }) {
  try {
    if (question?.type === 'journal_entry') {
      const rows: JournalEntryAnswer[] = Array.isArray(correctAnswer) && correctAnswer.length > 0
        ? (correctAnswer as JournalEntryAnswer[])
        : correctAnswer != null
          ? [correctAnswer as JournalEntryAnswer]
          : []
      if (rows.length === 0) return null
      return (
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs w-full">
            <thead>
              <tr>
                {['借方科目', '借方金額', '貸方科目', '貸方金額'].map(h => (
                  <th key={h} className="border border-gray-300 bg-gray-100 px-2 py-1 text-center font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="border border-gray-300 px-2 py-1 text-center">{row?.debit_account}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">{(row?.debit_amount as number | undefined)?.toLocaleString?.()}</td>
                  <td className="border border-gray-300 px-2 py-1 text-center">{row?.credit_account}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">{(row?.credit_amount as number | undefined)?.toLocaleString?.()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (question?.type === 'calculation') {
      // 【診断ログ】正解表示データを確認
      console.log('[CorrectAnswerDisplay] calculation:', JSON.stringify({ correctAnswer, question_blanks: question?.blanks }))

      // correctAnswer が正しい配列でない場合は question.blanks をフォールバックとして使用
      const blanks: CalculationBlank[] =
        Array.isArray(correctAnswer) && correctAnswer.length > 0
          ? (correctAnswer as CalculationBlank[])
          : Array.isArray(question?.blanks) && (question.blanks?.length ?? 0) > 0
            ? question.blanks!
            : []
      if (blanks.length === 0) return (
        <p className="text-xs text-gray-500">（このクイズの正解データが未設定です。教師に問題を再生成してもらってください）</p>
      )
      return (
        <div className="space-y-2">
          {question.table_data != null && (
            <CorrectAnswerTable tableData={question.table_data} blanks={blanks} />
          )}
          <p className="text-xs text-gray-700 leading-relaxed">
            {blanks.map(b => (
              `${b?.position ?? ''}：${typeof b?.answer === 'number' ? b.answer.toLocaleString() : (b?.answer ?? '')}`
            )).join('　')}
          </p>
        </div>
      )
    }

    if (question?.type === 'multiple_choice') {
      const idx = typeof correctAnswer === 'number' ? correctAnswer : -1
      const choice = question.choices?.[idx]
      if (idx < 0 || choice == null) return null
      return <p className="text-xs text-gray-700">{idx + 1}. {choice}</p>
    }

    if (question?.type === 'description') {
      const keywords = Array.isArray(correctAnswer) ? (correctAnswer as string[]) : []
      if (keywords.length === 0) return null
      return <p className="text-xs text-gray-700">キーワード: {keywords.join('、')}</p>
    }
  } catch (e) {
    console.error('CorrectAnswerDisplay error:', e)
    return <p className="text-xs text-gray-400">（表示エラー）</p>
  }

  return null
}

function CorrectAnswerTable({ tableData, blanks }: { tableData: TableData; blanks: CalculationBlank[] }) {
  const answerMap: Record<string, string> = {}
  ;(blanks ?? []).forEach(b => {
    if (b?.position != null) {
      answerMap[b.position] = typeof b.answer === 'number' ? b.answer.toLocaleString() : String(b.answer ?? '')
    }
  })

  return (
    <div className="overflow-x-auto">
      <p className="text-xs text-gray-500 mb-1">{tableData?.title}</p>
      <table className="border-collapse text-xs w-full">
        <thead>
          <tr>
            {(tableData?.headers ?? []).map((h, i) => (
              <th key={i} className="border-2 border-gray-600 bg-gray-200 px-2 py-1 text-center font-bold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(tableData?.rows ?? []).map((row, ri) => (
            <tr key={ri} className={row?.label?.includes('合計') || row?.label?.includes('完成品') ? 'bg-gray-50 font-semibold' : ''}>
              <td className="border-2 border-gray-600 px-2 py-1 whitespace-nowrap">{row?.label}</td>
              {(row?.values ?? []).map((val, vi) => {
                const isBlank = /^[①-⑳]$/.test(val)
                return (
                  <td key={vi} className={`border-2 border-gray-600 px-2 py-1 text-right whitespace-nowrap ${isBlank ? 'bg-green-50' : ''}`}>
                    {isBlank ? (
                      <span className="font-bold text-green-700">{val}:{answerMap[val] ?? '?'}</span>
                    ) : val}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const ACCOUNT_LIST = [
  '材料', '仕掛品', '製品', '製造間接費', '賃金', '給料',
  '減価償却費', '売上', '売上原価', '現金', '当座預金',
  '買掛金', '売掛金', '前払費用', '未払費用', '修繕費',
  '水道光熱費', '通信費', '外注加工費', '間接材料費',
  '直接材料費', '直接労務費', '直接経費', '間接労務費',
  '間接経費', '製造原価報告書', '損益', '繰越商品',
]

export default function QuizPage() {
  const [phase, setPhase] = useState<Phase>('code')
  const [code, setCode] = useState('')
  const [studentName, setStudentName] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [score, setScore] = useState(0)
  const [gradingDetails, setGradingDetails] = useState<GradingDetail[]>([])
  const [error, setError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [loading, setLoading] = useState(false)

  // 4桁コードでテストを取得（サーバーサイドAPI経由）
  const handleCodeSubmit = async () => {
    if (code.length !== 4) { setError('4桁のコードを入力してください'); return }
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/quiz?code=${code}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'テストが見つかりません。コードを確認してください。')
      } else {
        // 【診断ログ】取得したクイズデータを確認
        console.log('[handleCodeSubmit] クイズ取得成功:', JSON.stringify({
          id: data.id,
          title: data.title,
          questions: data.questions?.map((q: Question) => ({
            id: q.id,
            type: q.type,
            blanks: q.blanks,
            blanks_count: Array.isArray(q.blanks) ? q.blanks.length : 0,
            has_table_data: !!q.table_data,
          }))
        }))
        setQuiz(data)
        setPhase('info')
      }
    } catch (e) {
      console.error('Quiz fetch error:', e)
      setError('ネットワークエラーが発生しました。再度お試しください。')
    }

    setLoading(false)
  }

  // 氏名・出席番号を確認してテスト開始
  const handleInfoSubmit = () => {
    if (!studentName.trim()) { setError('氏名を入力してください'); return }
    if (!studentNumber.trim()) { setError('出席番号を入力してください'); return }
    setError('')
    setPhase('quiz')
  }

  // 解答を提出して採点
  const handleSubmit = async (submittedAnswers: Record<string, StudentAnswer>) => {
    if (!quiz) return
    setLoading(true)
    setSubmitError('')

    // 【診断ログ】送信データを確認
    const calcQuestions = quiz.questions.filter(q => q.type === 'calculation')
    console.log('[handleSubmit] 計算問題のblanksデータ:', JSON.stringify(calcQuestions.map(q => ({ id: q.id, blanks: q.blanks, has_table: !!q.table_data }))))
    console.log('[handleSubmit] 送信する回答:', JSON.stringify(
      Object.entries(submittedAnswers)
        .filter(([, v]) => v.type === 'calculation')
        .map(([k, v]) => ({ questionId: k, answer: v }))
    ))

    try {
      const res = await fetch('/api/submit-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quiz_id: quiz.id,
          student_name: studentName,
          student_number: studentNumber,
          answers: submittedAnswers,
          questions: quiz.questions,
        }),
      })

      if (!res.ok) {
        throw new Error(`サーバーエラー: ${res.status}`)
      }

      const data = await res.json()
      setScore(data.score ?? 0)
      setGradingDetails(Array.isArray(data.grading_details) ? data.grading_details : [])
      setPhase('result')
    } catch (e) {
      setSubmitError('採点中にエラーが発生しました。もう一度「提出する」を押してください。')
      console.error('Submit error:', e)
    } finally {
      setLoading(false)
    }
  }

  // ① 4桁コード入力
  if (phase === 'code') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
          <h1 className="text-xl font-bold text-center text-gray-900 mb-2">工業簿記 小テスト</h1>
          <p className="text-gray-500 text-center text-sm mb-8">先生から受け取った4桁のコードを入力</p>

          <div className="mb-6">
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full text-4xl font-bold text-center border-2 border-gray-300 rounded-xl py-4 focus:outline-none focus:border-blue-500 tracking-widest"
              placeholder="0000"
              maxLength={4}
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center mb-4">{error}</p>}

          <button
            onClick={handleCodeSubmit}
            disabled={loading || code.length !== 4}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition-colors text-lg"
          >
            {loading ? '確認中...' : '次へ'}
          </button>
        </div>
      </div>
    )
  }

  // ② 氏名・出席番号入力
  if (phase === 'info') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-1">{quiz?.title}</h2>
          <p className="text-sm text-gray-500 mb-6">{quiz?.estimated_minutes}分 · {quiz?.total_points}点</p>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">出席番号</label>
              <input
                type="text"
                inputMode="numeric"
                value={studentNumber}
                onChange={e => setStudentNumber(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例: 15"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">氏名</label>
              <input
                type="text"
                value={studentName}
                onChange={e => setStudentName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例: 山田 太郎"
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

          <button
            onClick={handleInfoSubmit}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors"
          >
            テスト開始
          </button>
        </div>
      </div>
    )
  }

  // ③ テスト回答
  if (phase === 'quiz' && quiz) {
    return (
      <>
        <QuizTaker
          quiz={quiz}
          accountList={ACCOUNT_LIST}
          onSubmit={handleSubmit}
          loading={loading}
        />
        {submitError && (
          <div className="fixed bottom-4 left-4 right-4 bg-red-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg z-50 text-center">
            {submitError}
          </div>
        )}
      </>
    )
  }

  // ④ 結果表示
  if (phase === 'result' && quiz) {
    const percentage = Math.round((score / quiz.total_points) * 100)
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <h2 className="text-xl font-bold text-center text-gray-900 mb-1">{quiz.title} 結果</h2>
            <p className="text-center text-gray-500 text-sm mb-6">{studentNumber}番 {studentName}</p>

            <div className="text-center mb-6">
              <div className={`text-6xl font-bold ${percentage >= 80 ? 'text-green-600' : percentage >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                {score}
              </div>
              <div className="text-gray-500 text-lg">/ {quiz.total_points}点</div>
              <div className={`text-2xl font-bold mt-2 ${percentage >= 80 ? 'text-green-600' : percentage >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                {percentage}%
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {gradingDetails.map((detail, index) => {
              const q = quiz.questions.find(q => q.id === detail.question_id)
              return (
                <div key={index} className={`bg-white rounded-xl border-l-4 p-4 ${detail.is_correct ? 'border-green-500' : 'border-red-500'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-900">問{detail.question_id}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${detail.is_correct ? 'text-green-600' : 'text-red-600'}`}>
                        {detail.is_correct ? '○' : '×'}
                      </span>
                      <span className="text-sm text-gray-500">{detail.earned_points}/{detail.max_points}点</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{q?.question_text}</p>
                  {!detail.is_correct && q && (
                    <div className="bg-red-50 rounded-lg p-3">
                      <p className="text-red-700 font-medium text-xs mb-2">正解:</p>
                      <CorrectAnswerDisplay question={q} correctAnswer={detail.correct_answer} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <button
            onClick={() => { setPhase('code'); setCode(''); setStudentName(''); setStudentNumber(''); setQuiz(null) }}
            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors"
          >
            最初に戻る
          </button>
        </div>
      </div>
    )
  }

  return null
}
