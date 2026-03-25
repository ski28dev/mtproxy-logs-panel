# mtproxy-logs-panel

Альфа-версия `v0.5.2`.

`mtproxy-logs-panel` — это прикладной слой для управления `MTProxy` secret-ссылками.

## Быстрый старт

Если нужен самый короткий путь для fresh server:

```bash
curl -fsSL https://raw.githubusercontent.com/ski28dev/mtproxy-logs-panel/main/scripts/bootstrap-from-github.sh | sudo REPO_REF=v0.5.2 bash
```

После установки смотри:

- `/root/mtproxy-full-stack-info.txt`
- `/root/mtproxy-logs-panel-info.txt`

Если хочешь сначала подправить переменные:

```bash
curl -fsSL https://raw.githubusercontent.com/ski28dev/mtproxy-logs-panel/main/templates/full-stack.quickstart.env -o /root/mtproxy-full-stack.env
curl -fsSL https://raw.githubusercontent.com/ski28dev/mtproxy-logs-panel/main/scripts/bootstrap-from-github.sh -o /root/bootstrap-from-github.sh
# отредактируй /root/mtproxy-full-stack.env
sudo bash /root/bootstrap-from-github.sh
```

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
- `scripts/install-full-stack.sh`
  Почти автоматическая установка полного стека вместе с `mtproxy-logs`.
- `scripts/smoke-check.sh`
  Базовая проверка после установки.
- `templates/full-stack.env.example`
  Единый env-шаблон для full-stack restore.

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

## Почти автоматическая установка полного стека

Если нужно поднять `MTProxy runtime + panel` почти одной командой:

```bash
git clone https://github.com/ski28dev/mtproxy-logs-panel.git
cd mtproxy-logs-panel
cp templates/full-stack.env.example /root/mtproxy-full-stack.env
# отредактируй /root/mtproxy-full-stack.env
sudo chmod +x scripts/*.sh
sudo ./scripts/install-full-stack.sh /root/mtproxy-full-stack.env
```

Если нужен более быстрый старт под типовой single-server сценарий:

```bash
cp templates/full-stack.quickstart.env /root/mtproxy-full-stack.env
```

И потом обычно достаточно заменить:

- `PANEL_HOST`
- `PANEL_ORIGIN`
- `PANEL_SERVER_NAMES`
- `DB_PASSWORD`
- `JWT_SECRET`
- `ADMIN_PASSWORD`

Что делает `install-full-stack.sh`:

- ставит системные зависимости
- клонирует `mtproxy-logs`
- ставит `MTProxy runtime`
- ставит panel
- настраивает `nginx`
- создаёт admin
- пишет итоговую сводку в `/root/mtproxy-full-stack-info.txt`
- запускает smoke-check

Важно:

- это всё ещё `alpha`, а не идеальный production one-click installer
- реальные `secret`, домены и `.env` в git не хранятся
- если нужен домен в `nginx`, задай `PANEL_SERVER_NAMES`

## Установка прямо из интернета

Если нужен bootstrap прямо с GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/ski28dev/mtproxy-logs-panel/main/scripts/bootstrap-from-github.sh | sudo bash
```

Типовая команда для fresh server:

```bash
curl -fsSL https://raw.githubusercontent.com/ski28dev/mtproxy-logs-panel/main/scripts/bootstrap-from-github.sh | sudo REPO_REF=v0.5.2 bash
```

Что делает этот сценарий:

- ставит `git`, `curl`, `openssl`
- клонирует `mtproxy-logs-panel`
- создаёт `/root/mtproxy-full-stack.env` из quickstart-шаблона, если его ещё нет
- автоматически подставляет IP сервера и генерирует пароли
- запускает full-stack installer

Если хочешь передать свой env-файл по URL:

```bash
curl -fsSL https://raw.githubusercontent.com/ski28dev/mtproxy-logs-panel/main/scripts/bootstrap-from-github.sh | sudo ENV_URL=https://example.com/mtproxy-full-stack.env bash
```

Если хочешь управлять установкой через локальный env на сервере:

```bash
curl -fsSL https://raw.githubusercontent.com/ski28dev/mtproxy-logs-panel/main/templates/full-stack.quickstart.env -o /root/mtproxy-full-stack.env
# отредактируй /root/mtproxy-full-stack.env
curl -fsSL https://raw.githubusercontent.com/ski28dev/mtproxy-logs-panel/main/scripts/bootstrap-from-github.sh -o /root/bootstrap-from-github.sh
sudo bash /root/bootstrap-from-github.sh
```

Итоговые доступы после установки:

- runtime summary: `/root/mtproxy-full-stack-info.txt`
- panel summary: `/root/mtproxy-logs-panel-info.txt`
- runtime env: `/etc/mtproxy/mtproxy.env`
- panel env: `/opt/mtproxy-logs-panel/api/.env`
