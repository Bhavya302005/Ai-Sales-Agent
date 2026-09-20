"""
api/index.py  —  Vercel Python serverless entry point for the FastAPI backend.

Vercel looks for this file when the route /api/* is configured in vercel.json.
It simply imports the existing FastAPI app and exposes it as `app` which the
Vercel ASGI runtime picks up automatically.
"""
import sys
import os
from pathlib import Path

# Make sure the apps/api directory is on the Python path
_api_root = Path(__file__).resolve().parent.parent / "apps" / "api"
sys.path.insert(0, str(_api_root))

# Load .env for local development
_env_file = Path(__file__).resolve().parents[1] / ".env"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())

from app.main import app  # noqa: E402  — import after sys.path is patched

# Vercel picks up the `app` name automatically
__all__ = ["app"]
