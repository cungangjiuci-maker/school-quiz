'use client'

import { useState } from 'react'
import { Quiz, StudentAnswer, JournalEntryRow, TableData } from '@/types'

interface Props {
  quiz: Quiz
  accountList: string[]
  onSubmit: (answers: Record<string, StudentAnswer>) => void
  loading: boolean
}

// ---- 生徒用 簿記表コンポーネント ----
function QuizTable({
  data,
  blanks,
  onInput,
  blankDefs,
}: {
  data: TableData
  blanks: Record<string, string>
  onInput: (position: string, value: string) => void
  blankDefs: { position: string; type: string }[]
}) {
  const blankTypeMap: Record<string, string> = {}
  blankDefs.forEach(b => { blankTypeMap[b.position] = b.type })

  return (
    <div className="overflow-x-auto">
      <p className="text-xs font-semibold text-gray-700 mb-2">{data.title}</p>
      <table className="border-collapse text-sm w-full">
        <thead>
          <tr>
            {(data.headers ?? []).map((h, i) => (
              <th key={i} className="border-2 border-gray-700 bg-gray-200 px-2 py-1.5 text-center text-xs font-bold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(data.rows ?? []).map((row, ri) => {
            const isTotal = (row.label ?? '').includes('合計') || (row.label ?? '').includes('完成品')
            return (
              <tr key={ri} className={isTotal ? 'bg-gray-50 font-semibold' : ''}>
                <td className="border-2 border-gray-700 px-2 py-1.5 text-left whitespace-nowrap text-xs font-medium">
                  {row.label}
                </td>
                {(row.values ?? []).map((val, vi) => {
                  const isBlank = /^[①-⑳]$/.test(val)
                  return (
                    <td key={vi} className={`border-2 border-gray-700 px-1 py-1 text-right ${isBlank ? 'bg-yellow-50' : ''}`}>
                      {isBlank ? (
                        <div className="flex items-center gap-1 justify-end">
                          <span className="text-xs font-bold text-blue-700">{val}</span>
                          <input
                            key={val}
                            type="text"
                            inputMode={blankTypeMap[val] === 'number' ? 'numeric' : 'text'}
                            value={blanks[val] ?? ''}
                            onChange={e => onInput(val, e.target.value)}
                            placeholder={val}
                            style={{ border: '2px solid #333', padding: '6px', fontSize: '14px', width: '80px', backgroundColor: 'white', textAlign: 'right' }}
                          />
                        </div>
                      ) : (
                        <span className="text-xs px-1">{val}</span>
                      )}
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

export default function QuizTaker({ quiz, accountList, onSubmit, loading }: Props) {
  // 仕訳・選択・記述の回答state
  const [studentAnswers, setStudentAnswers] = useState<Record<string, StudentAnswer>>(() => {
    const initial: Record<string, StudentAnswer> = {}
    quiz.questions.forEach(q => {
      const key = String(q.id)
      if (q.type === 'journal_entry') {
        initial[key] = {
          type: 'journal_entry',
          rows: [{ debit_account: '', debit_amount: '', credit_account: '', credit_amount: '' }],
        }
      } else if (q.type === 'multiple_choice') {
        initial[key] = { type: 'multiple_choice', selected: undefined }
      } else if (q.type === 'description') {
        initial[key] = { type: 'description', text: '' }
      }
    })
    return initial
  })

  // 計算問題専用state: answers[question.id][blank.position] = 入力値
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({})

  const [currentQ, setCurrentQ] = useState(0)

  const updateStudentAnswer = (qId: number, update: Partial<StudentAnswer>) => {
    const key = String(qId)
    setStudentAnswers(prev => ({ ...prev, [key]: { ...prev[key], ...update } }))
  }

  const addJournalRow = (qId: number) => {
    const current = studentAnswers[String(qId)]
    if (current?.type !== 'journal_entry') return
    updateStudentAnswer(qId, {
      rows: [...(current.rows || []), { debit_account: '', debit_amount: '', credit_account: '', credit_amount: '' }],
    })
  }

  const removeJournalRow = (qId: number, rowIndex: number) => {
    const current = studentAnswers[String(qId)]
    if (current?.type !== 'journal_entry') return
    const rows = (current.rows || []).filter((_, i) => i !== rowIndex)
    updateStudentAnswer(qId, { rows })
  }

  const updateJournalRow = (qId: number, rowIndex: number, field: keyof JournalEntryRow, value: string) => {
    const current = studentAnswers[String(qId)]
    if (current?.type !== 'journal_entry') return
    const rows = [...(current.rows || [])]
    rows[rowIndex] = { ...rows[rowIndex], [field]: value }
    updateStudentAnswer(qId, { rows })
  }

  const q = quiz.questions[currentQ]
  const answer = q ? studentAnswers[String(q.id)] : undefined
  const isLast = currentQ === quiz.questions.length - 1

  const handleSubmitAll = () => {
    // 計算問題のanswersをStudentAnswer形式に変換してマージ
    const finalAnswers: Record<string, StudentAnswer> = { ...studentAnswers }
    quiz.questions.forEach(question => {
      if (question.type === 'calculation') {
        finalAnswers[String(question.id)] = {
          type: 'calculation',
          blanks: answers[String(question.id)] ?? {},
        }
      }
    })
    onSubmit(finalAnswers)
  }

  if (!q) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="font-bold text-gray-900 text-sm truncate">{quiz.title}</h1>
            <span className="text-sm text-gray-500">{currentQ + 1}/{quiz.questions.length}</span>
          </div>
          <div className="mt-2 bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all"
              style={{ width: `${((currentQ + 1) / quiz.questions.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-blue-600 text-white text-sm font-bold px-2.5 py-0.5 rounded">
              問{q.id}
            </span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {q.type === 'journal_entry' ? '仕訳問題' :
               q.type === 'calculation' ? '計算問題' :
               q.type === 'multiple_choice' ? '選択問題' : '記述問題'}
            </span>
            <span className="text-xs text-gray-500 ml-auto">{q.points}点</span>
          </div>
          <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{q.question_text}</p>
        </div>

        {/* 仕訳問題 */}
        {q.type === 'journal_entry' && answer?.type === 'journal_entry' && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-medium text-gray-700 mb-3 text-sm">仕訳を記入してください</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="border border-gray-300 bg-gray-50 px-2 py-1.5 text-center text-xs">借方科目</th>
                    <th className="border border-gray-300 bg-gray-50 px-2 py-1.5 text-center text-xs">借方金額</th>
                    <th className="border border-gray-300 bg-gray-50 px-2 py-1.5 text-center text-xs">貸方科目</th>
                    <th className="border border-gray-300 bg-gray-50 px-2 py-1.5 text-center text-xs">貸方金額</th>
                    <th className="border border-gray-300 bg-gray-50 px-1 py-1.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {(answer.rows || []).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      <td className="border border-gray-300 p-1">
                        <select
                          value={row.debit_account}
                          onChange={e => updateJournalRow(q.id, rowIndex, 'debit_account', e.target.value)}
                          className="w-full text-xs border-0 focus:ring-0 focus:outline-none bg-transparent"
                        >
                          <option value="">選択</option>
                          {accountList.map(acc => <option key={acc} value={acc}>{acc}</option>)}
                        </select>
                      </td>
                      <td className="border border-gray-300 p-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.debit_amount}
                          onChange={e => updateJournalRow(q.id, rowIndex, 'debit_amount', e.target.value)}
                          className="w-full text-xs text-right border-0 focus:ring-0 focus:outline-none"
                          placeholder="0"
                        />
                      </td>
                      <td className="border border-gray-300 p-1">
                        <select
                          value={row.credit_account}
                          onChange={e => updateJournalRow(q.id, rowIndex, 'credit_account', e.target.value)}
                          className="w-full text-xs border-0 focus:ring-0 focus:outline-none bg-transparent"
                        >
                          <option value="">選択</option>
                          {accountList.map(acc => <option key={acc} value={acc}>{acc}</option>)}
                        </select>
                      </td>
                      <td className="border border-gray-300 p-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.credit_amount}
                          onChange={e => updateJournalRow(q.id, rowIndex, 'credit_amount', e.target.value)}
                          className="w-full text-xs text-right border-0 focus:ring-0 focus:outline-none"
                          placeholder="0"
                        />
                      </td>
                      <td className="border border-gray-300 p-1 text-center">
                        {(answer.rows || []).length > 1 && (
                          <button
                            onClick={() => removeJournalRow(q.id, rowIndex)}
                            className="text-red-400 hover:text-red-600 text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={() => addJournalRow(q.id)}
              className="mt-3 text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              + 行を追加
            </button>
          </div>
        )}

        {/* 計算問題 ― answers[String(question.id)][blank.position] で直接管理 */}
        {q.type === 'calculation' && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            {/* 簿記表あり */}
            {q.table_data && (
              <QuizTable
                data={q.table_data}
                blanks={answers[String(q.id)] ?? {}}
                onInput={(pos, val) => {
                  setAnswers(prev => ({
                    ...prev,
                    [String(q.id)]: { ...(prev[String(q.id)] || {}), [pos]: val },
                  }))
                }}
                blankDefs={q.blanks ?? []}
              />
            )}
            {/* 表なし・空欄定義あり：通常空欄入力 */}
            {!q.table_data && Array.isArray(q.blanks) && q.blanks.length > 0 && (
              <>
                <h3 className="font-medium text-gray-700 text-sm">空欄を埋めてください</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {q.blanks.map(blank => (
                    <div key={blank.position} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 'bold', color: '#1d4ed8', minWidth: '24px' }}>
                        {blank.position}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={answers[String(q.id)]?.[blank.position] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value
                          setAnswers(prev => ({
                            ...prev,
                            [String(q.id)]: {
                              ...(prev[String(q.id)] || {}),
                              [blank.position]: val,
                            },
                          }))
                        }}
                        placeholder={blank.position}
                        style={{ border: '2px solid #333', padding: '8px', fontSize: '16px', width: '100%', backgroundColor: 'white' }}
                      />
                      {blank.type === 'number' && (
                        <span style={{ fontSize: '14px', color: '#6b7280' }}>円</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            {/* 表なし・空欄定義なし：フォールバック入力欄 */}
            {!q.table_data && (!Array.isArray(q.blanks) || q.blanks.length === 0) && (
              <>
                <h3 className="font-medium text-gray-700 text-sm">計算結果を入力してください</h3>
                <input
                  type="text"
                  inputMode="numeric"
                  value={answers[String(q.id)]?.['①'] ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setAnswers(prev => ({
                      ...prev,
                      [String(q.id)]: { ...(prev[String(q.id)] || {}), '①': val },
                    }))
                  }}
                  placeholder="答えを入力"
                  style={{ border: '2px solid #333', padding: '12px', fontSize: '16px', width: '100%', backgroundColor: 'white', borderRadius: '6px' }}
                />
              </>
            )}
          </div>
        )}

        {/* 選択問題 */}
        {q.type === 'multiple_choice' && answer?.type === 'multiple_choice' && q.choices && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-medium text-gray-700 mb-3 text-sm">正しいものを選んでください</h3>
            <div className="space-y-2">
              {q.choices.map((choice, i) => (
                <label
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    answer.selected === i ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    value={i}
                    checked={answer.selected === i}
                    onChange={() => updateStudentAnswer(q.id, { selected: i })}
                    className="text-blue-600"
                  />
                  <span className="text-sm text-gray-800">{i + 1}. {choice}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 記述問題 */}
        {q.type === 'description' && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-medium text-gray-700 mb-3 text-sm">答えを記述してください</h3>
            <textarea
              value={studentAnswers[String(q.id)]?.text ?? ''}
              onChange={e => updateStudentAnswer(q.id, { text: e.target.value })}
              rows={4}
              className="w-full border-2 border-gray-300 rounded-lg px-3 py-3 text-base focus:outline-none focus:border-blue-500"
              placeholder="答えを入力してください"
            />
          </div>
        )}

        {/* ナビゲーション */}
        <div className="flex gap-3 mt-6">
          {currentQ > 0 && (
            <button
              onClick={() => setCurrentQ(c => c - 1)}
              className="flex-1 border border-gray-300 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition-colors"
            >
              ← 前の問題
            </button>
          )}
          {!isLast ? (
            <button
              onClick={() => setCurrentQ(c => c + 1)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors"
            >
              次の問題 →
            </button>
          ) : (
            <button
              onClick={handleSubmitAll}
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition-colors"
            >
              {loading ? '採点中...' : '提出する'}
            </button>
          )}
        </div>

        {/* 問題一覧 */}
        <div className="mt-6 flex gap-2 flex-wrap justify-center">
          {quiz.questions.map((question, i) => (
            <button
              key={question.id}
              onClick={() => setCurrentQ(i)}
              className={`w-8 h-8 rounded-full text-sm font-bold transition-colors ${
                i === currentQ
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              {question.id}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
