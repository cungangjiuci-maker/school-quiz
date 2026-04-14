import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as string)
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''

  const data = new Uint8Array(buffer)
  const loadingTask = pdfjsLib.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  })
  const pdf = await loadingTask.promise

  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: { str?: string }) => item.str ?? '')
      .join(' ')
    text += pageText + '\n'
  }

  return text
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File

  if (!file) {
    return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 400 })
  }

  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let text = ''

    if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
      text = await extractPdfText(buffer)

      console.log('=== PDF テキスト抽出結果 ===')
      console.log(`ファイル名: ${file.name}`)
      console.log(`抽出文字数: ${text.length}`)
      console.log('--- 抽出テキスト（先頭500文字）---')
      console.log(text.substring(0, 500))
      console.log('===========================')

      if (!text || text.trim().length < 10) {
        return NextResponse.json({
          error: 'PDFからテキストを抽出できませんでした。スキャン画像のPDFは対応していません。テキストが含まれるPDFか、Wordファイルをご使用ください。',
        }, { status: 422 })
      }
    } else {
      // .docx
      const result = await mammoth.extractRawText({ buffer })
      text = result.value

      console.log('=== Docx テキスト抽出結果 ===')
      console.log(`ファイル名: ${file.name}`)
      console.log(`抽出文字数: ${text.length}`)
      console.log('--- 抽出テキスト（先頭500文字）---')
      console.log(text.substring(0, 500))
      console.log('===========================')

      if (!text || text.trim().length < 10) {
        return NextResponse.json({
          error: 'Wordファイルからテキストを抽出できませんでした。ファイルが空か破損している可能性があります。',
        }, { status: 422 })
      }
    }

    return NextResponse.json({ text })
  } catch (error) {
    console.error('Text extraction error:', error)
    return NextResponse.json({ error: 'テキスト抽出に失敗しました: ' + (error as Error).message }, { status: 500 })
  }
}
