import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: "Missing or invalid Google provider token." }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    const { to, subject, htmlBody, attachmentBase64, filename, bcc } = await req.json();

    if ((!to && !bcc) || !subject || !htmlBody) {
      return NextResponse.json({ error: "Missing required email fields (to/bcc, subject, htmlBody)" }, { status: 400 });
    }

    const boundary = "====boundary_ai_job_mailer_pro====";
    
    // Construct the MIME message
    let message = "";
    if (to) message += `To: ${to}\r\n`;
    if (bcc) message += `Bcc: ${bcc}\r\n`;
    message += `Subject: ${subject}\r\n`;
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

    // HTML Body part
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/html; charset="UTF-8"\r\n\r\n`;
    message += `${htmlBody}\r\n\r\n`;

    // PDF Attachment part
    if (attachmentBase64) {
      const safeFilename = filename || "resume.pdf";
      const rawBase64 = attachmentBase64.includes(',') ? attachmentBase64.split(',')[1] : attachmentBase64;
      
      message += `--${boundary}\r\n`;
      message += `Content-Type: application/pdf; name="${safeFilename}"\r\n`;
      message += `Content-Disposition: attachment; filename="${safeFilename}"\r\n`;
      message += `Content-Transfer-Encoding: base64\r\n\r\n`;
      
      // Base64 string must be folded at 76 chars (standard MIME), though Gmail often accepts unfolded.
      // We will chunk it to be safe.
      const chunkedBase64 = rawBase64.match(/.{1,76}/g)?.join('\r\n') || rawBase64;
      message += `${chunkedBase64}\r\n\r\n`;
    }

    message += `--${boundary}--\r\n`;

    // Encode to base64url format for Gmail API
    // btoa expects latin1 string. We need to handle utf8 if subject/body has unicode.
    // In Edge runtime, TextEncoder and btoa are available.
    const encoder = new TextEncoder();
    const bytes = encoder.encode(message);
    const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
    const base64Message = btoa(binString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    // Call Gmail API
    const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        raw: base64Message
      })
    });

    const gmailData = await gmailRes.json();

    if (!gmailRes.ok) {
      console.error("Gmail API error details:", gmailData);
      throw new Error(gmailData.error?.message || "Failed to send email via Gmail API");
    }

    return NextResponse.json({ success: true, messageId: gmailData.id });

  } catch (error: any) {
    console.error("Gmail route error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
