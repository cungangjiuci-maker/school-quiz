import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Question, StudentAnswer, GradingDetail, JournalEntryAnswer } from '@/types'

/**
 * 金額を正規化して整数に変換する。
 * 以下はすべて数値の 0 として扱う（採点で「空欄」と同一視）:
 *   null / undefined / "" / "0" / 0 / 全角数字 / 全角カンマ / 半角カンマ付き
 */
function normalizeAmount(val: number | string | undefined | null): number {
  if (val === null || val === undefined) return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  const s = val.trim()
  if (s === '' || s === '0') return 0          // 空欄・"0" を明示的に短絡
  const normalized = s
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[，,]/g, '')
  const n = parseInt(normalized)
  return isNaN(n) ? 0 : n
}

/**
 * 勘定科目を正規化する。
 * null / undefined / "" はすべて空文字列（空欄）として同一視する。
 */
function normalizeAccount(val: string | undefined | null): string {
  return val?.trim() ?? ''
}

// 計算問題の string 入力専用（normalizeAmount の string 版エイリアス）
function parseAmount(val: string | undefined | null): number {
  return normalizeAmount(val)
}

/**
 * 計算問題の空欄回答を数値に正規化する。
 * 以下をすべて同じ数値として正解判定できるようにする：
 *   半角: 1000  /  半角カンマ: 1,000
 *   全角: １０００  /  全角カンマ: １，０００
 */
function normalizeNumber(val: string | undefined | null): number {
  if (val === null || val === undefined) return 0
  const s = String(val).trim()
  if (s === '') return 0
  const normalized = s
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[，,]/g, '')
  const n = parseInt(normalized, 10)
  return isNaN(n) ? 0 : n
}

// Cookie依存のセッションを使わず、anonキーで直接クライアントを作成する。
// これにより先生のPCセッションの有無に関わらず、常にanonロールで動作する。
function createSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function gradeQuestion(question: Question, answer: StudentAnswer): GradingDetail {
  // 【診断ログ】採点対象の問題データを出力
  if (question.type === 'calculation') {
    console.log(`[gradeQuestion] 計算問題 id=${question.id}`, JSON.stringify({
      blanks: question.blanks,
      table_data_exists: !!question.table_data,
      answer_received: answer,
    }))
  }

  const base: Omit<GradingDetail, 'is_correct' | 'earned_points'> = {
    question_id: question.id,
    max_points: question.points,
    student_answer: answer,
    correct_answer: question.answer ?? question.blanks ?? question.choices,
  }

  if (question.type === 'journal_entry' && answer.type === 'journal_entry') {
    const rows = answer.rows || []
    const rawAnswer = question.answer as JournalEntryAnswer | JournalEntryAnswer[] | undefined
    const allCorrectAnswers: JournalEntryAnswer[] = Array.isArray(rawAnswer) ? rawAnswer : rawAnswer ? [rawAnswer] : []

    // ── フィラー行の除外 ────────────────────────────────────────
    // 借方・貸方どちらの金額も 0（空欄相当）の行は照合不要なフィラー行として除く。
    // AI が生成した {debit_amount: 0, credit_amount: 0} や
    // Supabase から文字列で来た {debit_amount: "0", credit_amount: "0"} も除外できる。
    const correctAnswers = allCorrectAnswers.filter(c =>
      normalizeAmount(c.debit_amount) !== 0 || normalizeAmount(c.credit_amount) !== 0
    )

    // ── 診断ログ ────────────────────────────────────────────────
    console.log(`[journal_entry] 問${question.id} 正解行(フィラー除外後):`,
      JSON.stringify(correctAnswers.map(c => ({
        debit:  normalizeAccount(c.debit_account),
        dAmt:   normalizeAmount(c.debit_amount),
        credit: normalizeAccount(c.credit_account),
        cAmt:   normalizeAmount(c.credit_amount),
      })))
    )
    console.log(`[journal_entry] 問${question.id} 生徒の行:`,
      JSON.stringify(rows.map(r => ({
        debit:  normalizeAccount(r.debit_account),
        dAmt:   normalizeAmount(r.debit_amount),
        credit: normalizeAccount(r.credit_account),
        cAmt:   normalizeAmount(r.credit_amount),
      })))
    )

    // ── 行の順序に依存しない一致判定（every + some） ──────────────
    // 正解の各行について、生徒の行の中に一致するものが1つでもあればOK。
    // 金額比較: normalizeAmount で両辺を正規化 → null/""/0/"0" はすべて 0 として同一視
    // 科目比較: normalizeAccount で両辺を正規化 → null/undefined/"" はすべて空欄として同一視
    const isCorrect = correctAnswers.length > 0 && correctAnswers.every(correct => {
      const cDebitAmt   = normalizeAmount(correct.debit_amount)
      const cCreditAmt  = normalizeAmount(correct.credit_amount)
      const cDebitAcc   = normalizeAccount(correct.debit_account)
      const cCreditAcc  = normalizeAccount(correct.credit_account)

      const matched = rows.some(row =>
        normalizeAccount(row.debit_account)  === cDebitAcc  &&
        normalizeAccount(row.credit_account) === cCreditAcc &&
        normalizeAmount(row.debit_amount)    === cDebitAmt  &&
        normalizeAmount(row.credit_amount)   === cCreditAmt
      )

      if (!matched) {
        console.log(`[journal_entry] 問${question.id} 不一致: 正解行 {debit:${cDebitAcc} ${cDebitAmt}, credit:${cCreditAcc} ${cCreditAmt}} に対応する生徒行なし`)
      }
      return matched
    })

    console.log(`[journal_entry] 問${question.id} 結果: isCorrect=${isCorrect}`)

    return {
      ...base,
      correct_answer: correctAnswers,
      is_correct: isCorrect,
      earned_points: isCorrect ? question.points : 0,
    }
  }

  if (question.type === 'calculation' && answer.type === 'calculation') {
    // blanksが未定義または空の場合：correct_answerを明示的にセットして早期リターン
    if (!question.blanks || !Array.isArray(question.blanks) || question.blanks.length === 0) {
      console.warn(`[gradeQuestion] 計算問題 id=${question.id} のblanksが未定義または空です`)
      return {
        ...base,
        correct_answer: question.blanks ?? null,
        is_correct: false,
        earned_points: 0,
      }
    }

    const userBlanks = answer.blanks || {}
    const totalBlanks = question.blanks.length
    let correctCount = 0

    question.blanks.forEach(blank => {
      const userAnswer = userBlanks[blank.position]
      const normalizedUser = normalizeNumber(String(userAnswer ?? ''))
      const normalizedCorrect = Number(blank.answer)
      console.log(`[gradeQuestion] id=${question.id} 空欄${blank.position}: 正解=${normalizedCorrect}, 生徒回答="${userAnswer}" → 正規化後=${normalizedUser}`)
      if (blank.type === 'number') {
        if (normalizedUser === normalizedCorrect) correctCount++
      } else {
        if (userAnswer?.trim() === String(blank.answer).trim()) correctCount++
      }
    })

    const isCorrect = correctCount === totalBlanks
    const earnedPoints = totalBlanks > 0
      ? Math.round((correctCount / totalBlanks) * question.points)
      : 0

    console.log(`[gradeQuestion] id=${question.id} 結果: ${correctCount}/${totalBlanks}正解, isCorrect=${isCorrect}, earnedPoints=${earnedPoints}`)

    return {
      ...base,
      correct_answer: question.blanks,
      is_correct: isCorrect,
      earned_points: earnedPoints,
    }
  }

  if (question.type === 'multiple_choice' && answer.type === 'multiple_choice') {
    const isCorrect = answer.selected === question.answer
    return {
      ...base,
      correct_answer: question.answer,
      is_correct: isCorrect,
      earned_points: isCorrect ? question.points : 0,
    }
  }

  if (question.type === 'description' && answer.type === 'description') {
    const keywords = question.keywords || []
    if (keywords.length === 0) {
      return { ...base, is_correct: false, earned_points: 0 }
    }
    const text = (answer.text || '').toLowerCase()
    const matched = keywords.filter(kw => text.includes(kw.toLowerCase())).length
    const isCorrect = matched === keywords.length
    const earnedPoints = Math.round((matched / keywords.length) * question.points)
    return { ...base, correct_answer: keywords, is_correct: isCorrect, earned_points: earnedPoints }
  }

  return { ...base, is_correct: false, earned_points: 0 }
}

export async function POST(request: NextRequest) {
  let body: { quiz_id?: string; student_name?: string; student_number?: string; answers?: Record<string, StudentAnswer>; questions?: Question[] }

  try {
    body = await request.json()
  } catch (e) {
    console.error('Request parse error:', e)
    return NextResponse.json({ error: 'リクエストの解析に失敗しました' }, { status: 400 })
  }

  const { quiz_id, student_name, student_number, answers, questions } = body

  if (!questions || !Array.isArray(questions)) {
    return NextResponse.json({ error: '問題データが不正です' }, { status: 400 })
  }

  // 【診断ログ】受信データを確認
  console.log('[submit-quiz] 受信questions(計算問題):', JSON.stringify(
    questions.filter((q: Question) => q.type === 'calculation').map((q: Question) => ({
      id: q.id,
      id_type: typeof q.id,
      blanks: q.blanks,
      blanks_is_array: Array.isArray(q.blanks),
      blanks_length: Array.isArray(q.blanks) ? q.blanks.length : 'N/A',
    }))
  ))
  console.log('[submit-quiz] 受信answers keys:', Object.keys(answers ?? {}))
  console.log('[submit-quiz] 受信answers(計算):', JSON.stringify(
    Object.entries(answers ?? {}).filter(([, v]) => (v as StudentAnswer).type === 'calculation')
  ))

  // 採点（Supabase不要・クラッシュしない）
  let gradingDetails: GradingDetail[]
  try {
    gradingDetails = questions.map((q: Question) => {
      // answersのキーは文字列（JSON化により）、q.idは数値なので両方試す
      const answer = answers?.[String(q.id)] ?? answers?.[q.id as unknown as string] ?? { type: q.type }
      console.log(`[submit-quiz] 問${q.id}(${q.type}) answer取得: key="${String(q.id)}", found=${answer !== undefined && (answer as StudentAnswer).type !== q.type ? 'yes' : answer !== undefined ? 'yes(default?)' : 'no'}`)
      return gradeQuestion(q, answer as StudentAnswer)
    })
  } catch (e) {
    console.error('Grading error:', e)
    return NextResponse.json({ error: '採点処理中にエラーが発生しました: ' + String(e) }, { status: 500 })
  }

  const score = gradingDetails.reduce((sum, d) => sum + d.earned_points, 0)
  const totalPoints = questions.reduce((sum: number, q: Question) => sum + q.points, 0)

  // Supabaseへの保存（失敗しても採点結果は返す）
  let saveError: string | null = null
  // デバッグ情報をレスポンスに含めてフロントエンドで確認できるようにする
  const saveDebug: Record<string, unknown> = {
    student_name,
    student_number,
    quiz_id,
  }

  try {
    const supabase = createSupabaseClient()
    console.log('[submit-quiz] Supabase クライアント初期化完了, URL:', process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30))

    // ---- students: まず SELECT で検索、なければ INSERT ----
    // upsert は students テーブルに unique constraint がないと動作しないため、
    // SELECT → INSERT の2段階方式に変更する。
    let studentId: string | null = null

    // Step 1: student_number + name で既存生徒を検索
    const { data: existingStudent, error: selectError } = await supabase
      .from('students')
      .select('id')
      .eq('student_number', student_number)
      .eq('name', student_name)
      .maybeSingle()

    if (selectError) {
      console.error('[submit-quiz] students SELECT エラー:', JSON.stringify({
        code: selectError.code,
        message: selectError.message,
        hint: (selectError as { hint?: string }).hint,
        details: (selectError as { details?: string }).details,
      }))
      saveDebug.students_select_error = {
        code: selectError.code,
        message: selectError.message,
        hint: (selectError as { hint?: string }).hint,
      }
    } else if (existingStudent) {
      studentId = existingStudent.id
      console.log('[submit-quiz] 既存生徒を取得:', studentId)
      saveDebug.students_result = 'select_found'
    }

    // Step 2: 見つからなかった場合は INSERT で新規作成
    if (!studentId) {
      const { data: newStudent, error: insertError } = await supabase
        .from('students')
        .insert({ name: student_name, student_number })
        .select('id')
        .single()

      if (insertError) {
        console.error('[submit-quiz] students INSERT エラー:', JSON.stringify({
          code: insertError.code,
          message: insertError.message,
          hint: (insertError as { hint?: string }).hint,
          details: (insertError as { details?: string }).details,
        }))
        saveDebug.students_insert_error = {
          code: insertError.code,
          message: insertError.message,
          hint: (insertError as { hint?: string }).hint,
          details: (insertError as { details?: string }).details,
        }
        // INSERT が重複エラー(23505)の場合、student_number のみで再 SELECT を試みる
        if (insertError.code === '23505') {
          const { data: retryStudent, error: retryError } = await supabase
            .from('students')
            .select('id')
            .eq('student_number', student_number)
            .maybeSingle()
          if (!retryError && retryStudent) {
            studentId = retryStudent.id
            console.log('[submit-quiz] 重複INSERT後の再SELECT で生徒を取得:', studentId)
            saveDebug.students_result = 'insert_conflict_retry_select'
          } else {
            saveDebug.students_retry_error = retryError ? { code: retryError.code, message: retryError.message } : 'not_found'
          }
        }
      } else if (newStudent) {
        studentId = newStudent.id
        console.log('[submit-quiz] 新規生徒を登録:', studentId)
        saveDebug.students_result = 'insert_success'
      }
    }

    if (!studentId) {
      const msg = 'student_id を取得できませんでした（students テーブルの SELECT/INSERT が失敗しています）'
      console.error('[submit-quiz]', msg)
      saveError = msg
      saveDebug.students_result = saveDebug.students_result ?? 'failed'
    }

    // ---- answers: insert（studentId が必須）----
    const answerPayload: Record<string, unknown> = {
      quiz_id,
      student_id: studentId,   // NOT NULL なので必ず設定（null の場合は上で saveError をセット済み）
      student_name,
      student_number,
      answers,
      score,
      total_points: totalPoints,
      grading_details: gradingDetails,
    }

    // studentId が取れなかった場合は NOT NULL 違反になるためスキップ
    if (!studentId) {
      console.error('[submit-quiz] studentId が null のため answers insert をスキップします')
      saveDebug.answers_result = 'skipped_no_student_id'
    } else {
      console.log('[submit-quiz] answers insert 試行:', JSON.stringify({
        quiz_id,
        student_name,
        student_number,
        student_id: studentId,
        score,
        total_points: totalPoints,
      }))

      const { error: answerError } = await supabase.from('answers').insert(answerPayload)

      if (answerError) {
        console.error('[submit-quiz] answers insert エラー:', JSON.stringify({
          code: answerError.code,
          message: answerError.message,
          hint: (answerError as { hint?: string }).hint,
          details: (answerError as { details?: string }).details,
        }))
        saveError = `回答保存エラー [${answerError.code}]: ${answerError.message}`
        saveDebug.answers_insert_error = {
          code: answerError.code,
          message: answerError.message,
          hint: (answerError as { hint?: string }).hint,
          details: (answerError as { details?: string }).details,
        }
      } else {
        console.log('[submit-quiz] answers insert 成功 (student_id:', studentId, ')')
        saveDebug.answers_result = 'insert_success'
      }
    }
  } catch (dbError) {
    const msg = dbError instanceof Error ? dbError.message : String(dbError)
    console.error('[submit-quiz] 予期しないDBエラー:', msg)
    saveError = `データベース例外: ${msg}`
    saveDebug.unexpected_error = msg
  }

  if (saveError) {
    console.warn('[submit-quiz] 保存失敗（採点結果は返します）:', saveError, JSON.stringify(saveDebug))
  }

  return NextResponse.json({
    score,
    total_points: totalPoints,
    grading_details: gradingDetails,
    save_error: saveError,
    save_debug: saveDebug,
  })
}
