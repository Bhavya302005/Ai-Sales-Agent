import re
from datetime import UTC, datetime
from time import perf_counter

from app.extraction.prompt_boundary import render_untrusted_source
from app.extraction.schemas import Classification, EvidenceClaim, ExtractionResult

PROMPT_VERSION = "requirement-extraction.prompt.v1"
MODEL_NAME = "bounded-rules.v1"


class DeterministicExtractionAdapter:
    """Demo-safe baseline: bounded rules, no network, tools, or source instruction execution."""

    provider = "deterministic"
    model = MODEL_NAME
    prompt_version = PROMPT_VERSION

    def extract(self, source: str, *, observed_at: datetime) -> tuple[ExtractionResult, int]:
        started = perf_counter()
        # Enforces the same boundary future model adapters must use.
        render_untrusted_source(source)
        classification = self._classification(source, observed_at)
        if classification != "buyer_requirement":
            result = ExtractionResult(
                classification=classification,
                actionable=False,
                unknown_fields=(
                    "requirement_summary",
                    "category",
                    "industry",
                    "geography",
                    "urgency",
                    "explicit_deadline",
                    "company_clues",
                ),
            )
            return result, round((perf_counter() - started) * 1000)

        summary = self._sentence_claim(
            source,
            r"\b(seeking|requires?|needs?|looking for)\b|चाहिए|की आवश्यकता|तलाश",
        )
        if summary is None:
            return (
                ExtractionResult(
                    classification="weak_signal",
                    actionable=False,
                    unknown_fields=("requirement_summary",),
                ),
                round((perf_counter() - started) * 1000),
            )

        category = self._keyword_claim(
            source,
            (("cloud migration", "cloud_migration"), ("migrate", "cloud_migration"),
             ("crm", "crm"), ("erp", "erp"), ("automation", "automation")),
        )
        industry = self._keyword_claim(
            source,
            (("manufacturing", "manufacturing"), ("healthcare", "healthcare"),
             ("retail", "retail"), ("fintech", "financial_services")),
        )
        geography = self._keyword_claim(
            source,
            tuple((place, place) for place in ("Gujarat", "Mumbai", "Delhi", "Bengaluru", "India")),
            flags=re.IGNORECASE,
        )
        deadline = self._deadline_claim(source)
        urgency = None
        if deadline is not None:
            urgency = EvidenceClaim(
                value="explicit_deadline",
                quote=deadline.quote,
                start=deadline.start,
                end=deadline.end,
            )
        company = self._company_claim(source)
        values = {
            "category": category,
            "industry": industry,
            "geography": geography,
            "urgency": urgency,
            "explicit_deadline": deadline,
            "company_clues": company,
        }
        unknowns = tuple(name for name, value in values.items() if not value)
        result = ExtractionResult(
            classification="buyer_requirement",
            actionable=True,
            requirement_summary=summary,
            category=category,
            industry=industry,
            geography=geography,
            urgency=urgency,
            explicit_deadline=deadline,
            company_clues=(company,) if company else (),
            unknown_fields=unknowns,
        )
        result.validate_evidence(source)
        return result, round((perf_counter() - started) * 1000)

    @staticmethod
    def _classification(source: str, observed_at: datetime) -> Classification:
        lowered = source.casefold()
        if re.search(r"\b(we offer|our services|book a demo|buy now)\b", lowered):
            return "seller_pitch"
        if re.search(r"\b(job opening|we are hiring|apply now|vacancy)\b", lowered):
            return "job_posting"
        if re.search(r"\b(expired|deadline has passed|closed for proposals)\b", lowered):
            return "expired_requirement"
        deadline = DeterministicExtractionAdapter._parsed_deadline(source)
        observed = observed_at if observed_at.tzinfo else observed_at.replace(tzinfo=UTC)
        if deadline is not None and deadline < observed:
            return "expired_requirement"
        if re.search(r"\b(seeking|requires?|needs?|looking for)\b|चाहिए|की आवश्यकता|तलाश", lowered):
            return "buyer_requirement"
        if re.search(r"\b(exploring|considering|interested in|may need)\b", lowered):
            return "weak_signal"
        return "not_actionable"

    @staticmethod
    def _sentence_claim(source: str, pattern: str) -> EvidenceClaim | None:
        match = re.search(pattern, source, re.IGNORECASE)
        if match is None:
            return None
        start = max(
            source.rfind(".", 0, match.start()) + 1,
            source.rfind("\n", 0, match.start()) + 1,
        )
        while start < len(source) and source[start].isspace():
            start += 1
        stops = [pos for token in (".", "\n") if (pos := source.find(token, match.end())) >= 0]
        end = min(stops) + 1 if stops else len(source)
        quote = source[start:end].strip()
        start = source.find(quote, start, end + 1)
        return EvidenceClaim(value=quote, quote=quote, start=start, end=start + len(quote))

    @staticmethod
    def _keyword_claim(
        source: str, mappings: tuple[tuple[str, str], ...], *, flags: int = re.IGNORECASE
    ) -> EvidenceClaim | None:
        for keyword, value in mappings:
            match = re.search(rf"\b{re.escape(keyword)}\b", source, flags)
            if match:
                return EvidenceClaim(
                    value=value,
                    quote=match.group(),
                    start=match.start(),
                    end=match.end(),
                )
        return None

    @staticmethod
    def _deadline_match(source: str) -> re.Match[str] | None:
        return re.search(
            r"\b(?:by|due:|deadline:)\s+(\d{1,2})\s+"
            r"(January|February|March|April|May|June|July|August|September|October|November|December)"
            r"\s+(20\d{2})\b",
            source,
            re.IGNORECASE,
        )

    @classmethod
    def _parsed_deadline(cls, source: str) -> datetime | None:
        match = cls._deadline_match(source)
        if match is None:
            return None
        date_text = " ".join(match.groups())
        return datetime.strptime(date_text, "%d %B %Y").replace(tzinfo=UTC)

    @classmethod
    def _deadline_claim(cls, source: str) -> EvidenceClaim | None:
        match = cls._deadline_match(source)
        deadline = cls._parsed_deadline(source)
        if match is None or deadline is None:
            return None
        return EvidenceClaim(
            value=deadline.isoformat(), quote=match.group(), start=match.start(), end=match.end()
        )

    @staticmethod
    def _company_claim(source: str) -> EvidenceClaim | None:
        match = re.search(
            r"\b([A-Z][A-Za-z&.-]+(?:\s+[A-Z][A-Za-z&.-]+){0,3})\s+"
            r"(?:is|are)\s+(?:seeking|looking|requiring)",
            source,
        )
        if match is None:
            return None
        return EvidenceClaim(
            value=match.group(1), quote=match.group(1), start=match.start(1), end=match.end(1)
        )
