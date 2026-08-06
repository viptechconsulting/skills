#!/bin/bash
set -uo pipefail

# Keeps OmniRoute (https://github.com/diegosouzapw/OmniRoute) running as a
# local AI gateway for every Claude Code on the web session on this repo, so
# it's always available to route/compress calls across its free-tier
# providers instead of spending paid tokens.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo '{"async": true, "asyncTimeout": 600000}'

OMNIROUTE_PORT="${OMNIROUTE_PORT:-20128}"
LOG_DIR="${HOME}/.omniroute-logs"
mkdir -p "$LOG_DIR"
HEALTH_URL="http://localhost:${OMNIROUTE_PORT}/api/monitoring/health"

is_up() {
  curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1
}

if is_up; then
  echo "OmniRoute already running on port ${OMNIROUTE_PORT}."
else
  if ! command -v omniroute >/dev/null 2>&1; then
    echo "Installing OmniRoute CLI..."
    if ! npm install -g omniroute --no-fund --no-audit >"${LOG_DIR}/install.log" 2>&1; then
      echo "OmniRoute install failed; see ${LOG_DIR}/install.log" >&2
      exit 0
    fi
  fi

  echo "Starting OmniRoute in background on port ${OMNIROUTE_PORT}..."
  omniroute serve --daemon --no-open --port "${OMNIROUTE_PORT}" \
    >"${LOG_DIR}/serve.log" 2>&1 || true

  for _ in $(seq 1 30); do
    is_up && break
    sleep 1
  done
fi

if is_up; then
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    {
      echo "export OMNIROUTE_URL=\"http://localhost:${OMNIROUTE_PORT}\""
      echo "export OMNIROUTE_API_BASE=\"http://localhost:${OMNIROUTE_PORT}/v1\""
    } >> "$CLAUDE_ENV_FILE"
  fi
  echo "OmniRoute is active: http://localhost:${OMNIROUTE_PORT}/v1"
else
  echo "OmniRoute did not come up in time; see ${LOG_DIR}/serve.log" >&2
fi
