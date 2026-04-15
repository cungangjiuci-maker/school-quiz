import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Question, StudentAnswer, GradingDetail, JournalEntryAnswer } from '@/types'

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
    const correctAnswers: JournalEntryAnswer[] = Array.isArray(rawAnswer) ? rawAnswer : rawAnswer ? [rawAnswer] : []

    const isCorrect = correctAnswers.length > 0 && correctAnswers.every(correct => {
      return rows.some(row =>
        row.debit_account === correct.debit_account &&
        parseInt(row.debit_amount) === correct.debit_amount &&
        row.credit_account === correct.credit_account &&
        parseInt(row.credit_amount) === correct.credit_amount
      )
    })

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
      console.log(`[gradeQuestion] id=${question.id} 空欄${blank.position}: 正解=${blank.answer}, 生徒回答="${userAnswer}", parseInt=${parseInt(userAnswer)}`)
      if (blank.type === 'number') {
        if (parseInt(userAnswer) === blank.answer) correctCount++
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
  try {
    const supabase = await createClient()

    // 生徒を作成または取得
    let studentId: string | null = null
    const { data: existingStudent, error: findError } = await supabase
      .from('students')
      .select('id')
      .eq('student_number', student_number)
      .eq('name', student_name)
      .single()

    if (findError) {
      console.log('Student lookup failed (may not exist yet):', findError.message)
    }

    if (existingStudent) {
      studentId = existingStudent.id
    } else {
      const { data: newStudent, error: insertError } = await supabase
        .from('students')
        .insert({ name: student_name, student_number })
        .select()
        .single()

      if (insertError || !newStudent) {
        console.error('Student insert failed:', insertError?.message)
        // 保存失敗しても採点結果は返す（studentIdはnullのまま）
      } else {
        studentId = newStudent.id
      }
    }

    // 回答を保存（studentIdがあれば保存、なくてもOK）
    if (studentId) {
      const { error: answerError } = await supabase.from('answers').insert({
        quiz_id,
        student_id: studentId,
        student_name,
        student_number,
        answers,
        score,
        total_points: totalPoints,
        grading_details: gradingDetails,
      })
      if (answerError) {
        console.error('Answer save error:', answerError.message)
      }
    }
  } catch (dbError) {
    // DB保存失敗は無視してスコアだけ返す
    console.error('Database error (non-fatal):', dbError)
  }

  return NextResponse.json({ score, total_points: totalPoints, grading_details: gradingDetails })
}
