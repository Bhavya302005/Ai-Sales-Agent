.PHONY: up down logs migrate seed native-install native-migrate native-seed native-reset-demo native-api native-voice native-web check api-test web-test

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

migrate:
	docker compose run --rm migrate alembic -c apps/api/alembic.ini upgrade head

seed:
	docker compose run --rm -w /workspace migrate python -m database.seeds.demo

native-install:
	UV_CACHE_DIR=/private/tmp/ai-sales-agent-uv-cache uv venv .venv --python 3.12
	UV_CACHE_DIR=/private/tmp/ai-sales-agent-uv-cache uv pip install --python .venv/bin/python -e packages/domain -e 'apps/api[dev]'
	npx --yes pnpm@12.4.2 install --frozen-lockfile

native-migrate:
	.venv/bin/alembic -c apps/api/alembic.ini upgrade head

native-seed:
	.venv/bin/python -m database.seeds.demo

native-reset-demo:
	.venv/bin/python -m scripts.reset_demo --confirm-local-demo-reset

native-api:
	.venv/bin/uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8000 --reload

native-voice:
	.venv/bin/uvicorn app.voice_main:app --app-dir apps/api --host 127.0.0.1 --port 8001 --reload

native-web:
	API_BASE_URL=http://127.0.0.1:8000 npx --yes pnpm@12.4.2 --filter @sales-agent/web dev

api-test:
	docker compose run --rm api pytest

web-test:
	docker compose run --rm web pnpm test

check:
	docker compose run --rm api sh -c "ruff check app tests /workspace/packages/domain /workspace/database && mypy app && pytest"
	docker compose run --rm web sh -c "pnpm lint && pnpm typecheck && pnpm test && pnpm build"
