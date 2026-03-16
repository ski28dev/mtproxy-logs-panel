# mtproxy-logs-panel

Альфа-версия `v0.5.0`.

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

## Установка на чистый Ubuntu-сервер

Минимальный сценарий:

```bash
git clone https://github.com/ski28dev/mtproxy-logs-panel.git
cd mtproxy-logs-panel
sudo chmod +x scripts/install-panel.sh
sudo PANEL_HOST=your-server-ip MTPROXY_HOST=your-server-ip ./scripts/install-panel.sh
```

Что делает installer:

- ставит `nginx`, `mariadb`, `nodejs`
- создаёт системного пользователя `mtpanel`
- копирует `api` и `web` в `/opt/mtproxy-logs-panel`
- ставит зависимости и собирает фронт
- создаёт `.env`
- создаёт БД и admin-пользователя
- ставит `systemd`-сервисы и таймеры
- настраивает `nginx` на `8088/tcp`

После установки:

- панель доступна на `http://your-server-ip:8088/`
- данные админа дублируются в `/root/mtproxy-logs-panel-info.txt`

Если `mtproxy-logs` уже установлен на этом же сервере, панель сразу сможет:

- импортировать текущий `Initial MTProxy`
- писать `managed_secrets.list`
- импортировать `MTP_EVENT` из `/var/log/mtproxy/mtproxy.log`
