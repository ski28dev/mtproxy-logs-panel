# mtproxy-logs-panel

Альфа-версия.

`mtproxy-logs-panel` — это прикладной слой для управления `MTProxy` secret-ссылками.

Внутри:

- `Express` API
- панель на `Nuxt`
- схема `MySQL`
- управление secret-ссылками
- история слотов
- импорт логов
- статистика подключений
- группировка ссылок

Этот репозиторий предполагается использовать вместе с `mtproxy-logs`.

## Статус

Это публичная альфа-версия.

- схема БД и имена env-переменных ещё могут меняться
- процесс установки ещё приводится в порядок
- текущий UI уже рабочий, но ещё не финальный
- не публикуй реальные `secret`, конфиги и серверные пароли

## Стек

- Node.js
- Express
- MySQL
- Nuxt 4

## Структура репозитория

- `api/`
  REST API, инициализация БД, sync secret, импорт логов.
- `web/`
  Nuxt frontend.

## Требования

- Node.js 20+
- MySQL 8+ или MariaDB
- рабочий `mtproxy-logs` runtime на том же сервере или в доступной среде

## Переменные API

Начни с:

- [api/.env.example](api/.env.example)

Ключевые переменные:

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

## Локальная установка

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

Для локальной разработки:

```bash
cd web
NUXT_PUBLIC_API_BASE=http://127.0.0.1:3210/api npm run dev
```

## Модель работы

Панель исходит из того, что:

- активные `secret` хранятся в MySQL
- `scripts/sync-mtproxy.mjs` пишет `/etc/mtproxy/managed_secrets.list`
- runtime-сервис перезапускается через `MTPROXY_SYNC_COMMAND`
- `scripts/import-mtproxy-log.mjs` импортирует строки `MTP_EVENT` из логов `MTProxy`

## Production-заметки

- API лучше держать на `127.0.0.1`
- `/api` нужно проксировать через `nginx`
- собранный Nuxt нужно отдавать как статические файлы
- нельзя коммитить реальные `.env`, сгенерированные конфиги и серверные креды
