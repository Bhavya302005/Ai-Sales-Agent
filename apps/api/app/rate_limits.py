import hashlib
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import RateLimitBucket


def enforce_rate_limit(
    session: Session,
    *,
    identity: str,
    category: str,
    limit: int,
    now: datetime | None = None,
) -> None:
    current = now or datetime.now(UTC)
    current = current if current.tzinfo else current.replace(tzinfo=UTC)
    window_start = current.replace(second=0, microsecond=0)
    bucket_hash = hashlib.sha256(f"{category}:{identity}".encode()).hexdigest()
    bucket = session.scalar(
        select(RateLimitBucket)
        .where(
            RateLimitBucket.bucket_hash == bucket_hash,
            RateLimitBucket.window_start == window_start,
        )
        .with_for_update()
    )
    if bucket is None:
        bucket = RateLimitBucket(
            bucket_hash=bucket_hash,
            window_start=window_start,
            request_count=0,
            expires_at=window_start + timedelta(minutes=2),
        )
        session.add(bucket)
        session.flush()
    if bucket.request_count >= limit:
        retry_after = max(1, int((window_start + timedelta(minutes=1) - current).total_seconds()))
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Request rate limit reached",
            headers={"Retry-After": str(retry_after)},
        )
    bucket.request_count += 1
    session.flush()
