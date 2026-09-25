import { NextRequest, NextResponse } from 'next/server';

// Use Node.js runtime since pdf-parse requires it (not Edge)
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

    const text = pdfData.text || '';

    // === REGEX-BASED FIELD EXTRACTION (No AI) ===

    // 1. Extract full name — first non-URL, non-email, non-phone, short line from top
    let full_name = '';
    const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    for (const line of lines.slice(0, 8)) {
      if (
        line.match(/^https?:\/\//i) ||
        line.includes('@') ||
        line.match(/^\+?\d[\d\s\-().]{6,}$/) ||
        line.length > 60 ||
        line.toLowerCase().includes('resume') ||
        line.toLowerCase().includes('curriculum') ||
        line.toLowerCase().includes('objective') ||
        line.toLowerCase().includes('summary') ||
        line.toLowerCase().includes('experience') ||
        line.toLowerCase().includes('education') ||
        line.toLowerCase().includes('skills')
      ) continue;
      // Name: mostly letters and spaces, 2-50 chars, max 5 words
      if (line.match(/^[A-Za-z\s.'-]{2,50}$/) && line.split(/\s+/).length <= 5) {
        full_name = line;
        break;
      }
    }

    // 2. Extract current title — look for common title patterns near the name
    let current_title = '';
    const titlePatterns = [
      /(?:^|\n)\s*(?:title|role|position|designation)\s*[:\-–]\s*(.+)/i,
      /(?:^|\n)\s*(.+?(?:developer|engineer|designer|manager|analyst|architect|consultant|scientist|specialist|intern|lead|director|vp|cto|ceo|cfo)\b.{0,30})/i,
    ];
    // Check lines near the top (first 10 lines) for title-like content
    for (const line of lines.slice(0, 10)) {
      if (line === full_name) continue;
      for (const pattern of titlePatterns) {
        const match = line.match(pattern);
        if (match) {
          const candidate = (match[1] || match[0]).trim();
          if (candidate.length > 3 && candidate.length < 80 && !candidate.match(/^https?:\/\//)) {
            current_title = candidate;
            break;
          }
        }
      }
      if (current_title) break;
    }

    // 3. Extract phone number
    let phone = '';
    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/);
    if (phoneMatch) {
      const cleaned = phoneMatch[0].trim();
      if (cleaned.replace(/\D/g, '').length >= 7) {
        phone = cleaned;
      }
    }

    // 4. Extract LinkedIn URL
    let linkedin_url = '';
    const linkedinMatch = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s,)}\]"'<>]+/i);
    if (linkedinMatch) {
      linkedin_url = linkedinMatch[0].replace(/[.,;:!?]+$/, '');
    }

    // 5. Extract GitHub URL
    let github_url = '';
    const githubMatch = text.match(/https?:\/\/(?:www\.)?github\.com\/[^\s,)}\]"'<>]+/i);
    if (githubMatch) {
      github_url = githubMatch[0].replace(/[.,;:!?]+$/, '');
    }

    // 6. Extract portfolio/personal URL (any URL that's not LinkedIn/GitHub/common frameworks)
    let portfolio_url = '';
    const urlMatches = text.match(/https?:\/\/[^\s,)}\]"'<>]+/gi) || [];
    for (const url of urlMatches) {
      const cleanUrl = url.replace(/[.,;:!?]+$/, '');
      const lower = cleanUrl.toLowerCase();
      if (
        !lower.includes('linkedin.com') &&
        !lower.includes('github.com') &&
        !lower.includes('mailto:') &&
        !lower.includes('fonts.google') &&
        !lower.includes('googleapis.com') &&
        !lower.includes('gstatic.com') &&
        !lower.includes('w3.org') &&
        !lower.includes('google.com/search') &&
        !lower.includes('schema.org')
      ) {
        portfolio_url = cleanUrl;
        break;
      }
    }

    // 7. Determine experience level from text
    let experience_level = 'Fresher';
    // Try to find years of experience mentioned
    const yearsPatterns = [
      /(\d+)\+?\s*(?:years?|yrs?)\s*(?:of)?\s*(?:experience|exp)/i,
      /(?:experience|exp)\s*(?:of)?\s*(\d+)\+?\s*(?:years?|yrs?)/i,
      /(\d+)\+?\s*(?:years?|yrs?)\s*(?:in|of|working)/i,
    ];
    let totalYears = 0;
    for (const pattern of yearsPatterns) {
      const match = text.match(pattern);
      if (match) {
        totalYears = parseInt(match[1]);
        break;
      }
    }

    // If no explicit mention, try counting date ranges in experience section
    if (totalYears === 0) {
      const dateRanges = text.match(/(?:20\d{2}|19\d{2})\s*[-–]\s*(?:20\d{2}|19\d{2}|present|current|ongoing)/gi) || [];
      if (dateRanges.length > 0) {
        // Try to calculate from the earliest and latest dates
        const years: number[] = [];
        dateRanges.forEach((range: string) => {
          const nums = range.match(/\d{4}/g);
          if (nums) nums.forEach(n => years.push(parseInt(n)));
        });
        if (years.length >= 2) {
          const isPresent = text.match(/[-–]\s*(?:present|current|ongoing)/i);
          const maxYear = isPresent ? new Date().getFullYear() : Math.max(...years);
          totalYears = maxYear - Math.min(...years);
        }
      }
    }

    // Check for student/graduate/intern keywords
    const isFresher = /(?:student|fresh\s*graduate|recent\s*graduate|fresher|final\s*year|seeking\s*internship)/i.test(text);

    if (isFresher && totalYears <= 1) {
      experience_level = 'Fresher';
    } else if (totalYears <= 1) {
      experience_level = 'Fresher';
    } else if (totalYears <= 3) {
      experience_level = 'Junior';
    } else if (totalYears <= 5) {
      experience_level = 'Mid-Level';
    } else if (totalYears <= 8) {
      experience_level = 'Senior';
    } else {
      experience_level = 'Lead';
    }

    // Check for executive titles
    if (/\b(?:director|vp|vice\s*president|c[etfo]o|chief|head\s*of)\b/i.test(text.substring(0, 500))) {
      experience_level = 'Executive';
    }

    // 8. Build resume_text summary — first 2000 chars of the extracted text
    const resume_text = text.substring(0, 2000).trim();

    // 9. Extract email address
    let email = '';
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      email = emailMatch[0];
    }

    // Return structured fields
    const fields = {
      full_name,
      current_title,
      phone,
      email,
      linkedin_url,
      github_url,
      portfolio_url,
      experience_level,
      resume_text,
    };

    return NextResponse.json(fields);

  } catch (error: any) {
    console.error("Resume extraction error:", error);
    return NextResponse.json({ error: error.message || "Failed to extract resume fields" }, { status: 500 });
  }
}
