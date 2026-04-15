import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Question } from '@/types'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')

  if (!code || code.length !== 4) {
    return NextResponse.json({ error: 'codeパラメータが不正です' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('quizzes')
    .select('*')
    .eq('code', code)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'テストが見つかりません。コードを確認してください。' }, { status: 404 })
  }

  // 診断ログ：DBから取得した計算問題のblanksを確認
  const questions: Question[] = data.questions ?? []
  const calcQuestions = questions.filter(q => q.type === 'calculation')
  if (calcQuestions.length > 0) {
    console.log('[quiz-api] 計算問題のDB保存状態:',
      JSON.stringify(calcQuestions.map(q => ({
        id: q.id,
        blanks: q.blanks ?? null,
        blanks_count: Array.isArray(q.blanks) ? q.blanks.length : 0,
        has_table_data: !!q.table_data,
      })))
    )
  }

  return NextResponse.json(data)
}
