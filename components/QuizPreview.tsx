'use client'

import { useState, useRef } from 'react'
import { GenerateQuizResponse, Question, QuestionType, CalculationBlank, JournalEntryAnswer, TableData } from '@/types'

interface Props {
  quiz: GenerateQuizResponse
  onUpdateQuestion: (index: number, question: Question) => void
  onReorder: (questions: Question[]) => void
}

const TYPE_LABELS: Record<QuestionType, string> = {
  journal_entry: '仕訳問題',
  calculation: '計算問題',
  multiple_choice: '選択問題',
  description: '語句記述問題',
}

const ACCOUNT_LIST = [
  '材料', '仕掛品', '製品', '製造間接費', '賃金', '給料',
  '減価償却費', '売上', '売上原価', '現金', '当座預金',
  '買掛金', '売掛金', '前払費用', '未払費用', '修繕費',
]

// ---- 個別問題カード ----
function QuestionCard({
  question,
  onUpdate,
  dragHandleProps,
}: {
  question: Question
  onUpdate: (q: Question) => void
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Question>(question)

  const startEdit = () => {
    setDraft(JSON.parse(JSON.stringify(question)))
    setEditing(true)
  }
  const cancel = () => setEditing(false)
  const confirm = () => {
    onUpdate(draft)
    setEditing(false)
  }

  // ドラフト更新ヘルパー
  const set = (patch: Partial<Question>) => setDraft(d => ({ ...d, ...patch }))

  // ---- 表示モード ----
  if (!editing) {
    return (
      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 select-none px-1"
            title="ドラッグで順番を入れ替え"
          >
            ⠿
          </div>
          <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-0.5 rounded">
            問{question.id}
          </span>
          <span className="text-xs text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded">
            {TYPE_LABELS[question.type]}
          </span>
          <span className="text-xs text-gray-500 ml-1">{question.points}点</span>
          <button
            onClick={startEdit}
            className="ml-auto text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded transition-colors"
          >
            編集
          </button>
        </div>

        {/* 問題文 */}
        <div className="px-4 py-3">
          <p className="text-gray-800 whitespace-pre-wrap text-sm leading-relaxed">{question.question_text}</p>
        </div>

        {/* 解答表示 */}
        <div className="px-4 pb-4">
          {question.type === 'journal_entry' && <JournalAnswerView question={question} />}
          {question.type === 'calculation' && <CalcAnswerView question={question} />}
          {question.type === 'multiple_choice' && <ChoiceAnswerView question={question} />}
        </div>
      </div>
    )
  }

  // ---- 編集モード ----
  return (
    <div className="border-2 border-blue-400 rounded-xl bg-blue-50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-blue-100 border-b border-blue-200">
        <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-0.5 rounded">問{draft.id}</span>
        <span className="text-xs font-medium text-blue-700">編集中</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={cancel}
            className="text-xs border border-gray-300 bg-white text-gray-600 px-3 py-1 rounded hover:bg-gray-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={confirm}
            className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors"
          >
            編集完了
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 問題タイプ・配点 */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">問題タイプ</label>
            <select
              value={draft.type}
              onChange={e => set({ type: e.target.value as QuestionType })}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium text-gray-600 mb-1">配点（点）</label>
            <input
              type="number"
              min={1}
              max={20}
              value={draft.points}
              onChange={e => set({ points: parseInt(e.target.value) || 1 })}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        {/* 問題文 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">問題文</label>
          <textarea
            value={draft.question_text}
            onChange={e => set({ question_text: e.target.value })}
            rows={5}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* タイプ別解答編集 */}
        {draft.type === 'journal_entry' && <JournalAnswerEdit draft={draft} set={set} />}
        {draft.type === 'calculation' && <CalcAnswerEdit draft={draft} set={set} />}
        {draft.type === 'multiple_choice' && <ChoiceAnswerEdit draft={draft} set={set} />}
      </div>
    </div>
  )
}

// ---- 仕訳 表示 ----
function JournalAnswerView({ question }: { question: Question }) {
  const raw = question.answer as JournalEntryAnswer | JournalEntryAnswer[] | undefined
  const rows: JournalEntryAnswer[] = Array.isArray(raw) ? raw : raw ? [raw] : []
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 mb-1.5">解答</p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {['借方科目', '借方金額', '貸方科目', '貸方金額'].map(h => (
              <th key={h} className="border border-gray-300 bg-gray-100 px-2 py-1.5 text-center text-xs font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="border border-gray-300 px-2 py-1.5 text-center">{row.debit_account}</td>
              <td className="border border-gray-300 px-2 py-1.5 text-right">{row.debit_amount?.toLocaleString()}</td>
              <td className="border border-gray-300 px-2 py-1.5 text-center">{row.credit_account}</td>
              <td className="border border-gray-300 px-2 py-1.5 text-right">{row.credit_amount?.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- 仕訳 編集 ----
function JournalAnswerEdit({ draft, set }: { draft: Question; set: (p: Partial<Question>) => void }) {
  const raw = draft.answer as JournalEntryAnswer | JournalEntryAnswer[] | undefined
  const rows: JournalEntryAnswer[] = Array.isArray(raw) ? [...raw] : raw ? [raw] : [{ debit_account: '', debit_amount: 0, credit_account: '', credit_amount: 0 }]

  const updateRow = (i: number, field: keyof JournalEntryAnswer, value: string | number) => {
    const next = rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r)
    set({ answer: (next.length === 1 ? next[0] : next) as JournalEntryAnswer })
  }
  const addRow = () => set({ answer: [...rows, { debit_account: '', debit_amount: 0, credit_account: '', credit_amount: 0 }] as unknown as JournalEntryAnswer })
  const removeRow = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i)
    set({ answer: (next.length === 1 ? next[0] : next) as unknown as JournalEntryAnswer })
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">解答（仕訳）</label>
      <table className="w-full border-collapse text-sm mb-2">
        <thead>
          <tr>
            {['借方科目', '借方金額', '貸方科目', '貸方金額', ''].map(h => (
              <th key={h} className="border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-center">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="border border-gray-300 p-1">
                <select value={row.debit_account} onChange={e => updateRow(i, 'debit_account', e.target.value)}
                  className="w-full text-xs bg-white focus:outline-none">
                  <option value="">選択</option>
                  {ACCOUNT_LIST.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </td>
              <td className="border border-gray-300 p-1">
                <input type="number" value={row.debit_amount} onChange={e => updateRow(i, 'debit_amount', parseInt(e.target.value) || 0)}
                  className="w-full text-xs text-right bg-white focus:outline-none" />
              </td>
              <td className="border border-gray-300 p-1">
                <select value={row.credit_account} onChange={e => updateRow(i, 'credit_account', e.target.value)}
                  className="w-full text-xs bg-white focus:outline-none">
                  <option value="">選択</option>
                  {ACCOUNT_LIST.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </td>
              <td className="border border-gray-300 p-1">
                <input type="number" value={row.credit_amount} onChange={e => updateRow(i, 'credit_amount', parseInt(e.target.value) || 0)}
                  className="w-full text-xs text-right bg-white focus:outline-none" />
              </td>
              <td className="border border-gray-300 p-1 text-center">
                {rows.length > 1 && (
                  <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addRow} className="text-xs text-blue-600 hover:underline">+ 行を追加</button>
    </div>
  )
}

// ---- 簿記表コンポーネント ----
function BookkeepingTable({ data, answerMap }: { data: TableData; answerMap?: Record<string, string> }) {
  return (
    <div className="overflow-x-auto">
      <p className="text-xs font-semibold text-gray-700 mb-1">{data.title}</p>
      <table className="border-collapse text-sm w-full">
        <thead>
          <tr>
            {data.headers.map((h, i) => (
              <th
                key={i}
                className="border-2 border-gray-700 bg-gray-200 px-3 py-1.5 text-center text-xs font-bold whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, ri) => {
            // 合計行・完成品行は太字背景
            const isTotal = row.label.includes('合計') || row.label.includes('完成品')
            return (
              <tr key={ri} className={isTotal ? 'bg-gray-50 font-semibold' : ''}>
                <td className="border-2 border-gray-700 px-3 py-1.5 text-left whitespace-nowrap font-medium">
                  {row.label}
                </td>
                {row.values.map((val, vi) => {
                  const isBlank = /^[①-⑳]$/.test(val)
                  const answered = answerMap?.[val]
                  return (
                    <td
                      key={vi}
                      className={`border-2 border-gray-700 px-3 py-1.5 text-right whitespace-nowrap ${
                        isBlank ? 'bg-yellow-50' : ''
                      }`}
                    >
                      {isBlank ? (
                        <span className="font-bold text-blue-700">
                          {answered ? `${val} : ${parseInt(answered).toLocaleString()}` : val}
                        </span>
                      ) : val}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---- 計算問題 表示 ----
function CalcAnswerView({ question }: { question: Question }) {
  if (!question.blanks && !question.table_data) return null

  // 空欄番号→正解値のマップ（表内表示用）
  const answerMap: Record<string, string> = {}
  question.blanks?.forEach(b => {
    answerMap[b.position] = String(b.answer)
  })

  return (
    <div className="space-y-3">
      {question.table_data && (
        <BookkeepingTable data={question.table_data} answerMap={answerMap} />
      )}
      {question.blanks && (
        <div>
          <p className="text-xs font-medium text-gray-400 mb-1.5">解答一覧</p>
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-gray-300 bg-gray-100 px-3 py-1.5 text-xs text-center font-semibold">空欄</th>
                <th className="border border-gray-300 bg-gray-100 px-3 py-1.5 text-xs text-center font-semibold">正解</th>
              </tr>
            </thead>
            <tbody>
              {question.blanks.map((b, i) => (
                <tr key={i}>
                  <td className="border border-gray-300 px-3 py-1.5 text-center font-bold text-blue-700">{b.position}</td>
                  <td className="border border-gray-300 px-3 py-1.5 text-right">
                    {typeof b.answer === 'number' ? b.answer.toLocaleString() : b.answer}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---- 計算問題 編集 ----
function CalcAnswerEdit({ draft, set }: { draft: Question; set: (p: Partial<Question>) => void }) {
  const blanks: CalculationBlank[] = draft.blanks || []

  const updateBlank = (i: number, field: keyof CalculationBlank, value: string | number) => {
    const next = blanks.map((b, idx) => idx === i ? { ...b, [field]: value } : b)
    set({ blanks: next })
  }
  const addBlank = () => set({ blanks: [...blanks, { position: `④`, answer: 0, type: 'number' }] })
  const removeBlank = (i: number) => set({ blanks: blanks.filter((_, idx) => idx !== i) })

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">空欄の解答</label>
      <table className="w-full border-collapse text-sm mb-2">
        <thead>
          <tr>
            <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-xs w-16">空欄記号</th>
            <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-xs">正解</th>
            <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-xs w-20">型</th>
            <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-xs w-8"></th>
          </tr>
        </thead>
        <tbody>
          {blanks.map((b, i) => (
            <tr key={i}>
              <td className="border border-gray-300 p-1">
                <input value={b.position} onChange={e => updateBlank(i, 'position', e.target.value)}
                  className="w-full text-xs text-center bg-white focus:outline-none" />
              </td>
              <td className="border border-gray-300 p-1">
                <input
                  type={b.type === 'number' ? 'number' : 'text'}
                  value={b.answer}
                  onChange={e => updateBlank(i, 'answer', b.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value)}
                  className="w-full text-xs text-right bg-white focus:outline-none"
                />
              </td>
              <td className="border border-gray-300 p-1">
                <select value={b.type} onChange={e => updateBlank(i, 'type', e.target.value)}
                  className="w-full text-xs bg-white focus:outline-none">
                  <option value="number">数値</option>
                  <option value="text">文字</option>
                </select>
              </td>
              <td className="border border-gray-300 p-1 text-center">
                <button onClick={() => removeBlank(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addBlank} className="text-xs text-blue-600 hover:underline">+ 空欄を追加</button>
    </div>
  )
}

// ---- 選択問題 表示 ----
function ChoiceAnswerView({ question }: { question: Question }) {
  if (!question.choices) return null
  return (
    <div className="space-y-1.5">
      {question.choices.map((c, i) => (
        <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border ${
          question.answer === i ? 'bg-green-50 border-green-300 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-600'
        }`}>
          <span className="font-medium">{i + 1}.</span>
          <span>{c}</span>
          {question.answer === i && <span className="ml-auto text-xs font-bold text-green-600">✓ 正解</span>}
        </div>
      ))}
    </div>
  )
}

// ---- 選択問題 編集 ----
function ChoiceAnswerEdit({ draft, set }: { draft: Question; set: (p: Partial<Question>) => void }) {
  const choices = draft.choices || ['', '', '', '']

  const updateChoice = (i: number, val: string) => {
    const next = choices.map((c, idx) => idx === i ? val : c)
    set({ choices: next })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">選択肢</label>
        <div className="space-y-2">
          {choices.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500 w-5">{i + 1}.</span>
              <input
                value={c}
                onChange={e => updateChoice(i, e.target.value)}
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">正解番号</label>
        <div className="flex gap-2">
          {choices.map((_, i) => (
            <button
              key={i}
              onClick={() => set({ answer: i })}
              className={`w-9 h-9 rounded-full text-sm font-bold border transition-colors ${
                draft.answer === i
                  ? 'bg-green-600 text-white border-green-600'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---- メインコンポーネント ----
export default function QuizPreview({ quiz, onUpdateQuestion, onReorder }: Props) {
  const dragIndex = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const handleDragStart = (index: number) => {
    dragIndex.current = index
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOver(index)
  }

  const handleDrop = (dropIndex: number) => {
    if (dragIndex.current === null || dragIndex.current === dropIndex) {
      setDragOver(null)
      return
    }
    const reordered = [...quiz.questions]
    const [moved] = reordered.splice(dragIndex.current, 1)
    reordered.splice(dropIndex, 0, moved)
    // id を連番に振り直し
    const renumbered = reordered.map((q, i) => ({ ...q, id: i + 1 }))
    onReorder(renumbered)
    dragIndex.current = null
    setDragOver(null)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* テストヘッダー */}
      <div className="border-b border-gray-200 pb-4 mb-6">
        <h3 className="text-xl font-bold text-gray-900">{quiz.title}</h3>
        <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
          <span>単元: <strong className="text-gray-700">{quiz.subject}</strong></span>
          <span>時間: <strong className="text-gray-700">{quiz.estimated_minutes}分</strong></span>
          <span>合計: <strong className="text-gray-700">{quiz.total_points}点</strong></span>
          <span>問題数: <strong className="text-gray-700">{quiz.questions.length}問</strong></span>
        </div>
        <p className="text-xs text-gray-400 mt-2">各問題の「編集」ボタンで問題文・解答を修正できます。左端の ⠿ をドラッグして順番を入れ替えられます。</p>
      </div>

      {/* 問題リスト */}
      <div className="space-y-4">
        {quiz.questions.map((q, index) => (
          <div
            key={q.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={e => handleDragOver(e, index)}
            onDrop={() => handleDrop(index)}
            onDragLeave={() => setDragOver(null)}
            className={`transition-all ${dragOver === index ? 'opacity-50 scale-[0.98]' : ''}`}
          >
            <QuestionCard
              question={q}
              onUpdate={updated => onUpdateQuestion(index, updated)}
              dragHandleProps={{}}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
