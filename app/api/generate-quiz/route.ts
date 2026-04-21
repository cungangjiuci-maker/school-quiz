import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { GenerateQuizRequest, JournalEntryAnswer, QuestionType } from '@/types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  let body: GenerateQuizRequest
  try {
    body = await request.json()
  } catch (parseErr) {
    console.error('[generate-quiz] リクエストボディの JSON parse 失敗:', parseErr)
    return NextResponse.json({ error: 'リクエストの解析に失敗しました。ファイルが大きすぎる可能性があります。' }, { status: 400 })
  }

  const { difficulty, estimated_minutes, question_types, notes } = body

  // サーバー側でも念のため 15,000 字に制限（クライアント・extract-text 側で切り詰め済みのはずだが二重防護）
  const MAX_CONTENT_CHARS = 15000
  const content = typeof body.content === 'string' && body.content.length > MAX_CONTENT_CHARS
    ? (() => {
        console.warn(`[generate-quiz] content を切り詰め: ${body.content.length} → ${MAX_CONTENT_CHARS} 文字`)
        return body.content.slice(0, MAX_CONTENT_CHARS)
      })()
    : (body.content ?? '')

  const difficultyLabel = { easy: 'やさしめ', normal: '標準', hard: '難しめ' }[difficulty]

  const TYPE_LABEL: Record<QuestionType, string> = {
    journal_entry: '仕訳問題',
    calculation:   '計算問題',
    multiple_choice: '選択問題',
    description:   '語句記述問題',
  }
  const allTypes: QuestionType[] = ['journal_entry', 'calculation', 'multiple_choice', 'description']

  // 選択済み・禁止タイプのラベルを生成
  const allowedSet    = new Set(question_types)
  const typeLabels    = question_types.map(t => TYPE_LABEL[t]).join('、')
  const forbiddenTypes = allTypes.filter(t => !allowedSet.has(t))
  const forbiddenLabel = forbiddenTypes.map(t => TYPE_LABEL[t]).join('、')

  // 選択されたタイプに対応するJSONスキーマのサンプルのみ動的に生成する。
  // 未選択タイプのサンプルをプロンプトに含めると、AIがそれを真似て
  // 不要な問題タイプを出力することがあるため、ここで完全に除外する。
  let exampleId = 1
  const schemaExamples: string[] = []

  if (allowedSet.has('journal_entry')) {
    schemaExamples.push(`    {
      "id": ${exampleId++},
      "type": "journal_entry",
      "question_text": "問題文（具体的な金額・条件を含む）",
      "points": 4,
      "answer": {
        "debit_account": "仕掛品",
        "debit_amount": 50000,
        "credit_account": "材料",
        "credit_amount": 50000
      },
      "account_suggestions": ["仕掛品", "材料", "製造間接費", "賃金", "買掛金"]
    }`)
  }
  if (allowedSet.has('calculation')) {
    schemaExamples.push(`    {
      "id": ${exampleId++},
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
    }`)
  }
  if (allowedSet.has('multiple_choice')) {
    schemaExamples.push(`    {
      "id": ${exampleId++},
      "type": "multiple_choice",
      "question_text": "問題文",
      "points": 2,
      "choices": ["選択肢A","選択肢B","選択肢C","選択肢D"],
      "answer": 0
    }`)
  }
  if (allowedSet.has('description')) {
    schemaExamples.push(`    {
      "id": ${exampleId++},
      "type": "description",
      "question_text": "問題文",
      "points": 2,
      "keywords": ["キーワード1", "キーワード2"]
    }`)
  }

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

【計算問題のJSON出力形式 - 絶対厳守】
計算問題（type: "calculation"）には必ず blanks 配列を含めること。blanks がないと採点できない。

■ 表ありの計算問題（table_data + blanks 両方必須）：
{
  "type": "calculation",
  "question_text": "問題文",
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
    {"position": "②", "answer": 14000, "type": "number"},
    {"position": "③", "answer": 110000, "type": "number"},
    {"position": "④", "answer": 384000, "type": "number"},
    {"position": "⑤", "answer": 406000, "type": "number"}
  ]
}

■ 表なしの計算問題（blanks のみ必須）：
{
  "type": "calculation",
  "question_text": "製造間接費配賦差異を計算してください。\n【資料】予定配賦率：@500円/時間、実際操業度：800時間、実際発生額：420,000円\n①製造間接費配賦差異を求めてください（借方/貸方の区別も）",
  "blanks": [
    {"position": "①", "answer": 20000, "type": "number"}
  ]
}

JSON形式のみで出力し、余分な説明は不要です。`

  // ログ: Claudeに送るテキストを確認
  console.log('=== Claude API に送信するテキスト ===')
  console.log(`文字数: ${content.length}`)
  console.log(`選択された問題タイプ: ${typeLabels}`)
  console.log(`禁止問題タイプ: ${forbiddenLabel || 'なし'}`)
  console.log('--- テキスト先頭300文字 ---')
  console.log(content.substring(0, 300))
  console.log('===================================')

  const userPrompt = `以下の授業プリントの内容を基に、工業簿記の小テストを作成してください。

【絶対厳守】
- 必ず「授業プリント内容」に記載されている情報のみを使って出題すること
- 授業プリントに含まれていない単元・数値・概念を使った問題は絶対に作成しないこと
- プリントに記載の数値・勘定科目・計算条件をそのまま使用すること
- プリントの内容が不十分で問題が作れない場合は、その旨をerrorフィールドに記載すること

【問題形式の制約 - 絶対厳守】
使用できる問題形式: ${typeLabels} のみ
${forbiddenLabel ? `使用禁止の問題形式（1問たりとも含めてはいけない）: ${forbiddenLabel}` : ''}
questions 配列の全問題は上記の使用できる問題形式のみで構成すること。

【設定】
- 難易度: ${difficultyLabel}
- 解答時間: ${estimated_minutes}分
- 特記事項: ${notes || 'なし'}

【授業プリント内容】
${content}

【出力JSONスキーマ（使用できる問題形式のみのサンプル）】
{
  "title": "テストタイトル",
  "subject": "単元名",
  "estimated_minutes": ${estimated_minutes},
  "total_points": 10,
  "questions": [
${schemaExamples.join(',\n')}
  ]
}

注意事項:
- 仕訳問題は借方・貸方の合計金額が必ず一致すること（検算必須）
- 複数行仕訳は answer を配列にする: [{"debit_account":"...","debit_amount":0,"credit_account":"...","credit_amount":0}]
- 仕訳問題には必ず account_suggestions を含めること（授業プリントの内容から正解に近い勘定科目を5〜6個選ぶ）
- 計算問題は必ず blanks 配列を含めること（これがないと採点できない・絶対省略禁止）
- 表を使う計算問題は table_data と blanks の両方を含めること
- blanks の answer は必ず数値（number型）で設定すること
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

    // ── 未選択タイプの問題を除外（AIが指示を無視した場合の確実な保険）────
    if (Array.isArray(quizData.questions)) {
      const before = quizData.questions.length
      quizData.questions = quizData.questions.filter(
        (q: { type: string }) => allowedSet.has(q.type as QuestionType)
      )
      const removed = before - quizData.questions.length
      if (removed > 0) {
        console.warn(`[generate-quiz] 未選択タイプの問題を ${removed} 問除外しました（選択タイプ: ${typeLabels}）`)
      }
      if (quizData.questions.length === 0) {
        return NextResponse.json(
          { error: `選択した問題形式（${typeLabels}）の問題が生成されませんでした。再度「問題を生成する」を押してください。` },
          { status: 422 }
        )
      }
      // 合計点数をフィルタリング後の問題に合わせて再計算
      quizData.total_points = quizData.questions.reduce(
        (s: number, q: { points: number }) => s + (q.points || 0), 0
      )
    }

    console.log('[generate-quiz] 受信したquestion_types:', question_types)
    console.log('[generate-quiz] allowedSet:', Array.from(allowedSet))
    console.log('[generate-quiz] フィルタリング後の問題数:', quizData.questions?.length)
    console.log('[generate-quiz] フィルタリング後の問題タイプ:', quizData.questions?.map((q: {type: string}) => q.type))

    // ── 仕訳問題の借方・貸方合計一致チェック（⑦）──────────────────────
    if (Array.isArray(quizData.questions)) {
      const journalErrors: string[] = []
      quizData.questions.forEach((q: { id: number; type: string; answer?: unknown }) => {
        if (q.type !== 'journal_entry') return
        const raw = q.answer
        const answers: JournalEntryAnswer[] = Array.isArray(raw) ? raw as JournalEntryAnswer[] : raw ? [raw as JournalEntryAnswer] : []
        const totalDebit = answers.reduce((s, a) => s + (Number(a.debit_amount) || 0), 0)
        const totalCredit = answers.reduce((s, a) => s + (Number(a.credit_amount) || 0), 0)
        if (totalDebit !== totalCredit) {
          journalErrors.push(`問${q.id}: 借方合計 ${totalDebit}円 ≠ 貸方合計 ${totalCredit}円`)
        }
      })
      if (journalErrors.length > 0) {
        return NextResponse.json(
          { error: `仕訳の会計規則エラー（借方≠貸方）:\n${journalErrors.join('\n')}\n\n「問題を生成する」を再度押して再生成してください。` },
          { status: 422 }
        )
      }
    }

    // バリデーション：計算問題に blanks が含まれているか確認・補完
    if (Array.isArray(quizData.questions)) {
      quizData.questions = quizData.questions.map((q: { type: string; blanks?: unknown[]; table_data?: { rows?: { values?: string[] }[] } }) => {
        if (q.type !== 'calculation') return q

        // blanksが配列かつ要素があればOK
        if (Array.isArray(q.blanks) && q.blanks.length > 0) return q

        // blanksが欠けている場合：table_dataのセルから空欄を自動生成（answerは0で仮置き）
        if (q.table_data && Array.isArray(q.table_data.rows)) {
          const positions: string[] = []
          q.table_data.rows.forEach((row: { values?: string[] }) => {
            (row.values ?? []).forEach((val: string) => {
              if (/^[①-⑳]$/.test(val) && !positions.includes(val)) {
                positions.push(val)
              }
            })
          })
          if (positions.length > 0) {
            console.warn(`[generate-quiz] 計算問題のblanksが未設定のため自動生成: ${positions.join(',')}`)
            q.blanks = positions.map(pos => ({ position: pos, answer: 0, type: 'number' }))
          }
        }

        if (!Array.isArray(q.blanks) || q.blanks.length === 0) {
          console.error('[generate-quiz] 計算問題にblanksが設定されていません。再生成を推奨します。')
        }
        return q
      })
    }

    return NextResponse.json(quizData)
  } catch (error) {
    console.error('Claude API error:', error)
    return NextResponse.json(
      { error: '問題の生成に失敗しました: ' + (error as Error).message },
      { status: 500 }
    )
  }
}
