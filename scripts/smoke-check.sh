#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

PANEL_PORT="${PANEL_PORT:-8088}"
API_PORT="${API_PORT:-3210}"
MTPROXY_PORT="${MTPROXY_PORT:-443}"

echo "[services]"
systemctl is-active mtproxy
systemctl is-active mtproxy-panel-api
systemctl is-active nginx
systemctl is-active mariadb

echo
echo "[timers]"
systemctl is-active mtproxy-watchdog.timer
systemctl is-active mtproxy-refresh.timer
systemctl is-active mtproxy-panel-import-log.timer
systemctl is-active mtproxy-panel-sync.timer

echo
echo "[ports]"
ss -lntup | egrep "(:${MTPROXY_PORT}|:${PANEL_PORT}|:${API_PORT})" || true

echo
echo "[http]"
curl -fsS "http://127.0.0.1:${API_PORT}/api/health"
echo
panel_code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PANEL_PORT}/")"
echo "panel_http_code=${panel_code}"

echo
echo "[recent mtproxy log]"
tail -n 10 /var/log/mtproxy/mtproxy.log 2>/dev/null || true
