# FamilyTasks · Дом и задачи

**English** · A family web app: **tasks**, **pet care**, **shared shopping list**. **UI copy is Russian** (see `languages/`).

**Русский** · Семейное веб-приложение: **поручения**, **уход за питомцами**, **общий список покупок**. **Тексты интерфейса — на русском.**

**English** · **Server-side state** (Node): one JSON document shared by all clients on the same origin. There is **no auth** — the URL is effectively private to the household. The HTTP process is built on **Fabric Hub** (`@fabric/hub`): same port serves the API, optional WebRTC signaling, and in production the built SPA. This file is an anchor for humans and agents: stack, run instructions, where logic lives, data layout, and UI rules.

**Русский** · **Состояние на сервере** (Node): один документ для всех клиентов по тому же origin. **Авторизации нет** — URL знает только семья. Процесс HTTP — поверх **Fabric Hub** (`@fabric/hub`): тот же порт отдаёт API, при необходимости сигналинг WebRTC, в production — собранный SPA. Этот файл — ориентир для людей и ИИ-агентов: стек, запуск, где логика, как устроены данные и ключевые правила UI.

---

## Quick Start
```
npm run build && npm start
```

See http://localhost:3900 for the setup.

---

## Stack · Стек

**English**

| Technology | Role |
|------------|------|
| **React 18** + **TypeScript** | UI under `src/` |
| **Vite 5** | Build, dev server, `/api` proxy to the Hub |
| **Express (via Fabric Hub)** | `GET`/`PUT` `/api/state`, JSON Pointer `GET`/`PUT`/`DELETE` `/api/store`, static `dist/` in production |
| **`@fabric/hub`** | HTTP stack, hub data under `${DATA_DIR}/fabric-hub/` |

Dependencies and scripts are in `package.json` (`concurrently`, `cross-env` for Windows).

**Русский**

| Технология | Роль |
|------------|------|
| **React 18** + **TypeScript** | UI, каталог `src/` |
| **Vite 5** | Сборка, dev-сервер, прокси `/api` → Hub |
| **Express (через Fabric Hub)** | `GET`/`PUT` `/api/state`, JSON Pointer `GET`/`PUT`/`DELETE` `/api/store`, в production — раздача `dist/` |
| **`@fabric/hub`** | HTTP-стек, данные хаба в `${DATA_DIR}/fabric-hub/` |

Зависимости и скрипты — в `package.json` (`concurrently` + `cross-env`).

---

## Run · Запуск

**English** · **Development** runs **two processes**: the Hub/API (`server/api.mjs` via `npm run dev` → `scripts/dev-runner.mjs`) and Vite (port from `vite.config.ts` / `VITE_PORT`, default **5170**). The dev runner picks a free API port (prefers `FAMILY_TASKS_DEV_HTTP_PORT`, then `settings/local.cjs` `http.port`, else from **3000**) and proxies `/api` to it. A separate **Fabric P2P port** is chosen from **9777** upward.

```bash
npm install
npm run dev
```

Open the URL Vite prints. With `base="/"`, the app is at `/`. If the API is unreachable, you see “Нет связи с сервером” and **Повторить**.

**Through the internet (ngrok, dev):**

```bash
npm run dev
ngrok http --host-header=rewrite 5170
```

Use `https://<your-ngrok-host>/` (root). `/api` goes through Vite to the local Hub port.

**Production:**

```bash
npm run build
npm start
```

With `NODE_ENV=production`, static files are served from the build’s base: set **`APP_BASE`** or **`FABRIC_APP_BASE`** to match `vite build` (see `server/api.mjs`). Family Tasks now uses non-default Hub baselines in `settings/local.cjs` to avoid collisions with other Hub services; override any port explicitly with envs: **`PORT`** / **`FABRIC_HUB_PORT`** (HTTP), **`FABRIC_PORT`** (Fabric P2P), **`FABRIC_BITCOIN_PORT`** (bitcoind P2P listen), **`FABRIC_BITCOIN_RPC_PORT`** (bitcoind RPC), **`FABRIC_LIGHTNING_PORT`** (CLN).

**On disk:** `data/app-state.json` plus **`data/fabric-hub/`** (Hub FS, peers, etc.). Root directory: **`DATA_DIR`**. Do not commit runtime data (see `.gitignore`).

**Preview without backend:** `npm run preview` — static only, **no persistence**; use `npm run dev` or `npm start` for full loop.

**Also:** `npm run build:psite` — alternate `base` + sync script; align **`APP_BASE`/`FABRIC_APP_BASE`** and **`vite build --base`** with the real URL.

**Русский** · **Разработка** — **два процесса**: Hub/API (`server/api.mjs`, команда `npm run dev` → `scripts/dev-runner.mjs`) и Vite (порт из `vite.config.ts` / `VITE_PORT`, по умолчанию **5170**). Dev-runner выбирает свободный порт API (приоритет: `FAMILY_TASKS_DEV_HTTP_PORT`, затем `http.port` в `settings/local.cjs`, иначе с **3000**) и проксирует `/api`. Отдельный **P2P-порт Fabric** — с **9777** вверх.

```bash
npm install
npm run dev
```

Открыть URL, который выведет Vite. В dev используется `base="/"` — приложение с корня (`/`). Если API недоступен — экран «Нет связи с сервером» и кнопка «Повторить».

**Через интернет (ngrok, dev):**

```bash
npm run dev
ngrok http --host-header=rewrite 5170
```

Открывать `https://<ваш-домен-ngrok>/` (корень). Запросы к `/api` идут через прокси Vite на локальный Hub.

**Продакшен:**

```bash
npm run build
npm start
```

`NODE_ENV=production`: статика с префикса сборки — задайте **`APP_BASE`** или **`FABRIC_APP_BASE`** в согласовании с `vite build` (см. `server/api.mjs`). Для Family Tasks в `settings/local.cjs` заданы нестандартные базовые порты, чтобы не конфликтовать с другими сервисами на Hub; любой порт можно переопределить env-переменными: **`PORT`** / **`FABRIC_HUB_PORT`** (HTTP), **`FABRIC_PORT`** (Fabric P2P), **`FABRIC_BITCOIN_PORT`** (P2P bitcoind), **`FABRIC_BITCOIN_RPC_PORT`** (RPC bitcoind), **`FABRIC_LIGHTNING_PORT`** (CLN).

**Данные на диске:** `data/app-state.json` и каталог **`data/fabric-hub/`** (FS хаба, peers и т.д.). Корень: **`DATA_DIR`**. Рабочие данные в git не коммитить (см. `.gitignore`).

**Превью без бэкенда:** `npm run preview` — только статика, **сохранение не работает**; полный цикл — `npm run dev` или `npm start`.

**Отдельно:** `npm run build:psite` — сборка с другим `base` и скрипт синхронизации; при деплое выровнять **`APP_BASE`/`FABRIC_APP_BASE`** и **`vite build --base`** с реальным URL.

Туннель к Vite: при необходимости `server.allowedHosts` (см. `vite.config.ts`).

---

## API and sync · API и синхронизация

**English**

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/state` | Load full JSON. **404** if missing; client seeds from `seed.ts` and `PUT`s. |
| `PUT` | `/api/state` | Body: `{ tasks, shopping, petCompletions, … }` — see `PersistedState` in `src/storage.ts`. |
| `GET` | `/api/store?path=/` | JSON Pointer read (RFC 6901); default path `/` is the full document. |
| `PUT` | `/api/store` | Pointer write; `path` `/` replaces document (validated + migrated). |

Optional: `HUB_STOCK_UI=1` serves the stock Hub shell at `/` instead of Family Tasks. For local dev, `FABRIC_BITCOIN_ENABLE=false` is recommended (`server/api.mjs`).

**Client** (`src/hooks/usePersistedApp.ts`, `src/api/persistClient.ts`):

- After edits — **debounced** save (~400 ms); on unmount — flush last state.
- **PUT** errors — banner, **retry every 15 s** until success; on **`online`** — send immediately.
- Every **120 s** — background `GET`; only **`shopping`** is merged per `src/logic/mergeShopping.ts` (local “bought” is not overwritten by stale server `open`; if server has bought and local has open, server wins).

**Русский**

| Метод | Путь | Назначение |
|--------|------|------------|
| `GET` | `/api/state` | Загрузка JSON. **404** — файла ещё нет; клиент берёт сид из `seed.ts` и пишет через `PUT`. |
| `PUT` | `/api/state` | Тело: `{ tasks, shopping, petCompletions, … }` — см. `PersistedState` в `src/storage.ts`. |
| `GET` | `/api/store?path=/` | Чтение по JSON Pointer (RFC 6901); путь по умолчанию `/` — весь документ. |
| `PUT` | `/api/store` | Запись по pointer; `path` `/` — замена документа (валидация + миграция). |

Опционально: `HUB_STOCK_UI=1` — стандартная оболочка Hub на `/` вместо Family Tasks. Для локальной разработки рекомендуется `FABRIC_BITCOIN_ENABLE=false` (`server/api.mjs`).

**Клиент** (`src/hooks/usePersistedApp.ts`, `src/api/persistClient.ts`):

- После изменений — сохранение с **debounce** (~400 ms), при размонтировании — попытка дописать последнее состояние.
- Ошибка **PUT** — баннер, **повтор каждые 15 с** до успеха; при **`online`** — немедленная отправка.
- Раз в **120 с** — фоновый `GET`; в состояние подмешивается **только `shopping`** по правилам `src/logic/mergeShopping.ts`.

---

## Product behavior · Поведение продукта (важно не сломать)

**English**

1. **Tabs** — `TabId` in `src/types.ts`: **All**, per **family member** (`MemberId` in `constants.ts`), **Shopping**.
2. **Day phases** — `getDayPhase` in `src/logic/time.ts` (hour bounds — `DAY_PHASE_HOURS` in `constants.ts`): **morning 05:00–12:00**, **day 12:00–17:00**, **evening 17:00–22:00**, **late night 22:00–01:00**, **sleep 01:00–05:00**. Task relevance — `taskRelevantNow` / `taskRelevantWindow` in `src/logic/relevance.ts`.
3. **Task slots** — `TimeSlot`: morning / day / evening / late night (`night`) / any. If a task is **not done** by end of slot, after the boundary it is **missed** and stays in “now” with a red **«не сделано»** badge (`MISSED_SLOT_LABEL`, `src/logic/slotMissed.ts`). Bounds: **morning → 12:00**, **day → 17:00**, **evening → 22:00**, **late night → 01:00 next day**. For past days, missed state persists until done; slot **`any`** is never marked missed.
4. **Personal tab lists** — in “Актуально сейчас”, rows do not hide after check (only the badge changes). In “Дальше по списку”, sort: **by day phase**, then **by time/slot within phase** (`App.tsx`). **«Задачи»** in the header — edit/delete (`TasksManageDialog.tsx`).
5. **Shopping** — `src/logic/shoppingList.ts`: “buy again” candidates; `sortShoppingForDisplay` keeps **order as in `state.shopping`**. “Снова в список” moves the **same** row to `open` (`reopenShoppingItem`). Server merge — `mergeShopping.ts`.
6. **Pets** — schedule in `constants.ts`, virtual rows in `src/logic/pets.ts`, completions in `petCompletions`.
7. **Daily tasks** — `src/logic/taskDay.ts` (`getEffectiveTaskStatus`).

**Русский**

1. **Вкладки** — `TabId` в `src/types.ts`: обзор **Все**, по **членам семьи** (`MemberId` в `constants.ts`), **Купить**.
2. **Фазы дня** — `getDayPhase` в `src/logic/time.ts` (границы часов — `DAY_PHASE_HOURS` в `constants.ts`): **утро 05:00–12:00**, **день 12:00–17:00**, **вечер 17:00–22:00**, **почти ночь 22:00–01:00**, **время сна 01:00–05:00**. Релевантность задач — `taskRelevantNow` / `taskRelevantWindow` в `src/logic/relevance.ts`.
3. **Слоты задач** — `TimeSlot`: утро / день / вечер / почти ночь (`night`) / любое. Если задача **не закрыта** до конца слота, после границы она считается просроченной и остаётся в «актуально сейчас» с красной плашкой **«не сделано»** (`MISSED_SLOT_LABEL`, `src/logic/slotMissed.ts`). Границы: **утро → 12:00**, **день → 17:00**, **вечер → 22:00**, **почти ночь → 01:00 следующего дня**. Для задач прошлых дней просрочка сохраняется во всех фазах до выполнения; слот **`any`** не помечается как просроченный.
4. **Списки на личной вкладке** — в «Актуально сейчас» строки не прячутся после отметки (меняется только плашка). В «Дальше по списку» сортировка: **по фазам дня**, затем **по времени/слоту внутри фазы** (`App.tsx`). Модалка **«Задачи»** в шапке — правка и удаление (`TasksManageDialog.tsx`).
5. **Покупки** — `src/logic/shoppingList.ts`: кандидаты «Купить ещё», `sortShoppingForDisplay` сохраняет **порядок как в `state.shopping`**. «Снова в список» переводит **ту же** запись в `open` (`reopenShoppingItem`). Слияние с сервером — `mergeShopping.ts`.
6. **Питомцы** — расписание в `constants.ts`, виртуальные строки в `src/logic/pets.ts`, выполнение в `petCompletions`.
7. **Ежедневные задачи** — `src/logic/taskDay.ts` (`getEffectiveTaskStatus`).

---

## Repository layout · Структура репозитория (сокращённо)

**English**

```
server/api.mjs          — Hub + Family Tasks routes + static in production
server/FamilyTasksFabricStore.mjs, fabricPointerStore.mjs, …
data/                   — app-state.json, fabric-hub/ (not in git)
src/
  main.tsx, App.tsx, App.css
  types.ts, constants.ts, seed.ts, storage.ts, paths.ts
  api/persistClient.ts
  hooks/usePersistedApp.ts
  components/TasksManageDialog.tsx, Icons.tsx, …
  logic/
    time.ts, relevance.ts, taskDay.ts
    pets.ts, shoppingList.ts, mergeShopping.ts, slotMissed.ts
```

Changing `PersistedState` requires load migration, API contract updates, or a coordinated reset of `data/app-state.json` / versioning when introduced.

**Русский**

```
server/api.mjs          — Hub + маршруты Family Tasks + static в production
server/FamilyTasksFabricStore.mjs, fabricPointerStore.mjs, …
data/                   — app-state.json, fabric-hub/ (не в git)
src/
  main.tsx, App.tsx, App.css
  types.ts, constants.ts, seed.ts, storage.ts, paths.ts
  api/persistClient.ts
  hooks/usePersistedApp.ts
  components/TasksManageDialog.tsx, Icons.tsx, …
  logic/
    time.ts, relevance.ts, taskDay.ts
    pets.ts, shoppingList.ts, mergeShopping.ts, slotMissed.ts
```

Смена схемы `PersistedState` — миграция при загрузке, смена формата API, или согласованный сброс `data/app-state.json` / версии (при появлении версионирования).

---

## Contribution principles · Принципы правок

**English**

- Do not add an authenticated backend unless explicitly requested; the contract is still one shared state document (+ Hub stores under `fabric-hub/`).
- Do not break **dev**: Hub + Vite with `/api` proxy via `dev-runner`.
- Extending `MemberId`, member list, and pets — via `constants.ts` and types.
- Tasks with `Task.shoppingItemId` stay in sync with shopping in `usePersistedApp` (done / bought).

**Русский**

- Не подключать бэкенд с авторизацией и т.д. без явной задачи; контракт — один общий state-файл (+ хранилища Hub в `fabric-hub/`).
- Не ломать сценарий **dev**: Hub + Vite с прокси `/api` через `dev-runner`.
- Расширение `MemberId`, списка членов и питомцев — через `constants.ts` и типы.
- Задачи с `Task.shoppingItemId` синхронизируются с покупками в `usePersistedApp` (отметка «готово» / разметка куплено).

---

## Commands · Команды

**English**

| Command | Action |
|---------|--------|
| `npm run dev` | Dev runner: Hub (free port) + Vite; full sync when server is up |
| `npm run build` | Build to `dist/` |
| `npm start` | Production: Hub + `dist/` |
| `npm run preview` | Front-end from `dist/` only, no API |
| `npm run build:psite` | Build with psite `base` + sync script |

**Русский**

| Команда | Действие |
|---------|----------|
| `npm run dev` | Dev-runner: Hub (свободный порт) + Vite; полная синхронизация при доступном сервере |
| `npm run build` | Сборка в `dist/` |
| `npm start` | Production: Hub + раздача `dist/` |
| `npm run preview` | Только фронт из `dist/`, без API |
| `npm run build:psite` | Сборка с `base` для psite + sync-скрипт |
