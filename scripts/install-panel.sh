#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_SRC_DIR="${REPO_DIR}/api"
WEB_SRC_DIR="${REPO_DIR}/web"

APP_BASE_DIR="${APP_BASE_DIR:-/opt/mtproxy-logs-panel}"
API_DIR="${API_DIR:-${APP_BASE_DIR}/api}"
WEB_DIR="${WEB_DIR:-${APP_BASE_DIR}/web}"
STATE_DIR="${STATE_DIR:-/var/lib/mtproxy-panel}"
LOG_DIR="${LOG_DIR:-/var/log/mtproxy}"
NGINX_CONF_PATH="${NGINX_CONF_PATH:-/etc/nginx/conf.d/mtproxy-panel.conf}"
PANEL_PORT="${PANEL_PORT:-8088}"
API_PORT="${API_PORT:-3210}"
DB_NAME="${DB_NAME:-mtproxy_panel}"
DB_USER="${DB_USER:-mtproxy_panel}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -hex 12)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 18 | tr -d '=+/' | cut -c1-18)}"
PANEL_HOST="${PANEL_HOST:-$(hostname -I | awk '{print $1}')}"
PANEL_ORIGIN="${PANEL_ORIGIN:-http://${PANEL_HOST}:${PANEL_PORT}}"
MTPROXY_HOST="${MTPROXY_HOST:-${PANEL_HOST}}"
MTPROXY_PORT="${MTPROXY_PORT:-443}"
MTPROXY_FAKE_HOST="${MTPROXY_FAKE_HOST:-www.cloudflare.com}"
MTPROXY_SYNC_COMMAND="${MTPROXY_SYNC_COMMAND:-sudo /usr/local/bin/mtproxy-panel-sync}"
MTPROXY_LOG_PATH="${MTPROXY_LOG_PATH:-${LOG_DIR}/mtproxy.log}"
MTPROXY_LOG_STATE_PATH="${MTPROXY_LOG_STATE_PATH:-${STATE_DIR}/log-state.json}"
MTPROXY_SLOT_WINDOW_HOURS="${MTPROXY_SLOT_WINDOW_HOURS:-72}"
ROOT_INFO_PATH="${ROOT_INFO_PATH:-/root/mtproxy-logs-panel-info.txt}"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y --no-install-recommends \
  curl \
  ca-certificates \
  gnupg \
  nginx \
  mariadb-server \
  rsync

need_node=1
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [[ "${node_major}" -ge 20 ]]; then
    need_node=0
  fi
fi

if [[ "${need_node}" -eq 1 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y --no-install-recommends nodejs
fi

if ! id -u mtpanel >/dev/null 2>&1; then
  useradd --system --home-dir "${APP_BASE_DIR}" --shell /usr/sbin/nologin mtpanel
fi

install -d -m 755 "${APP_BASE_DIR}" "${STATE_DIR}" "${LOG_DIR}"
install -d -m 755 "${API_DIR}" "${WEB_DIR}"

rsync -a --delete --exclude node_modules --exclude .output --exclude .nuxt --exclude dist "${API_SRC_DIR}/" "${API_DIR}/"
rsync -a --delete --exclude node_modules --exclude .output --exclude .nuxt --exclude dist "${WEB_SRC_DIR}/" "${WEB_DIR}/"

cd "${API_DIR}"
npm ci

cd "${WEB_DIR}"
npm ci
npm run generate

WEB_ROOT=""
for candidate in "${WEB_DIR}/dist" "${WEB_DIR}/.output/public" "${WEB_DIR}/.output/.output/public"; do
  if [[ -d "${candidate}" ]]; then
    WEB_ROOT="${candidate}"
    break
  fi
done

if [[ -z "${WEB_ROOT}" ]]; then
  echo "unable to detect built web root" >&2
  exit 1
fi

cat >"${API_DIR}/.env" <<EOF
HOST=127.0.0.1
PORT=${API_PORT}
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
PANEL_ORIGIN=${PANEL_ORIGIN}
MTPROXY_HOST=${MTPROXY_HOST}
MTPROXY_PORT=${MTPROXY_PORT}
MTPROXY_FAKE_HOST=${MTPROXY_FAKE_HOST}
MTPROXY_SYNC_COMMAND="${MTPROXY_SYNC_COMMAND}"
MTPROXY_LOG_PATH=${MTPROXY_LOG_PATH}
MTPROXY_LOG_STATE_PATH=${MTPROXY_LOG_STATE_PATH}
MTPROXY_SLOT_WINDOW_HOURS=${MTPROXY_SLOT_WINDOW_HOURS}
EOF
chmod 600 "${API_DIR}/.env"

systemctl enable --now mariadb

mysql <<EOF
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
EOF

cd "${API_DIR}"
node scripts/init-db.mjs
node scripts/seed-admin.mjs

if ! mysql -Nse "SELECT 1 FROM ${DB_NAME}.proxy_secrets LIMIT 1" | grep -q 1; then
  if [[ -f /etc/mtproxy/mtproxy.env ]]; then
    secret_raw="$(awk -F= '/^SECRET_RAW=/{print $2}' /etc/mtproxy/mtproxy.env)"
    secret_tls="$(awk -F= '/^SECRET_TLS=/{print $2}' /etc/mtproxy/mtproxy.env)"
    fake_host="$(awk -F= '/^FAKE_HOST=/{print $2}' /etc/mtproxy/mtproxy.env)"
    if [[ -n "${secret_raw}" && -n "${secret_tls}" && -n "${fake_host}" ]]; then
      mysql "${DB_NAME}" <<EOF
INSERT INTO proxy_secrets (label, note, status, raw_secret, client_secret, fake_host, port, max_unique_ips)
VALUES ('Initial MTProxy', 'Imported from existing server config', 'active', '${secret_raw}', '${secret_tls}', '${fake_host}', ${MTPROXY_PORT}, 10);
EOF
    fi
  fi
fi

cat >/usr/local/bin/mtproxy-panel-sync <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd ${API_DIR}
/usr/bin/node scripts/sync-mtproxy.mjs
EOF
chmod 755 /usr/local/bin/mtproxy-panel-sync

sed "s|__API_DIR__|${API_DIR}|g" "${REPO_DIR}/templates/mtproxy-panel-api.service" >/etc/systemd/system/mtproxy-panel-api.service
sed "s|__API_DIR__|${API_DIR}|g" "${REPO_DIR}/templates/mtproxy-panel-import-log.service" >/etc/systemd/system/mtproxy-panel-import-log.service
cp "${REPO_DIR}/templates/mtproxy-panel-import-log.timer" /etc/systemd/system/mtproxy-panel-import-log.timer
sed "s|__API_DIR__|${API_DIR}|g" "${REPO_DIR}/templates/mtproxy-panel-sync.service" >/etc/systemd/system/mtproxy-panel-sync.service
cp "${REPO_DIR}/templates/mtproxy-panel-sync.timer" /etc/systemd/system/mtproxy-panel-sync.timer
cp "${REPO_DIR}/templates/mtproxy-panel.sudoers" /etc/sudoers.d/mtproxy-panel
chmod 440 /etc/sudoers.d/mtproxy-panel

sed \
  -e "s|__PANEL_PORT__|${PANEL_PORT}|g" \
  -e "s|__WEB_ROOT__|${WEB_ROOT}|g" \
  -e "s|__API_PORT__|${API_PORT}|g" \
  "${REPO_DIR}/templates/mtproxy-panel.nginx.conf" > "${NGINX_CONF_PATH}"

touch "${MTPROXY_LOG_PATH}"
chown -R mtpanel:mtpanel "${APP_BASE_DIR}" "${STATE_DIR}"
chown root:mtpanel "${MTPROXY_LOG_PATH}"
chmod 640 "${MTPROXY_LOG_PATH}"

nginx -t

if command -v ufw >/dev/null 2>&1; then
  ufw allow "${PANEL_PORT}/tcp" >/dev/null 2>&1 || true
fi

systemctl daemon-reload
systemctl enable --now mtproxy-panel-api.service
systemctl enable --now mtproxy-panel-import-log.timer
systemctl enable --now mtproxy-panel-sync.timer
systemctl restart nginx
systemctl start mtproxy-panel-import-log.service || true
systemctl start mtproxy-panel-sync.service || true

cat >"${ROOT_INFO_PATH}" <<EOF
Panel URL: ${PANEL_ORIGIN}/
Admin username: ${ADMIN_USERNAME}
Admin password: ${ADMIN_PASSWORD}
API bind: 127.0.0.1:${API_PORT}
DB name: ${DB_NAME}
DB user: ${DB_USER}
DB password: ${DB_PASSWORD}
EOF

echo
echo "MTProxy Logs Panel installed."
echo "Panel URL: ${PANEL_ORIGIN}/"
echo "Admin username: ${ADMIN_USERNAME}"
echo "Admin password: ${ADMIN_PASSWORD}"
