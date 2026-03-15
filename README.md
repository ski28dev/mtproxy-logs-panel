# mtproxy-logs-panel

Alpha release.

`mtproxy-logs-panel` is the application layer for managing `MTProxy` secret links.

It includes:

- Express API
- Nuxt panel
- MySQL schema
- secret management
- slot history
- log import
- connection statistics
- grouped secret links

This repository is meant to be used together with `mtproxy-logs`.

## Status

This is a public alpha build.

- schema and env names may still change
- install flow is still being cleaned up
- current UI is usable, but not final
- do not publish real secrets, configs or server passwords

## Stack

- Node.js
- Express
- MySQL
- Nuxt 4

## Repository layout

- `api/`
  REST API, DB init scripts, secret sync, log import.
- `web/`
  Nuxt frontend.

## Requirements

- Node.js 20+
- MySQL 8+ or MariaDB
- a working `mtproxy-logs` runtime on the same host or reachable environment

## API env

Start from:

- [api/.env.example](api/.env.example)

Important variables:

- `DB_*`
- `JWT_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `PANEL_ORIGIN`
- `MTPROXY_HOST`
- `MTPROXY_PORT`
- `MTPROXY_FAKE_HOST`
- `MTPROXY_SYNC_COMMAND`
- `MTPROXY_LOG_PATH`

## Local install

### API

```bash
cd api
npm install
cp .env.example .env
npm run init-db
npm run seed-admin
npm start
```

### Web

```bash
cd web
npm install
npm run build
```

For local development:

```bash
cd web
NUXT_PUBLIC_API_BASE=http://127.0.0.1:3210/api npm run dev
```

## Runtime model

The panel assumes:

- active secrets are stored in MySQL
- `scripts/sync-mtproxy.mjs` writes `/etc/mtproxy/managed_secrets.list`
- the runtime service restart is triggered via `MTPROXY_SYNC_COMMAND`
- `scripts/import-mtproxy-log.mjs` imports `MTP_EVENT` log lines from `MTProxy`

## Production notes

- keep the API bound to `127.0.0.1`
- reverse-proxy `/api` through nginx
- serve the built Nuxt app as static files
- never commit real `.env`, generated configs or server credentials

