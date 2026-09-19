#!/usr/bin/env python3
"""Fail safely when source-controlled project files resemble high-risk credentials."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_DIRECTORIES = {
    ".git",
    ".mypy_cache",
    ".next",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "node_modules",
    "playwright-report",
    "test-results",
}
EXCLUDED_FILES = {".env", ".env.local"}
TEXT_SUFFIXES = {
    "",
    ".css",
    ".env",
    ".html",
    ".ini",
    ".js",
    ".json",
    ".md",
    ".py",
    ".sql",
    ".toml",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
}

PATTERNS = {
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "GitHub token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    "Sarvam-style key": re.compile(r"\bsk_[A-Za-z0-9_-]{24,}\b"),
    "HubSpot private token": re.compile(r"\bpat-[A-Za-z0-9_-]{24,}\b"),
    "X auth cookie": re.compile(
        r'"name"\s*:\s*"auth_token"[\s\S]{0,240}?"value"\s*:\s*"[A-Fa-f0-9]{32,}"'
    ),
    "X CSRF cookie": re.compile(
        r'"name"\s*:\s*"ct0"[\s\S]{0,240}?"value"\s*:\s*"[A-Fa-f0-9]{32,}"'
    ),
}


def source_files() -> list[Path]:
    return sorted(
        path
        for path in ROOT.rglob("*")
        if path.is_file()
        and path.name not in EXCLUDED_FILES
        and not any(part in EXCLUDED_DIRECTORIES for part in path.relative_to(ROOT).parts)
        and path.suffix.lower() in TEXT_SUFFIXES
        and path.stat().st_size <= 5_000_000
    )


def main() -> int:
    findings: list[tuple[Path, str]] = []
    for path in source_files():
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for label, pattern in PATTERNS.items():
            if pattern.search(content):
                findings.append((path.relative_to(ROOT), label))

    if findings:
        print("Potential credentials detected; values are intentionally not printed:")
        for path, label in findings:
            print(f"- {path}: {label}")
        return 1
    print(f"Secret scan passed ({len(source_files())} project files checked).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
