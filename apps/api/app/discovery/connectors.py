import ipaddress
import socket
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx
from trafilatura import extract


@dataclass(frozen=True)
class SourceCandidate:
    external_id: str
    canonical_url: str
    source_type: str
    rights_note: str
    published_at: datetime | None
    snapshot_ref: str | None
    discovery_title: str | None = None
    discovery_company: str | None = None
    discovery_location: str | None = None
    opportunity_type: str | None = None
    discovery_actionable: bool | None = None
    provider_metadata: dict[str, Any] | None = None


@dataclass(frozen=True)
class FetchedSource:
    candidate: SourceCandidate
    content: bytes


class SourceConnector(Protocol):
    def discover(self) -> list[SourceCandidate]: ...

    def fetch(self, external_id: str) -> FetchedSource: ...


class FixtureConnector:
    FIXTURE_ID = "narmada-erp-cloud-migration-2026"

    def __init__(self, repository_root: Path | None = None) -> None:
        self.repository_root = repository_root or Path(__file__).resolve().parents[4]
        self._candidate = SourceCandidate(
            external_id=self.FIXTURE_ID,
            canonical_url=f"fixture://permitted/{self.FIXTURE_ID}",
            source_type="permitted_fixture",
            rights_note="Synthetic fixture authored for this demo; safe to store and display.",
            published_at=datetime.fromisoformat("2026-09-15T06:30:00+00:00"),
            snapshot_ref="tests/fixtures/permitted_requirement.txt",
        )

    def discover(self) -> list[SourceCandidate]:
        return [self._candidate]

    def fetch(self, external_id: str) -> FetchedSource:
        if external_id != self._candidate.external_id:
            raise KeyError(external_id)
        assert self._candidate.snapshot_ref is not None
        path = self.repository_root / self._candidate.snapshot_ref
        return FetchedSource(candidate=self._candidate, content=path.read_bytes())


class SourcePolicyError(ValueError):
    pass


def resolve_addresses(hostname: str, port: int) -> list[str]:
    return list(
        {
            str(address[4][0])
            for address in socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        }
    )


def canonicalize_public_url(
    url: str,
    allowed_hosts: set[str],
    resolver: Callable[[str, int], list[str]] = resolve_addresses,
) -> str:
    parsed = urlsplit(url.strip())
    hostname = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or not hostname:
        raise SourcePolicyError("Only absolute HTTPS source URLs are allowed")
    if parsed.username or parsed.password or (parsed.port is not None and parsed.port != 443):
        raise SourcePolicyError("Credentials and non-standard ports are not allowed")
    if hostname not in allowed_hosts:
        raise SourcePolicyError("Source host is not on the explicit allowlist")
    try:
        addresses = resolver(hostname, 443)
    except OSError as exc:
        raise SourcePolicyError("Source host could not be resolved") from exc
    if not addresses:
        raise SourcePolicyError("Source host has no resolved address")
    for address in addresses:
        try:
            parsed_address = ipaddress.ip_address(address)
        except ValueError as exc:
            raise SourcePolicyError("Source host returned an invalid address") from exc
        if not parsed_address.is_global:
            raise SourcePolicyError("Source host resolves to a non-public address")
    netloc = hostname
    path = parsed.path or "/"
    return urlunsplit(("https", netloc, path, parsed.query, ""))


def visible_text(content: bytes, content_type: str) -> bytes:
    if "text/plain" in content_type:
        return content
    extracted = extract(
        content,
        output_format="txt",
        include_comments=False,
        include_tables=False,
        favor_precision=True,
    )
    return (extracted or "").encode()


class _FrameSourceParser(HTMLParser):
    """Collect safe document metadata and legacy frame URLs without executing content."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.sources: list[str] = []
        self.metadata: list[str] = []
        self._inside_title = False

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        normalized_tag = tag.casefold()
        values = dict(attrs)
        if normalized_tag == "title":
            self._inside_title = True
        if normalized_tag == "meta":
            name = (values.get("name") or values.get("property") or "").casefold()
            value = (values.get("content") or "").strip()
            if name in {"description", "keywords", "og:title", "og:description"} and value:
                self.metadata.append(value)
        if normalized_tag not in {"frame", "iframe"}:
            return
        source = values.get("src")
        if source and len(self.sources) < 3:
            self.sources.append(source.strip())

    def handle_endtag(self, tag: str) -> None:
        if tag.casefold() == "title":
            self._inside_title = False

    def handle_data(self, data: str) -> None:
        value = data.strip()
        if self._inside_title and value:
            self.metadata.append(value)


def frame_sources(content: bytes) -> list[str]:
    parser = _FrameSourceParser()
    parser.feed(content.decode("utf-8", errors="replace"))
    return parser.sources


def metadata_text(content: bytes) -> bytes:
    parser = _FrameSourceParser()
    parser.feed(content.decode("utf-8", errors="replace"))
    return "\n".join(dict.fromkeys(parser.metadata)).encode()


class ManualHTTPConnector:
    def __init__(
        self,
        *,
        allowed_hosts: set[str],
        max_bytes: int,
        client: httpx.Client | None = None,
        resolver: Callable[[str, int], list[str]] = resolve_addresses,
        follow_same_site_frame: bool = False,
        allow_metadata_fallback: bool = False,
    ) -> None:
        self.allowed_hosts = allowed_hosts
        self.max_bytes = max_bytes
        self.client = client or httpx.Client(timeout=httpx.Timeout(10, connect=5))
        self.resolver = resolver
        self.follow_same_site_frame = follow_same_site_frame
        self.allow_metadata_fallback = allow_metadata_fallback

    def fetch_url(self, url: str, rights_note: str) -> FetchedSource:
        return self._fetch_url(url, rights_note, may_follow_frame=True)

    def _fetch_url(
        self, url: str, rights_note: str, *, may_follow_frame: bool
    ) -> FetchedSource:
        current_url = canonicalize_public_url(url, self.allowed_hosts, self.resolver)
        for _ in range(4):
            with self.client.stream(
                "GET",
                current_url,
                headers={"User-Agent": "SignalPath-PermittedImporter/0.1"},
                follow_redirects=False,
            ) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        raise SourcePolicyError("Redirect response omitted its destination")
                    current_url = canonicalize_public_url(
                        urljoin(current_url, location), self.allowed_hosts, self.resolver
                    )
                    continue
                response.raise_for_status()
                content_type = response.headers.get("content-type", "").lower()
                if not ("text/html" in content_type or "text/plain" in content_type):
                    raise SourcePolicyError("Source must be HTML or plain text")
                content = bytearray()
                for chunk in response.iter_bytes():
                    content.extend(chunk)
                    if len(content) > self.max_bytes:
                        raise SourcePolicyError("Source exceeds the configured byte limit")
                normalized = visible_text(bytes(content), content_type)
                if not normalized.strip():
                    if self.follow_same_site_frame and may_follow_frame:
                        current_host = (urlsplit(current_url).hostname or "").casefold()
                        for source in frame_sources(bytes(content)):
                            frame_url = urljoin(current_url, source)
                            frame_host = (urlsplit(frame_url).hostname or "").casefold()
                            if not frame_host or not (
                                frame_host == current_host
                                or frame_host.endswith(f".{current_host}")
                            ):
                                continue
                            self.allowed_hosts.add(frame_host)
                            return self._fetch_url(
                                frame_url, rights_note, may_follow_frame=False
                            )
                    if self.allow_metadata_fallback:
                        normalized = metadata_text(bytes(content))
                if not normalized.strip():
                    raise SourcePolicyError("Source contains no readable text")
                return FetchedSource(
                    candidate=SourceCandidate(
                        external_id=current_url,
                        canonical_url=current_url,
                        source_type="permitted_manual_url",
                        rights_note=rights_note.strip(),
                        published_at=None,
                        snapshot_ref=None,
                    ),
                    content=normalized,
                )
        raise SourcePolicyError("Source exceeded the redirect limit")
