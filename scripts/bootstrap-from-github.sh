#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

REPO_URL="${REPO_URL:-https://github.com/ski28dev/mtproxy-logs-panel.git}"
REPO_REF="${REPO_REF:-main}"
WORKDIR="${WORKDIR:-/opt/mtproxy-logs-panel-bootstrap}"
ENV_PATH="${ENV_PATH:-/root/mtproxy-full-stack.env}"
ENV_URL="${ENV_URL:-}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends git curl ca-certificates openssl

rm -rf "${WORKDIR}"
git clone --depth 1 --branch "${REPO_REF}" "${REPO_URL}" "${WORKDIR}"

if [[ -n "${ENV_URL}" ]]; then
  curl -fsSL "${ENV_URL}" -o "${ENV_PATH}"
  chmod 600 "${ENV_PATH}"
elif [[ ! -f "${ENV_PATH}" ]]; then
  cp "${WORKDIR}/templates/full-stack.quickstart.env" "${ENV_PATH}"
  server_ip="$(hostname -I | awk '{print $1}')"
  db_password="$(openssl rand -hex 12)"
  jwt_secret="$(openssl rand -hex 32)"
  admin_password="$(openssl rand -base64 18 | tr -d '=+/' | cut -c1-18)"

  sed -i.bak \
    -e "s|YOUR_SERVER_IP|${server_ip}|g" \
    -e "s|YOUR_DOMAIN_OR_IP|${server_ip}|g" \
    -e "s|CHANGE_ME_DB_PASSWORD|${db_password}|g" \
    -e "s|CHANGE_ME_JWT_SECRET|${jwt_secret}|g" \
    -e "s|CHANGE_ME_ADMIN_PASSWORD|${admin_password}|g" \
    "${ENV_PATH}"
  rm -f "${ENV_PATH}.bak"
  chmod 600 "${ENV_PATH}"
fi

chmod +x "${WORKDIR}/scripts/"*.sh
"${WORKDIR}/scripts/install-full-stack.sh" "${ENV_PATH}"

echo
echo "Bootstrap completed."
echo "Env file: ${ENV_PATH}"
echo "Info file: /root/mtproxy-full-stack-info.txt"
