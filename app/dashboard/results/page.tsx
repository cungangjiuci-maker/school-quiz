import { createClient } from '@/lib/supabase/server'
import ResultsClient from '@/components/ResultsClient'

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: { quiz_id?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 教員のクイズ一覧
  const { data: quizzes } = await supabase
    .from('quizzes')
    .select('id, title, code, subject, total_points, created_at')
    .eq('teacher_id', user!.id)
    .order('created_at', { ascending: false })

  // 選択されたquizの回答
  const selectedQuizId = searchParams.quiz_id || quizzes?.[0]?.id
  let answers = null

  if (selectedQuizId) {
    const { data } = await supabase
      .from('answers')
      .select('*')
      .eq('quiz_id', selectedQuizId)
      .order('submitted_at', { ascending: true })
    answers = data
  }

  return (
    <ResultsClient
      quizzes={quizzes || []}
      answers={answers || []}
      selectedQuizId={selectedQuizId || ''}
    />
  )
}
