import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { GenerateQuizRequest } from '@/types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const body: GenerateQuizRequest = await request.json()
  const { content, difficulty, estimated_minutes, question_types, notes } = body

  const difficultyLabel = { easy: 'やさしめ', normal: '標準', hard: '難しめ' }[difficulty]
  const typeLabels = question_types.map(t => ({
    journal_entry: '仕訳問題',
    calculation: '計算問題',
    multiple_choice: '選択問題',
    description: '語句記述問題',
  }[t])).join('、')

  const systemPrompt = `あなたは日商簿記2級（工業簿記）の専門家です。以下の簿記原則を厳守して小テストを作成してください。

【絶対に守る簿記原則】
- 総合原価計算表は「直接材料費・加工費・合計」の3列構成を基本とし、先入先出法・平均法を明示する
- 仕訳問題は借方・貸方の金額が必ず一致すること
- 月末仕掛品の計算は完成品換算量を正確に使用すること
- 正常仕損・異常仕損の負担関係（完成品のみ・両者負担）を問題条件から正確に判定すること
- 標準原価計算の差異分析は価格差異・数量差異・予算差異・操業度差異・能率差異を正確に区別すること
- 個別原価計算の製造指図書番号と仕掛品・製品の対応を正確にすること
- 問題の数値は必ず整合性が取れていること（答えが割り切れる数値を使う）
- 解答の数値は必ず検算して正しいことを確認してから出力すること

【表形式問題のJSON出力形式】
計算問題で表が必要な場合は以下のtable_dataを必ず含めること：
{
  "type": "calculation",
  "question_text": "問題文（資料のみ）",
  "table_data": {
    "title": "総合原価計算表（平均法）（単位：円）",
    "headers": ["区分", "直接材料費", "加工費", "合計"],
    "rows": [
      {"label": "月初仕掛品原価", "values": ["0", "0", "0"]},
      {"label": "当月製造費用", "values": ["480,000", "420,000", "900,000"]},
      {"label": "合計", "values": ["480,000", "420,000", "900,000"]},
      {"label": "月末仕掛品原価", "values": ["①", "②", "③"]},
      {"label": "完成品原価", "values": ["④", "⑤", "840,000"]}
    ]
  },
  "blanks": [
    {"position": "①", "answer": 96000, "type": "number"},
    {"position": "②", "answer": 14000, "type": "number"}
  ]
}

JSON形式のみで出力し、余分な説明は不要です。`

  // ログ: Claudeに送るテキストを確認
  console.log('=== Claude API に送信するテキスト ===')
  console.log(`文字数: ${content.length}`)
  console.log('--- テキスト先頭300文字 ---')
  console.log(content.substring(0, 300))
  console.log('===================================')

  const userPrompt = `以下の授業プリントの内容を基に、工業簿記の小テストを作成してください。

【絶対厳守】
- 必ず「授業プリント内容」に記載されている情報のみを使って出題すること
- 授業プリントに含まれていない単元・数値・概念を使った問題は絶対に作成しないこと
- プリントに記載の数値・勘定科目・計算条件をそのまま使用すること
- プリントの内容が不十分で問題が作れない場合は、その旨をerrorフィールドに記載すること

【設定】
- 難易度: ${difficultyLabel}
- 解答時間: ${estimated_minutes}分
- 含める問題形式: ${typeLabels}
- 特記事項: ${notes || 'なし'}

【授業プリント内容】
${content}

【出力JSONスキーマ】
{
  "title": "テストタイトル",
  "subject": "単元名",
  "estimated_minutes": ${estimated_minutes},
  "total_points": 10,
  "questions": [
    {
      "id": 1,
      "type": "journal_entry",
      "question_text": "問題文（具体的な金額・条件を含む）",
      "points": 4,
      "answer": {
        "debit_account": "仕掛品",
        "debit_amount": 50000,
        "credit_account": "材料",
        "credit_amount": 50000
      }
    },
    {
      "id": 2,
      "type": "calculation",
      "question_text": "問題文（資料のみ。表の空欄は①②③で示す）",
      "points": 4,
      "table_data": {
        "title": "総合原価計算表（平均法）（単位：円）",
        "headers": ["区分", "直接材料費", "加工費", "合計"],
        "rows": [
          {"label": "月初仕掛品原価", "values": ["xxx", "xxx", "xxx"]},
          {"label": "当月製造費用", "values": ["xxx", "xxx", "xxx"]},
          {"label": "合計", "values": ["xxx", "xxx", "xxx"]},
          {"label": "月末仕掛品原価", "values": ["①", "②", "③"]},
          {"label": "完成品原価", "values": ["④", "⑤", "xxx"]}
        ]
      },
      "blanks": [
        {"position": "①", "answer": 96000, "type": "number"},
        {"position": "②", "answer": 14000, "type": "number"}
      ]
    },
    {
      "id": 3,
      "type": "multiple_choice",
      "question_text": "問題文",
      "points": 2,
      "choices": ["選択肢A","選択肢B","選択肢C","選択肢D"],
      "answer": 0
    }
  ]
}

注意事項:
- 仕訳問題は借方・貸方の合計金額が必ず一致すること（検算必須）
- 複数行仕訳は answer を配列にする: [{"debit_account":"...","debit_amount":0,"credit_account":"...","credit_amount":0}]
- 表を使う計算問題は必ず table_data を含めること
- 数値の整合性を必ず検算してから出力すること
- 合計点数は10点にすること`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    })

    const textContent = response.content.find(c => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      throw new Error('テキストレスポンスが見つかりません')
    }

    // JSONを抽出
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('JSON形式のレスポンスが見つかりません')
    }

    const quizData = JSON.parse(jsonMatch[0])
    return NextResponse.json(quizData)
  } catch (error) {
    console.error('Claude API error:', error)
    return NextResponse.json(
      { error: '問題の生成に失敗しました: ' + (error as Error).message },
      { status: 500 }
    )
  }
}
