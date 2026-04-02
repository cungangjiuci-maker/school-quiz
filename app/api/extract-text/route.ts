import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File

  if (!file) {
    return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 400 })
  }

  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const result = await mammoth.extractRawText({ buffer })
    return NextResponse.json({ text: result.value })
  } catch (error) {
    console.error('Text extraction error:', error)
    return NextResponse.json({ error: 'テキスト抽出に失敗しました' }, { status: 500 })
  }
}
