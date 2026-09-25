import { NextRequest, NextResponse } from 'next/server';

// Use Node.js runtime since pdf-parse requires Buffer (not available in Edge)
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { base64Data } = await req.json();

    if (!base64Data) {
      return NextResponse.json({ error: "No file data provided" }, { status: 400 });
    }

    // Extract raw base64 without the data URI prefix
    const rawBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const pdfBuffer = Buffer.from(rawBase64, 'base64');

    // Import core parser directly (skips index.js test-mode wrapper that causes ENOENT)
    const pdfParse = require('pdf-parse/lib/pdf-parse');
    const pdfData = await pdfParse(pdfBuffer);

    const extractedText = pdfData.text || '';

    if (!extractedText.trim()) {
      return NextResponse.json({ error: "No text could be extracted from this PDF. The file may be image-based or corrupted." }, { status: 400 });
    }

    return NextResponse.json({ text: extractedText });

  } catch (error: any) {
    console.error("PDF Parsing error:", error);
    return NextResponse.json({ error: error.message || "Failed to parse PDF" }, { status: 500 });
  }
}
