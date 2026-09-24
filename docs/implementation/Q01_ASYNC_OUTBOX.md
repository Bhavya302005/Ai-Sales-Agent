# Q01 transactional outbox

- Extraction requests create an outbox event and idempotency record in the same database
  transaction and return `202 Accepted` with a tenant-scoped status URL.
- `ASYNC_MODE=inline` runs the exact same handler contract without RabbitMQ. `celery` dispatches the
  persisted event to an acknowledgement-late worker.
- Extraction and scoring handlers are idempotent. Reusing the same request key returns the same job;
  reusing it for a different payload returns a conflict.
- Failures use bounded exponential backoff for five attempts. Only safe exception class names are
  stored. Exhausted/permanent jobs remain visible as `action_required`.
- A processing claim is committed before work. Jobs left processing by a worker crash become due
  again after two minutes; transactional handler writes roll back and are safely replayed.
- The Sources UI refreshes every two seconds only while a source is queued, processing or retrying.

