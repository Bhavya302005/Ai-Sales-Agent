import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import Settings

SEALED_PHONE_PREFIX = "sealed-phone:v1:"


def _cipher(settings: Settings) -> Fernet:
    # Keep phone encryption domain-separated from JWT signing while allowing existing
    # deployments to use their already-required high-entropy application secret.
    material = hashlib.sha256(
        b"signalpath/contact-phone/v1\0"
        + settings.jwt_secret.get_secret_value().encode("utf-8")
    ).digest()
    return Fernet(base64.urlsafe_b64encode(material))


def seal_phone_number(phone: str, settings: Settings) -> str:
    return SEALED_PHONE_PREFIX + _cipher(settings).encrypt(phone.encode("utf-8")).decode("ascii")


def is_dialable_phone_ref(reference: str | None) -> bool:
    return bool(
        reference
        and (
            reference.startswith(SEALED_PHONE_PREFIX)
            or reference in {"env:OMNIDIM_TEST_TO_NUMBER", "env:TWILIO_TEST_TO_NUMBER"}
        )
    )


def resolve_phone_number(reference: str | None, settings: Settings) -> str:
    if reference == "env:OMNIDIM_TEST_TO_NUMBER" and settings.omnidim_test_to_number:
        return settings.omnidim_test_to_number.get_secret_value()
    if reference == "env:TWILIO_TEST_TO_NUMBER" and settings.twilio_test_to_number:
        return settings.twilio_test_to_number.get_secret_value()
    if not reference or not reference.startswith(SEALED_PHONE_PREFIX):
        raise ValueError("contact does not have a dialable phone reference")
    token = reference.removeprefix(SEALED_PHONE_PREFIX)
    try:
        phone = _cipher(settings).decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeError, ValueError) as exc:
        raise ValueError("contact phone reference cannot be decrypted") from exc
    if not phone.startswith("+") or not phone[1:].isdigit() or not 8 <= len(phone[1:]) <= 15:
        raise ValueError("contact phone reference is invalid")
    return phone
