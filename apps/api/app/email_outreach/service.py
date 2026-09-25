"""
Email draft generation service.
Uses Gemini to produce evidence-grounded cold outreach emails.
All facts come from the LeadRecord assertions — no hallucination.
"""

from __future__ import annotations

import json
import logging

import httpx

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.persistence.models import Product
from app.repositories.leads import LeadRecord

logger = logging.getLogger(__name__)


class DraftGenerationError(Exception):
    pass


def _build_prompt(record: LeadRecord, session: Session | None = None) -> str:
    """
    Construct a structured, evidence-grounded prompt for Gemini.
    Only facts present in the LeadRecord are included — no assumptions.
    """
    pv = record.product_version
    req = record.requirement
    source = record.source
    company = record.company

    product_name = None
    if session is not None and getattr(pv, "product_id", None):
        product_name = session.scalar(select(Product.name).where(Product.id == pv.product_id))
    if not product_name:
        product_name = (
            getattr(pv, "name", None)
            or (pv.facts or {}).get("product_name")
            or (pv.facts or {}).get("name")
            or "Our Solution"
        )

    # Evidence excerpt — grounded in the source document
    evidence = (
        (req.evidence_span or {}).get("quote")
        or (req.evidence_span or {}).get("excerpt")
        or source.evidence_excerpt
        or req.normalized_need
    )

    # Product facts
    facts = pv.facts or {}
    facts_text = ""
    for k, v in facts.items():
        if k.startswith("_"):
            continue
        facts_text += f"- {k.replace('_', ' ').title()}: {v}\n"

    company_name = company.normalized_name if company else "the company"
    need = req.normalized_need
    geography = f" in {req.geography}" if req.geography else ""
    deadline = f" (deadline: {req.explicit_deadline.date().isoformat()})" if req.explicit_deadline else ""

    prompt = f"""You are writing a short, professional cold outreach email on behalf of a sales professional.

PRODUCT / SERVICE BEING OFFERED:
Name: {product_name}
Description: {pv.description}
{facts_text}

TARGET LEAD:
Company: {company_name}
Stated requirement (sourced from: {source.canonical_url}):
"{evidence}"
Requirement category: {req.category or "general"}{geography}{deadline}

RULES — you MUST follow all of these:
1. Write ONLY what is grounded in the facts above — do not invent case studies, pricing, guarantees, or delivery dates.
2. Subject line: max 9 words, plain text only, no asterisks or markdown.
3. Body: 3–4 short paragraphs. Opening sentence references the specific published requirement verbatim or closely paraphrased.
4. End with a single clear call to action — a brief 15-minute call or a reply.
5. Tone: professional, warm, direct. No fluff or buzzwords.
6. Do NOT include any placeholder text like [Your Name] or [Date].

Respond with a JSON object with exactly two keys:
  "subject": "string — the subject line"
  "body_html": "string — the full email body as valid HTML (use <p> tags, no inline styles)"
"""
    return prompt


async def generate_draft(record: LeadRecord, session: Session | None = None) -> dict[str, str]:
    """
    Call Gemini to generate an email draft grounded in lead evidence.
    Returns {"subject": str, "body_html": str}.
    Raises DraftGenerationError on failure.
    """
    settings = get_settings()
    api_key = settings.gemini_api_key.get_secret_value() if settings.gemini_api_key else None
    if not api_key:
        raise DraftGenerationError("GEMINI_API_KEY is not configured")

    prompt = _build_prompt(record, session=session)
    candidate_models = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash-lite"]

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "subject": {"type": "STRING"},
                    "body_html": {"type": "STRING"},
                },
                "required": ["subject", "body_html"],
            },
        },
    }

    last_error = "No response"
    data = None

    async with httpx.AsyncClient(timeout=30.0) as client:
        for model in candidate_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            try:
                response = await client.post(url, json=payload)
            except httpx.HTTPError as exc:
                last_error = f"HTTP connection error: {exc}"
                continue
            if not response.is_success:
                last_error = f"Gemini API returned {response.status_code}: {response.text[:200]}"
                logger.warning("Gemini model %s failed: %s", model, last_error)
                continue
            data = response.json()
            break

    if not data:
        raise DraftGenerationError(last_error)

    text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    if not text:
        finish_reason = data.get("candidates", [{}])[0].get("finishReason", "unknown")
        raise DraftGenerationError(f"No content generated. Finish reason: {finish_reason}")

    try:
        result = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse Gemini response as JSON: %s", text[:200])
        raise DraftGenerationError("Gemini returned invalid JSON") from exc

    subject = str(result.get("subject", "")).strip()
    body_html = str(result.get("body_html", "")).strip()

    if not subject or not body_html:
        raise DraftGenerationError("Gemini response missing subject or body_html")

    logger.info(
        "Draft generated for lead=%s company=%s subject=%r",
        record.lead.id,
        record.company.normalized_name if record.company else "unknown",
        subject,
    )
    return {"subject": subject, "body_html": body_html}
