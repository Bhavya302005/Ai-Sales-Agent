FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /workspace/apps/api
COPY packages/domain /workspace/packages/domain
COPY apps/api/pyproject.toml ./
COPY apps/api/alembic.ini ./
COPY apps/api/app ./app
COPY apps/api/tests ./tests
COPY database /workspace/database
COPY tests/fixtures /workspace/tests/fixtures
RUN pip install --no-cache-dir -e /workspace/packages/domain -e ".[dev]"

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
