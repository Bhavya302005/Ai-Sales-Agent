# Guided business onboarding implementation plan

## Outcome

Replace the configuration-first entry point with a guided path that turns user-provided
business evidence into a reviewed, versioned, approved offering before discovery or calling.

## Flow

1. Sign in and land on Business Setup.
2. Provide an HTTPS company URL, business context, services, and optional supported documents.
3. Analyze bounded public-site and document text as untrusted input.
4. Review and edit the proposed offering, ICP, facts, exclusions, questions, and handoff rules.
5. Explicitly confirm and activate the new immutable offering version.
6. Continue to Lead Discovery or Calling Only according to the selected workflow.

## Safety and honesty

- Fetch only the submitted public HTTPS origin with DNS/redirect SSRF checks, byte limits, and
  timeouts.
- Accept only TXT, Markdown, HTML, PDF, and DOCX files; bound file count and aggregate size.
- Do not store uploaded files or unrestricted page contents. Retain bounded source labels,
  hashes, and evidence excerpts in the approved profile metadata.
- Treat website and document content as untrusted data, never instructions.
- Prefer configured structured AI analysis; validate grounding and fall back to a clearly
  labelled deterministic analysis when unavailable.
- Never infer pricing, certifications, geography, or customer claims without supplied evidence.
- Require an authenticated owner confirmation before the profile becomes callable.

## Verification

- URL policy, redirects, file types/sizes, prompt injection, malformed files, grounded output,
  deterministic fallback, tenant authorization, immutable version, and audit tests.
- Component tests for analysis/review and workflow routing.
- Production build plus an authenticated localhost browser journey.
