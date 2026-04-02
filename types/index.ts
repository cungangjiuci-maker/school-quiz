export type QuestionType = 'journal_entry' | 'calculation' | 'multiple_choice' | 'description'

export interface JournalEntryAnswer {
  debit_account: string
  debit_amount: number
  credit_account: string
  credit_amount: number
}

export interface CalculationBlank {
  position: string
  answer: number | string
  type: 'number' | 'text'
}

export interface TableData {
  title: string
  headers: string[]
  rows: { label: string; values: string[] }[]
}

export interface Question {
  id: number
  type: QuestionType
  question_text: string
  points: number
  // journal_entry: 単一または複数行
  answer?: JournalEntryAnswer | JournalEntryAnswer[] | number | string
  // calculation
  blanks?: CalculationBlank[]
  table_data?: TableData
  // multiple_choice
  choices?: string[]
  // description
  keywords?: string[]
}

export interface Quiz {
  id: string
  teacher_id: string
  title: string
  subject: string
  code: string
  estimated_minutes: number
  total_points: number
  questions: Question[]
  is_active: boolean
  created_at: string
}

export interface Student {
  id: string
  name: string
  student_number: string
  created_at: string
}

export interface AnswerRecord {
  id: string
  quiz_id: string
  student_id: string
  student_name: string
  student_number: string
  answers: Record<string, StudentAnswer>
  score: number
  total_points: number
  grading_details: GradingDetail[]
  submitted_at: string
}

export interface StudentAnswer {
  type: QuestionType
  // journal_entry
  rows?: JournalEntryRow[]
  // calculation
  blanks?: Record<string, string>
  // multiple_choice
  selected?: number
  // description
  text?: string
}

export interface JournalEntryRow {
  debit_account: string
  debit_amount: string
  credit_account: string
  credit_amount: string
}

export interface GradingDetail {
  question_id: number
  is_correct: boolean
  earned_points: number
  max_points: number
  student_answer: unknown
  correct_answer: unknown
}

export interface GenerateQuizRequest {
  content: string
  difficulty: 'easy' | 'normal' | 'hard'
  estimated_minutes: number
  question_types: QuestionType[]
  notes: string
}

export interface GenerateQuizResponse {
  title: string
  subject: string
  estimated_minutes: number
  total_points: number
  questions: Question[]
}
