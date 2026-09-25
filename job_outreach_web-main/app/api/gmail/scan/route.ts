import { NextRequest, NextResponse } from 'next/server';
import { getCached, setCached, batchGetCached, isRateLimited } from '@/lib/redis';
import crypto from 'crypto';

// ══════════════════════════════════════════════════════════════════════════════
// CACHE TTL CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const MSG_CACHE_TTL = 86400;      // 24 hours — classified email results
const LIST_CACHE_TTL = 300;       // 5 minutes — Gmail message list queries
const RATE_LIMIT_WINDOW = 30;     // 30 seconds — per-user per-days scan throttle

// ══════════════════════════════════════════════════════════════════════════════
// 1. WEIGHTED KEYWORD SCORING ENGINE
// ══════════════════════════════════════════════════════════════════════════════

const INTERVIEW_KEYWORDS: Record<string, number> = {
  // High confidence — these are strong interview signals
  "schedule interview": 15, "technical round": 12, "phone screen": 12,
  "coding challenge": 10, "coding assessment": 10, "take-home assignment": 10,
  "onsite interview": 14, "virtual interview": 13, "panel interview": 13,
  "final round": 12, "screening call": 11, "introductory call": 10,
  "schedule a call": 9, "schedule a meeting": 9, "meet the team": 10,
  "hiring manager": 8, "zoom call": 8, "teams call": 8, "google meet": 8,
  // Confirmed / scheduled interview patterns
  "interview has been scheduled": 15, "interview is scheduled": 15,
  "interview scheduled": 14, "your interview": 12,
  "selected for interview": 14, "selected for the interview": 14,
  "shortlisted for interview": 14, "shortlisted for the interview": 14,
  "interview on": 10, "interview at": 10, "interview tomorrow": 14,
  "interview with you": 12, "interview with us": 10,
  "confirm your interview": 14, "confirming your interview": 14,
  "interview confirmation": 14, "interview details": 12,
  "round of interview": 12, "interview round": 12,
  // Medium confidence
  "would like to meet": 7, "invite you": 7, "your availability": 8,
  "next steps": 6, "book a slot": 7, "set up a time": 7,
  "let's connect": 5, "your candidacy": 6, "move forward": 6,
  "pleased to inform": 8, "good news": 6,
  "we'd like to invite": 10, "like to schedule": 10,
  // Low confidence (supporting signals)
  "calendar": 4, "time slot": 5, "convenient time": 5,
  "impressed": 4
};

const REJECTION_KEYWORDS: Record<string, number> = {
  // High confidence
  "regret to inform": 15, "unfortunately we": 14, "not moving forward": 14,
  "decided not to proceed": 14, "position has been filled": 13,
  "gone with another candidate": 13, "other candidates": 10,
  "not selected": 12, "will not be moving": 13, "not be able to offer": 12,
  "unable to offer": 12, "pursued other": 11, "no longer available": 10,
  // Medium confidence
  "unfortunately": 8, "wish you the best": 7, "wish you all the best": 8,
  "not the right fit": 9, "not a fit": 8, "unsuccessful": 10,
  "we have decided": 7, "after careful consideration": 7,
  "competitive pool": 6, "many qualified": 5,
  // Low confidence
  "best of luck": 4, "future opportunities": 4, "keep your resume": 4,
  "encourage you to apply": 4
};

const FOLLOWUP_KEYWORDS: Record<string, number> = {
  "follow up": 8, "following up": 8, "checking in": 7,
  "just wanted to check": 7, "any update": 8, "status update": 8,
  "circling back": 7, "touching base": 6, "gentle reminder": 7,
  "keep you posted": 5, "still reviewing": 6, "under review": 6,
  "in progress": 5, "haven't heard": 6, "wanted to reach out": 5,
  "bear with us": 5, "few more days": 5, "update shortly": 6
};

const INFO_REQUEST_KEYWORDS: Record<string, number> = {
  // Direct asks
  "could you send": 8, "please provide": 8, "need more information": 9,
  "need information": 8, "need some information": 8,
  "could you share": 8, "kindly share": 10, "kindly provide": 10,
  "share the following": 10, "share the details": 9, "following details": 10,
  "please reply with": 8, "please share": 8, "please send": 8,
  // Resume / portfolio
  "your resume": 7, "updated resume": 9, "your portfolio": 7,
  "your cv": 7, "updated cv": 9, "copy of your resume": 8,
  // Salary / compensation
  "salary expectations": 9, "expected compensation": 9,
  "current ctc": 10, "expected ctc": 10, "current salary": 8,
  "desired salary": 8, "salary requirement": 9, "pay expectations": 8,
  // Professional details
  "notice period": 9, "work authorization": 9, "visa status": 8,
  "years of experience": 8, "total experience": 8,
  "current company": 7, "current location": 7,
  "preferred location": 7, "work location": 7,
  "technical skill": 8, "skill set": 8,
  // Documents
  "references": 6, "cover letter": 6, "certifications": 5,
  "documents": 5, "start date": 7, "relocation": 6,
  "additional details": 7, "more details": 6,
  // Patterns
  "for our records": 8, "at your earliest": 6, "earliest convenience": 6
};

// ══════════════════════════════════════════════════════════════════════════════
// 2. NEGATION DETECTION
// ══════════════════════════════════════════════════════════════════════════════

const NEGATION_WORDS = [
  "not", "no", "never", "don't", "won't", "didn't", "can't", "cannot",
  "unable", "unlikely", "wasn't", "weren't", "haven't", "hasn't",
  "wouldn't", "couldn't", "shouldn't"
];

function hasNegationBefore(text: string, keyword: string): boolean {
  const idx = text.indexOf(keyword);
  if (idx === -1) return false;
  // Check 40 chars before the keyword for negation
  const prefix = text.substring(Math.max(0, idx - 40), idx).toLowerCase();
  return NEGATION_WORDS.some(neg => prefix.includes(neg));
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. RECRUITER DOMAIN DATABASE
// ══════════════════════════════════════════════════════════════════════════════

const RECRUITER_DOMAINS = [
  "greenhouse.io", "lever.co", "ashbyhq.com", "smartrecruiters.com",
  "workable.com", "icims.com", "jobvite.com", "breezy.hr",
  "recruitee.com", "bamboohr.com", "jazz.co", "hiringthing.com",
  "workday.com", "taleo.net", "successfactors.com", "myworkday.com",
  "indeed.com", "linkedin.com", "glassdoor.com", "naukri.com",
  "angellist.com", "wellfound.com"
];

function getRecruiterDomainBoost(email: string): number {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  if (RECRUITER_DOMAINS.some(rd => domain.includes(rd))) return 5;
  // Boost for common HR/recruiting subdomains
  if (domain.includes('recruit') || domain.includes('hiring') || domain.includes('talent')) return 3;
  return 0;
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. REGEX PATTERNS — Time, Date, Meeting Links
// ══════════════════════════════════════════════════════════════════════════════

const TIME_REGEX = /\b\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)?\b/;
const DAY_REGEX = /\b(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\b/i;
const DATE_REGEX = /\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s?\d{2,4}?)\b/i;
const MEETING_LINK_REGEX = /(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|calendly\.com|chime\.aws|webex\.com)/i;
const CALENDAR_LINK_REGEX = /(?:calendar\.google\.com|outlook\.office\.com\/calendar|calendly\.com)/i;

function getRegexSignals(text: string): { interviewBoost: number; matchedPatterns: string[] } {
  const patterns: string[] = [];
  let boost = 0;

  if (TIME_REGEX.test(text)) { boost += 3; patterns.push('time_detected'); }
  if (DAY_REGEX.test(text)) { boost += 2; patterns.push('day_detected'); }
  if (DATE_REGEX.test(text)) { boost += 2; patterns.push('date_detected'); }
  if (MEETING_LINK_REGEX.test(text)) { boost += 8; patterns.push('meeting_link'); }
  if (CALENDAR_LINK_REGEX.test(text)) { boost += 6; patterns.push('calendar_link'); }

  // If time + date + meeting link → very high interview confidence
  if (patterns.includes('time_detected') && patterns.includes('meeting_link')) {
    boost += 5;
  }

  return { interviewBoost: boost, matchedPatterns: patterns };
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. GMAIL HEADER ANALYSIS
// ══════════════════════════════════════════════════════════════════════════════

function analyzeHeaders(headers: any[]): { isAutoReply: boolean; isThreadReply: boolean; headerSignals: string[] } {
  const signals: string[] = [];
  let isAutoReply = false;
  let isThreadReply = false;

  for (const h of headers) {
    const name = h.name.toLowerCase();
    const value = (h.value || '').toLowerCase();

    // Auto-generated rejection emails
    if (name === 'auto-submitted' && value !== 'no') {
      isAutoReply = true;
      signals.push('auto_submitted');
    }
    if (name === 'x-auto-response-suppress') {
      isAutoReply = true;
      signals.push('auto_response');
    }
    // Thread detection
    if (name === 'in-reply-to' || name === 'references') {
      isThreadReply = true;
      signals.push('thread_reply');
    }
    // Precedence header (bulk = automated)
    if (name === 'precedence' && (value === 'bulk' || value === 'junk')) {
      isAutoReply = true;
      signals.push('bulk_mail');
    }
    // List-Unsubscribe = mass email / newsletter
    if (name === 'list-unsubscribe') {
      signals.push('mass_email');
    }
  }

  return { isAutoReply, isThreadReply, headerSignals: signals };
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. SMART SUMMARY EXTRACTION
// ══════════════════════════════════════════════════════════════════════════════

function stripQuotedText(body: string): string {
  let cleaned = body;

  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // Remove quoted replies ("On ... wrote:")
  cleaned = cleaned.replace(/\bOn\s+.*?wrote:[\s\S]*/i, '');
  cleaned = cleaned.replace(/-{3,}\s*Original Message\s*-{3,}[\s\S]*/i, '');
  cleaned = cleaned.replace(/>{1,}\s*.*/g, ''); // Remove > quoted lines
  
  // Remove Outlook-style quoted text: "From: ... Sent: ... To: ..." and everything after
  cleaned = cleaned.replace(/From:\s*[^\n]*?\s*Sent:\s*[\s\S]*/i, '');
  // Also catch "From:" followed by email, then rest of forwarded chain
  cleaned = cleaned.replace(/From:\s*\S+@\S+[\s\S]*/i, '');
  
  // Remove mobile signatures that might cause false positives
  cleaned = cleaned.replace(/Sent from (?:my )?(?:iPhone|iPad|Android|Samsung|Outlook|Mail).*/ig, '');

  return cleaned.replace(/\s+/g, ' ').trim();
}

function extractSmartSummary(cleanedBody: string, rawBody: string): string {
  const cleaned = cleanedBody;

  if (cleaned.length > 0) {
    if (cleaned.length > 150) {
      // Try to cut at sentence boundary
      const sentenceEnd = cleaned.lastIndexOf('.', 150);
      if (sentenceEnd > 60) {
        return cleaned.substring(0, sentenceEnd + 1);
      }
      return cleaned.substring(0, 147) + '...';
    }
    return cleaned;
  }

  // Fallback to raw body snippet if cleaning emptied it completely
  const fallback = rawBody.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 100);
  return fallback || 'No content available (Raw body empty)';
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN CLASSIFICATION ENGINE — Combines all signals
// ══════════════════════════════════════════════════════════════════════════════

interface ClassificationResult {
  category: string;
  confidence: number;
  summary: string;
  matchedKeywords: string[];
  signals: string[];
}

function classifyEmail(
  subject: string,
  body: string,
  emailHeaders: any[],
  senderEmail: string
): ClassificationResult {
  const strippedBody = stripQuotedText(body);
  const text = `${subject} ${strippedBody}`.toLowerCase();
  const allSignals: string[] = [];
  const allMatchedKeywords: string[] = [];

  // ── Score each category with weighted keywords ──
  const scores: Record<string, number> = {
    Interview: 0, Rejection: 0, 'Follow-up': 0, 'Information Request': 0, Other: 0
  };

  const scoreCategory = (keywords: Record<string, number>, category: string) => {
    for (const [keyword, weight] of Object.entries(keywords)) {
      if (text.includes(keyword)) {
        // Check for negation context
        if (hasNegationBefore(text, keyword)) {
          // Negated keyword: flip the signal
          if (category === 'Interview') {
            scores['Rejection'] += Math.floor(weight * 0.5);
            allSignals.push(`negated:${keyword}`);
          } else if (category === 'Rejection') {
            scores['Interview'] += Math.floor(weight * 0.3);
            allSignals.push(`negated:${keyword}`);
          }
        } else {
          scores[category] += weight;
          allMatchedKeywords.push(keyword);
        }
      }
    }
  };

  scoreCategory(INTERVIEW_KEYWORDS, 'Interview');
  scoreCategory(REJECTION_KEYWORDS, 'Rejection');
  scoreCategory(FOLLOWUP_KEYWORDS, 'Follow-up');
  scoreCategory(INFO_REQUEST_KEYWORDS, 'Information Request');

  // ── Recruiter domain boost ──
  const domainBoost = getRecruiterDomainBoost(senderEmail);
  if (domainBoost > 0) {
    // Auto-submitted from recruiter domain → likely rejection
    allSignals.push('recruiter_domain');
  }

  // ── Regex pattern signals ──
  const regexResult = getRegexSignals(text);
  scores['Interview'] += regexResult.interviewBoost;
  allSignals.push(...regexResult.matchedPatterns);

  // ── Gmail header analysis ──
  const headerAnalysis = analyzeHeaders(emailHeaders);
  allSignals.push(...headerAnalysis.headerSignals);

  // Auto-submitted from recruiter domain = almost certainly rejection
  if (headerAnalysis.isAutoReply && domainBoost > 0) {
    scores['Rejection'] += 10;
    allSignals.push('auto_recruiter_rejection');
  }

  // Thread reply = genuine human response, boost Interview if scored
  if (headerAnalysis.isThreadReply && scores['Interview'] > 0) {
    scores['Interview'] += 3;
    allSignals.push('thread_context_boost');
  }

  // ── CONFIRMED INTERVIEW OVERRIDE ──
  // If the email explicitly confirms/schedules an interview, it IS an interview email
  // even if it also asks for documents (resume, salary, etc.) which inflate Info Request score
  const CONFIRMED_INTERVIEW_PATTERNS = [
    'interview has been scheduled', 'interview is scheduled', 'interview scheduled',
    'your interview', 'confirm your interview', 'confirming your interview',
    'interview confirmation', 'selected for interview', 'selected for the interview',
    'shortlisted for interview', 'shortlisted for the interview',
    'interview tomorrow', 'interview on monday', 'interview on tuesday',
    'interview on wednesday', 'interview on thursday', 'interview on friday',
    'invite you for an interview', 'invite you for interview',
    'like to schedule an interview', 'schedule your interview'
  ];
  const hasConfirmedInterview = CONFIRMED_INTERVIEW_PATTERNS.some(p => text.includes(p));
  if (hasConfirmedInterview) {
    scores['Interview'] += 30;
    allSignals.push('confirmed_interview_override');
  }

  // ── Determine winner ──
  let bestCategory = 'Other';
  let bestScore = 0;
  let totalScore = 0;

  for (const [cat, score] of Object.entries(scores)) {
    totalScore += score;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }

  // Minimum threshold — need at least some signal to classify
  if (bestScore < 5) {
    bestCategory = 'Other';
  }

  // ── Calculate confidence (0-100) ──
  let confidence: number;
  if (totalScore === 0) {
    confidence = 0;
  } else {
    // Base confidence from score dominance
    const dominance = bestScore / Math.max(totalScore, 1);
    confidence = Math.min(99, Math.round(dominance * 100 * (1 - 1 / (1 + bestScore / 10))));
  }

  // Boost confidence for strong signals
  if (bestScore >= 25) confidence = Math.max(confidence, 90);
  else if (bestScore >= 15) confidence = Math.max(confidence, 75);
  else if (bestScore >= 10) confidence = Math.max(confidence, 60);

  // ── Smart summary ──
  const summary = extractSmartSummary(strippedBody, body);

  return {
    category: bestCategory,
    confidence,
    summary,
    matchedKeywords: [...new Set(allMatchedKeywords)],
    signals: [...new Set(allSignals)]
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITY: Generate a short hash for cache keys
// ══════════════════════════════════════════════════════════════════════════════

function hashKey(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
}

// ══════════════════════════════════════════════════════════════════════════════
// API ROUTE — With 3-Layer Redis Caching
// ══════════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: "No authorization header" }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');

    const { sentEmails, days = 7, skipMessageIds = [] } = await req.json();
    if (!sentEmails || !Array.isArray(sentEmails) || sentEmails.length === 0) {
      return NextResponse.json({ classified_emails: [], total: 0, total_scanned: 0 });
    }

    const skipIds = new Set(skipMessageIds);
    const uniqueEmails = [...new Set(sentEmails.map((e: string) => e.toLowerCase().trim()))];

    // ──────────────────────────────────────────────────────────────────────
    // LAYER 3: Rate Limiter — Prevent rapid-fire IDENTICAL scans (30s cooldown)
    // Each days value has its own rate limit so switching days always works
    // ──────────────────────────────────────────────────────────────────────
    const userFingerprint = hashKey(uniqueEmails.sort().join(','));
    const rateLimitKey = `scan:rate:${userFingerprint}:${days}`;
    const limited = await isRateLimited(rateLimitKey, RATE_LIMIT_WINDOW);

    if (limited) {
      // Only return cached results for the EXACT same days parameter
      const lastResultKey = `scan:result:${userFingerprint}:${days}`;
      const cachedFullResult = await getCached<any>(lastResultKey);
      if (cachedFullResult) {
        return NextResponse.json({
          ...cachedFullResult,
          cached: true,
          message: `Results served from cache. Scan again in 30 seconds for fresh results.`
        });
      }
      // No cached result for this days value — allow the scan to proceed
    }

    // ──────────────────────────────────────────────────────────────────────
    // LAYER 2: Gmail Message List Cache (5 min TTL)
    // ──────────────────────────────────────────────────────────────────────
    const BATCH_SIZE = 20;
    const allMessages: any[] = [];

    for (let i = 0; i < uniqueEmails.length; i += BATCH_SIZE) {
      const batch = uniqueEmails.slice(i, i + BATCH_SIZE);
      const fromQuery = batch.map(email => `from:${email}`).join(' OR ');
      const query = `(${fromQuery}) newer_than:${days}d`;

      // Check cache for this query's message list
      const listCacheKey = `scan:list:${hashKey(query)}`;
      const cachedList = await getCached<any[]>(listCacheKey);

      if (cachedList) {
        allMessages.push(...cachedList);
        continue;
      }

      // Cache miss — fetch from Gmail
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!listRes.ok) continue;

      const listData = await listRes.json();
      if (listData.messages?.length > 0) {
        allMessages.push(...listData.messages);
        // Cache the message list for 5 minutes
        await setCached(listCacheKey, listData.messages, LIST_CACHE_TTL);
      }
    }

    // Deduplicate + skip already-scanned
    const seenIds = new Set<string>();
    const dedupedMessages = allMessages.filter(msg => {
      if (seenIds.has(msg.id) || skipIds.has(msg.id)) return false;
      seenIds.add(msg.id);
      return true;
    });

    if (dedupedMessages.length === 0) {
      return NextResponse.json({
        classified_emails: [], total: 0, total_scanned: 0,
        message: `No new replies from ${uniqueEmails.length} contacts.`
      });
    }

    // ──────────────────────────────────────────────────────────────────────
    // LAYER 1: Per-Message Classification Cache (24h TTL) ⭐ Biggest Impact
    // ──────────────────────────────────────────────────────────────────────

    // Step 1: Batch-check which messages are already cached
    const msgCacheKeys = dedupedMessages.map(msg => `scan:msg:${msg.id}`);
    const cachedMessages = await batchGetCached<any>(msgCacheKeys);

    // Separate into cache hits and misses
    const classifiedEmails: any[] = [];
    const uncachedMessages: any[] = [];
    const sentEmailSet = new Set(uniqueEmails);

    for (let i = 0; i < dedupedMessages.length; i++) {
      const msg = dedupedMessages[i];
      const cacheKey = msgCacheKeys[i];
      const cached = cachedMessages.get(cacheKey);

      if (cached) {
        // Verify sender is in our sent list (cached result may contain this info)
        if (!cached.senderEmail || sentEmailSet.has(cached.senderEmail)) {
          classifiedEmails.push(cached);
        }
      } else {
        uncachedMessages.push(msg);
      }
    }

    // Step 2: Fetch + classify uncached messages from Gmail
    const PARALLEL_BATCH = 5;

    for (let i = 0; i < uncachedMessages.length; i += PARALLEL_BATCH) {
      const batch = uncachedMessages.slice(i, i + PARALLEL_BATCH);

      const results = await Promise.allSettled(
        batch.map(async (msg) => {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!msgRes.ok) return null;

          const msgData = await msgRes.json();
          const headers = msgData.payload?.headers || [];

          let fromHeader = "", subject = "", date = "";
          for (const h of headers) {
            const name = h.name.toLowerCase();
            if (name === 'from') fromHeader = h.value;
            if (name === 'subject') subject = h.value;
            if (name === 'date') date = h.value;
          }

          const emailMatch = fromHeader.match(/<([^>]+)>/);
          const senderEmail = emailMatch ? emailMatch[1].toLowerCase().trim() : fromHeader.toLowerCase().trim();
          const senderName = fromHeader.split('<')[0].trim().replace(/"/g, '');

          if (!sentEmailSet.has(senderEmail)) return null;


          const decodeBase64Url = (str: string) => {
            if (!str) return '';
            const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
            return Buffer.from(b64, 'base64').toString('utf-8');
          };

          // Extract body
          let bodyText = msgData.snippet || '';
          const getBody = (payload: any): string => {
            if (!payload) return '';
            if (payload.body?.data) return decodeBase64Url(payload.body.data);
            if (payload.parts) {
              let htmlFallback = '';
              for (const part of payload.parts) {
                if (part.mimeType === 'text/plain' && part.body?.data) {
                  return decodeBase64Url(part.body.data);
                }
                if (part.mimeType === 'text/html' && part.body?.data) {
                  htmlFallback = decodeBase64Url(part.body.data);
                }
                if (part.parts) {
                  const nested = getBody(part);
                  if (nested) return nested;
                }
              }
              if (htmlFallback) return htmlFallback;
            }
            return "";
          };

          const extracted = getBody(msgData.payload);
          if (extracted) bodyText = extracted;

          const cleanBody = bodyText.substring(0, 2000).replace(/\s+/g, ' ').trim();

          // Classify with full engine
          const result = classifyEmail(subject, cleanBody, headers, senderEmail);

          let parsedDate = date;
          try { if (date) parsedDate = new Date(date).toISOString(); } catch {}

          const classifiedResult = {
            messageId: msg.id,
            senderName,
            senderEmail,
            subject,
            date: parsedDate,
            category: result.category,
            confidence: result.confidence,
            summary: result.summary,
            matchedKeywords: result.matchedKeywords,
            signals: result.signals
          };

          // Cache this classified result in Redis for 24 hours
          await setCached(`scan:msg:${msg.id}`, classifiedResult, MSG_CACHE_TTL);

          return classifiedResult;
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          classifiedEmails.push(r.value);
        }
      }
    }

    // Cache the full result for rate-limit fallback
    const fullResult = {
      classified_emails: classifiedEmails,
      total: classifiedEmails.length,
      total_scanned: dedupedMessages.length
    };
    await setCached(`scan:result:${userFingerprint}:${days}`, fullResult, RATE_LIMIT_WINDOW);

    return NextResponse.json({
      ...fullResult,
      cache_stats: {
        from_cache: classifiedEmails.length - uncachedMessages.length,
        freshly_classified: uncachedMessages.length,
        total_messages: dedupedMessages.length
      }
    });

  } catch (error: any) {
    console.error("Scan error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
