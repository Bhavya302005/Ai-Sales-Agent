"""
SendGrid / SMTP email sender abstraction.
Falls back gracefully if email_outreach_mode == 'disabled'.
"""

from __future__ import annotations

import logging

from app.config import get_settings

logger = logging.getLogger(__name__)

# 1x1 transparent GIF for tracking pixel
TRANSPARENT_PIXEL = bytes([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
    0x01, 0x00, 0x00, 0xFF, 0x00, 0x2C, 0x00, 0x00,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02,
    0x00, 0x3B,
])


class EmailNotConfiguredError(Exception):
    pass


class EmailSendError(Exception):
    pass


def _build_tracking_pixel(draft_id: str, base_url: str) -> str:
    url = f"{base_url}/api/v1/email-outreach/track?id={draft_id}"
    return f'<img src="{url}" width="1" height="1" style="display:none;width:1px;height:1px;" alt="" />'


def inject_tracking_pixel(body_html: str, draft_id: str, base_url: str) -> str:
    """Append a tracking pixel to the HTML body."""
    pixel = _build_tracking_pixel(str(draft_id), base_url)
    return body_html + pixel


async def send_email(
    *,
    to_address: str,
    subject: str,
    body_html: str,
    draft_id: str,
) -> str:
    """
    Dispatch the email. Returns the provider message ID.
    Raises EmailNotConfiguredError if outreach is disabled.
    Raises EmailSendError on delivery failure.
    """
    settings = get_settings()
    mode = settings.email_outreach_mode

    if mode == "disabled":
        raise EmailNotConfiguredError(
            "Email outreach is disabled. Set EMAIL_OUTREACH_MODE=sendgrid and SENDGRID_API_KEY."
        )

    if mode == "sendgrid":
        return await _send_via_sendgrid(
            to_address=to_address,
            subject=subject,
            body_html=body_html,
            settings=settings,
        )

    if mode == "smtp":
        return await _send_via_smtp(
            to_address=to_address,
            subject=subject,
            body_html=body_html,
            settings=settings,
        )

    if mode == "mock":
        import uuid
        message_id = str(uuid.uuid4())
        logger.info("Mock email sent to %s, subject: %s, message_id: %s", to_address, subject, message_id)
        return message_id

    raise EmailNotConfiguredError(f"Unknown email_outreach_mode: {mode}")


async def _send_via_sendgrid(*, to_address: str, subject: str, body_html: str, settings) -> str:
    """Send via SendGrid Web API v3."""
    import httpx

    api_key = settings.sendgrid_api_key.get_secret_value() if settings.sendgrid_api_key else None
    if not api_key:
        raise EmailNotConfiguredError("SENDGRID_API_KEY not set")

    payload = {
        "personalizations": [{"to": [{"email": to_address}]}],
        "from": {"email": settings.email_from_address, "name": settings.email_from_name},
        "subject": subject,
        "content": [{"type": "text/html", "value": body_html}],
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://api.sendgrid.com/v3/mail/send",
            json=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )

    if response.status_code not in (200, 202):
        logger.error("SendGrid error %s: %s", response.status_code, response.text[:300])
        raise EmailSendError(f"SendGrid returned {response.status_code}")

    # SendGrid returns the message ID in the X-Message-Id response header
    message_id = response.headers.get("X-Message-Id", "")
    logger.info("Email sent via SendGrid to %s, message_id=%s", to_address, message_id)
    return message_id


async def _send_via_smtp(*, to_address: str, subject: str, body_html: str, settings) -> str:
    """Send via SMTP using aiosmtplib."""
    import uuid
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    try:
        import aiosmtplib
    except ImportError:
        raise EmailNotConfiguredError("aiosmtplib is not installed; add it to pyproject.toml")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.email_from_name} <{settings.email_from_address}>"
    msg["To"] = to_address
    msg.attach(MIMEText(body_html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host or "localhost",
            port=settings.smtp_port or 587,
            username=settings.smtp_user,
            password=settings.smtp_password.get_secret_value() if settings.smtp_password else None,
            use_tls=False,
            start_tls=True,
        )
    except Exception as exc:
        logger.error("SMTP send failed: %s", exc)
        raise EmailSendError(f"SMTP error: {exc}") from exc

    message_id = str(uuid.uuid4())
    logger.info("Email sent via SMTP to %s, local_id=%s", to_address, message_id)
    return message_id
