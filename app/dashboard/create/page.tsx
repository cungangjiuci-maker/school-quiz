'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { QuestionType, GenerateQuizResponse, Question } from '@/types'
import QuizPreview from '@/components/QuizPreview'
import { useRouter } from 'next/navigation'

const QUESTION_TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: 'journal_entry', label: '仕訳問題' },
  { value: 'calculation', label: '計算問題' },
  { value: 'multiple_choice', label: '選択問題' },
  { value: 'description', label: '語句記述問題' },
]

export default function CreatePage() {
  const [file, setFile] = useState<File | null>(null)
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal')
  const [estimatedMinutes, setEstimatedMinutes] = useState(10)
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>(['journal_entry', 'calculation'])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generatedQuiz, setGeneratedQuiz] = useState<GenerateQuizResponse | null>(null)
  const [saving, setSaving] = useState(false)
  const [publishedCode, setPublishedCode] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) setFile(f)
  }

  const toggleQuestionType = (type: QuestionType) => {
    setQuestionTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  const extractText = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/extract-text', { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || 'テキスト抽出に失敗しました')
    }
    if (!data.text || data.text.trim().length === 0) {
      throw new Error('ファイルからテキストを抽出できませんでした。スキャン画像のPDFは対応していません。')
    }
    return data.text
  }

  const handleGenerate = async () => {
    if (!file) {
      setError('ファイルをアップロードしてください')
      return
    }
    if (questionTypes.length === 0) {
      setError('問題形式を1つ以上選択してください')
      return
    }

    setLoading(true)
    setError('')
    setGeneratedQuiz(null)

    try {
      const content = await extractText(file)

      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, difficulty, estimated_minutes: estimatedMinutes, question_types: questionTypes, notes }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '生成に失敗しました')

      setGeneratedQuiz(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateQuestion = (index: number, updated: Question) => {
    if (!generatedQuiz) return
    const questions = [...generatedQuiz.questions]
    questions[index] = updated
    const totalPoints = questions.reduce((s, q) => s + q.points, 0)
    setGeneratedQuiz({ ...generatedQuiz, questions, total_points: totalPoints })
  }

  const handleReorder = (reordered: Question[]) => {
    if (!generatedQuiz) return
    setGeneratedQuiz({ ...generatedQuiz, questions: reordered })
  }

  const generateCode = () => {
    return Math.floor(1000 + Math.random() * 9000).toString()
  }

  const handlePublish = async () => {
    if (!generatedQuiz) return
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('再ログインが必要です'); setSaving(false); return }

    const code = generateCode()

    const { data, error: dbError } = await supabase
      .from('quizzes')
      .insert({
        teacher_id: user.id,
        title: generatedQuiz.title,
        subject: generatedQuiz.subject,
        code,
        estimated_minutes: generatedQuiz.estimated_minutes,
        total_points: generatedQuiz.total_points,
        questions: generatedQuiz.questions,
        is_active: true,
      })
      .select()
      .single()

    if (dbError) {
      setError('保存に失敗しました: ' + dbError.message)
    } else {
      setPublishedCode(data.code)
    }
    setSaving(false)
  }

  if (publishedCode) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="bg-green-50 rounded-2xl p-10 border border-green-200">
          <div className="text-5xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">公開完了！</h2>
          <p className="text-gray-600 mb-6">生徒に以下の4桁コードを伝えてください</p>
          <div className="bg-white rounded-xl border-2 border-blue-400 py-6 mb-6">
            <p className="text-6xl font-bold font-mono text-blue-700 tracking-widest">{publishedCode}</p>
          </div>
          <p className="text-sm text-gray-500 mb-6">生徒用URL: <code className="bg-gray-100 px-2 py-0.5 rounded">/quiz</code></p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setPublishedCode(null); setGeneratedQuiz(null); setFile(null) }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium"
            >
              新しい問題を作成
            </button>
            <button onClick={() => router.push('/dashboard')} className="border border-gray-300 px-6 py-2.5 rounded-lg font-medium text-gray-700 hover:bg-gray-50">
              ダッシュボードへ
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">問題作成</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* ファイルアップロード */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">授業プリントのアップロード</h2>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              file ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            {file ? (
              <div>
                <p className="text-blue-700 font-medium">{file.name}</p>
                <p className="text-sm text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                <button
                  onClick={e => { e.stopPropagation(); setFile(null) }}
                  className="mt-2 text-xs text-red-500 hover:underline"
                >
                  削除
                </button>
              </div>
            ) : (
              <div>
                <p className="text-gray-500 mb-1">ここにドラッグ＆ドロップ</p>
                <p className="text-sm text-gray-400">または クリックしてファイルを選択</p>
                <p className="text-xs text-gray-400 mt-2">.docx / .pdf 対応</p>
              </div>
            )}
          </div>
        </div>

        {/* AI設定 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">AI作問設定</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">難易度</label>
            <div className="flex gap-2">
              {(['easy', 'normal', 'hard'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    difficulty === d
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {d === 'easy' ? 'やさしめ' : d === 'normal' ? '標準' : '難しめ'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">解答時間</label>
            <div className="flex gap-2">
              {[5, 8, 10, 15].map(m => (
                <button
                  key={m}
                  onClick={() => setEstimatedMinutes(m)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    estimatedMinutes === m
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {m}分
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">問題形式</label>
            <div className="grid grid-cols-2 gap-2">
              {QUESTION_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => toggleQuestionType(opt.value)}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                    questionTypes.includes(opt.value)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">特記事項</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例: 製造間接費の配賦を重点的に出題してください"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
          {error}
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={loading || !file}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition-colors mb-8"
      >
        {loading ? 'AIが問題を生成中...' : '問題を生成する'}
      </button>

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-gray-600 mt-4">Claude AIが問題を作成しています...</p>
          <p className="text-sm text-gray-400 mt-1">30秒ほどお待ちください</p>
        </div>
      )}

      {generatedQuiz && !loading && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">生成結果のプレビュー</h2>
            <button
              onClick={handlePublish}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
            >
              {saving ? '保存中...' : '保存して公開'}
            </button>
          </div>
          <QuizPreview
            quiz={generatedQuiz}
            onUpdateQuestion={handleUpdateQuestion}
            onReorder={handleReorder}
          />
        </div>
      )}
    </div>
  )
}
