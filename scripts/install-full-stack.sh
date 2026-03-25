#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_ENV_FILE="${STACK_ENV_FILE:-${1:-}}"

if [[ -n "${STACK_ENV_FILE}" ]]; then
  if [[ ! -f "${STACK_ENV_FILE}" ]]; then
    echo "env file not found: ${STACK_ENV_FILE}" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "${STACK_ENV_FILE}"
  set +a
fi

RUNTIME_REPO_URL="${RUNTIME_REPO_URL:-https://github.com/ski28dev/mtproxy-logs.git}"
RUNTIME_REF="${RUNTIME_REF:-main}"
RUNTIME_DIR="${RUNTIME_DIR:-/opt/mtproxy-logs}"
ROOT_FULL_INFO_PATH="${ROOT_FULL_INFO_PATH:-/root/mtproxy-full-stack-info.txt}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends git curl ca-certificates

if [[ ! -d "${RUNTIME_DIR}/.git" ]]; then
  git clone "${RUNTIME_REPO_URL}" "${RUNTIME_DIR}"
else
  git -C "${RUNTIME_DIR}" fetch --all --tags
fi

git -C "${RUNTIME_DIR}" checkout "${RUNTIME_REF}"

export PORT="${PORT:-443}"
export STATS_PORT="${STATS_PORT:-127.0.0.1:8888}"
export FAKE_HOST="${FAKE_HOST:-www.cloudflare.com}"
export RUN_USER="${RUN_USER:-nobody}"
export ENV_FILE="${ENV_FILE:-/etc/mtproxy/mtproxy.env}"
export MANAGED_LIST="${MANAGED_LIST:-/etc/mtproxy/managed_secrets.list}"
export LOG_FILE="${LOG_FILE:-/var/log/mtproxy/mtproxy.log}"

"${RUNTIME_DIR}/scripts/install-runtime.sh"

export APP_BASE_DIR="${APP_BASE_DIR:-/opt/mtproxy-logs-panel}"
export PANEL_PORT="${PANEL_PORT:-8088}"
export API_PORT="${API_PORT:-3210}"
export PANEL_HOST="${PANEL_HOST:-$(hostname -I | awk '{print $1}')}"
export PANEL_ORIGIN="${PANEL_ORIGIN:-http://${PANEL_HOST}:${PANEL_PORT}}"
export PANEL_SERVER_NAMES="${PANEL_SERVER_NAMES:-_}"
export DB_NAME="${DB_NAME:-mtproxy_panel}"
export DB_USER="${DB_USER:-mtproxy_panel}"
export DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -hex 12)}"
export JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
export ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 18 | tr -d '=+/' | cut -c1-18)}"
export MTPROXY_HOST="${MTPROXY_HOST:-${PANEL_HOST}}"
export MTPROXY_PORT="${MTPROXY_PORT:-${PORT}}"
export MTPROXY_FAKE_HOST="${MTPROXY_FAKE_HOST:-${FAKE_HOST}}"
export MTPROXY_SYNC_COMMAND="${MTPROXY_SYNC_COMMAND:-sudo /usr/local/bin/mtproxy-panel-sync}"
export MTPROXY_LOG_PATH="${MTPROXY_LOG_PATH:-${LOG_FILE}}"
export MTPROXY_LOG_STATE_PATH="${MTPROXY_LOG_STATE_PATH:-/var/lib/mtproxy-panel/log-state.json}"
export MTPROXY_SLOT_WINDOW_HOURS="${MTPROXY_SLOT_WINDOW_HOURS:-72}"
export ROOT_INFO_PATH="${ROOT_INFO_PATH:-/root/mtproxy-logs-panel-info.txt}"

"${REPO_DIR}/scripts/install-panel.sh"

runtime_secret_tls="$(awk -F= '/^SECRET_TLS=/{print $2}' "${ENV_FILE}" 2>/dev/null || true)"
runtime_fake_host="$(awk -F= '/^FAKE_HOST=/{print $2}' "${ENV_FILE}" 2>/dev/null || true)"

cat >"${ROOT_FULL_INFO_PATH}" <<EOF
MTProxy runtime repo: ${RUNTIME_REPO_URL}
MTProxy runtime ref: ${RUNTIME_REF}
Runtime env file: ${ENV_FILE}
Managed secrets: ${MANAGED_LIST}
Panel URL: ${PANEL_ORIGIN}/
Panel server names: ${PANEL_SERVER_NAMES}
Admin username: ${ADMIN_USERNAME}
Admin password: ${ADMIN_PASSWORD}
MTProxy port: ${MTPROXY_PORT}
MTProxy fake host: ${runtime_fake_host:-${MTPROXY_FAKE_HOST}}
MTProxy client secret: ${runtime_secret_tls}
EOF
chmod 600 "${ROOT_FULL_INFO_PATH}"

"${REPO_DIR}/scripts/smoke-check.sh"

echo
echo "Full stack installed."
echo "Summary file: ${ROOT_FULL_INFO_PATH}"
