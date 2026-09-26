#!/usr/bin/env bash
set -euo pipefail

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
web_port="${SIGNALPATH_WEB_PORT:-3000}"
api_port="${SIGNALPATH_API_PORT:-8000}"
api_log="/tmp/signalpath-ios-api.log"
web_log="/tmp/signalpath-ios-web.log"
started_pids=()

cleanup() {
  for process_id in "${started_pids[@]:-}"; do
    if [[ -n "${process_id}" ]]; then
      kill "${process_id}" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT INT TERM

wait_for_url() {
  local url="$1"
  local label="$2"
  local log_file="$3"
  for _attempt in {1..30}; do
    if curl --fail --silent --show-error "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "${label} did not become ready. Recent log output:"
  tail -n 30 "${log_file}" 2>/dev/null || true
  return 1
}

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok is not installed. Install it with: brew install ngrok"
  exit 1
fi

if ! ngrok config check >/dev/null 2>&1; then
  echo "ngrok is not configured. Run: ngrok config add-authtoken YOUR_NGROK_TOKEN"
  exit 1
fi

if ! curl --fail --silent "http://127.0.0.1:${api_port}/health/live" >/dev/null 2>&1; then
  echo "Starting SignalPath API on port ${api_port}..."
  (
    cd "${repo_root}"
    exec .venv/bin/uvicorn app.main:app --app-dir apps/api \
      --host 127.0.0.1 --port "${api_port}"
  ) >"${api_log}" 2>&1 &
  started_pids+=("$!")
  wait_for_url "http://127.0.0.1:${api_port}/health/live" "SignalPath API" "${api_log}"
fi

if ! curl --fail --silent "http://127.0.0.1:${web_port}" >/dev/null 2>&1; then
  echo "Starting SignalPath web app on port ${web_port}..."
  (
    cd "${repo_root}/apps/web"
    API_BASE_URL="http://127.0.0.1:${api_port}" exec npm run dev -- \
      --hostname 127.0.0.1 --port "${web_port}"
  ) >"${web_log}" 2>&1 &
  started_pids+=("$!")
  wait_for_url "http://127.0.0.1:${web_port}" "SignalPath web app" "${web_log}"
fi

echo "Opening an HTTPS tunnel to SignalPath on port ${web_port}."
echo "Open the ngrok HTTPS URL in iPhone Safari, then choose Share > Add to Home Screen."
exec ngrok http "${web_port}"
