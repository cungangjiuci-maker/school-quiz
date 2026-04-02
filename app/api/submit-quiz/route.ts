import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Question, StudentAnswer, GradingDetail, JournalEntryAnswer } from '@/types'

function gradeQuestion(question: Question, answer: StudentAnswer): GradingDetail {
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

    // 各正解行が生徒の回答に含まれているかチェック
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
    if (!question.blanks) return { ...base, is_correct: false, earned_points: 0 }

    const userBlanks = answer.blanks || {}
    const totalBlanks = question.blanks.length
    let correctCount = 0

    question.blanks.forEach(blank => {
      const userAnswer = userBlanks[blank.position]
      if (blank.type === 'number') {
        if (parseInt(userAnswer) === blank.answer) correctCount++
      } else {
        if (userAnswer?.trim() === String(blank.answer).trim()) correctCount++
      }
    })

    const isCorrect = correctCount === totalBlanks
    // 部分点: 全問正解のみ満点、それ以外は部分的に点数
    const earnedPoints = totalBlanks > 0
      ? Math.round((correctCount / totalBlanks) * question.points)
      : 0

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
    // キーワードマッチで部分採点
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
  const { quiz_id, student_name, student_number, answers, questions } = await request.json()

  const gradingDetails: GradingDetail[] = questions.map((q: Question) =>
    gradeQuestion(q, answers[q.id] || { type: q.type })
  )

  const score = gradingDetails.reduce((sum, d) => sum + d.earned_points, 0)
  const totalPoints = questions.reduce((sum: number, q: Question) => sum + q.points, 0)

  const supabase = await createClient()

  // 生徒を作成または取得
  let studentId: string
  const { data: existingStudent } = await supabase
    .from('students')
    .select('id')
    .eq('student_number', student_number)
    .eq('name', student_name)
    .single()

  if (existingStudent) {
    studentId = existingStudent.id
  } else {
    const { data: newStudent, error: studentError } = await supabase
      .from('students')
      .insert({ name: student_name, student_number })
      .select()
      .single()
    if (studentError || !newStudent) {
      return NextResponse.json({ error: '生徒情報の保存に失敗しました' }, { status: 500 })
    }
    studentId = newStudent.id
  }

  // 回答を保存
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
    console.error('Answer save error:', answerError)
  }

  return NextResponse.json({ score, total_points: totalPoints, grading_details: gradingDetails })
}
