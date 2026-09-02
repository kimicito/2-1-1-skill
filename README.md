# PriceHunter 2+1+1 — SaaS для сравнения цен закупок

> Автоматический закупочный аналитик: ищет 2 цены оригинала + 2 аналога, строит матрицу сравнения и рекомендации.

## 🚀 Быстрый старт

### 1. Клонировать и установить

```bash
git clone https://github.com/kimicito/2-1-1-skill.git pricehunter
cd pricehunter
npm install
```

### 2. Настроить переменные окружения

```bash
cp .env.example .env
# Отредактировать .env — см. раздел "Переменные окружения"
```

### 3. Запустить базу данных

```bash
# Через Docker Compose (рекомендуется)
docker compose up -d db

# Или локальный MySQL
mysql -u root -p -e "CREATE DATABASE pricehunter CHARACTER SET utf8mb4;"
```

### 4. Применить миграции

```bash
npm run db:push
```

### 5. Запустить

```bash
# Разработка (frontend + backend hot reload)
npm run dev

# Production
npm run build
npm start

# Или через Docker Compose (всё включено)
docker compose up -d
```

Приложение доступно по адресу `http://localhost:3000`

---

## ⚙️ Переменные окружения

### Обязательные

| Переменная | Описание | Пример |
|-----------|----------|--------|
| `DATABASE_URL` | MySQL connection string | `mysql://user:pass@localhost:3306/pricehunter` |
| `APP_ID` | Kimi OAuth App ID | `abc123` |
| `APP_SECRET` | JWT signing secret (мин. 32 символа) | `super-secret-key-32chars-min` |
| `VITE_KIMI_AUTH_URL` | Kimi Auth URL (frontend) | `https://auth.kimi.com` |
| `KIMI_AUTH_URL` | Kimi Auth URL (backend) | `https://auth.kimi.com` |
| `KIMI_OPEN_URL` | Kimi Open Platform | `https://open.kimi.com` |
| `OWNER_UNION_ID` | Union ID первого пользователя (получит admin) | `union_abc123` |

### Опциональные

| Переменная | Описание | По умолчанию |
|-----------|----------|-------------|
| `KIMI_API_KEY` | Kimi API key для LLM-агента | — (будет использоваться scraping) |
| `KIMI_API_URL` | Kimi API endpoint | `https://api.moonshot.cn/v1/chat/completions` |
| `KIMI_MODEL` | Модель Kimi | `kimi-k2-0905-preview` |
| `NODE_ENV` | Режим | `development` |

---

## 🏗 Архитектура

```
Frontend (React 19 + Vite + Tailwind)
    ↓ tRPC
Backend (Hono + tRPC + Drizzle ORM)
    ↓
MySQL — задачи, пользователи, результаты
    ↓
LLM Agent (Kimi API + $web_search)
    ↓
Fallback: DuckDuckGo + Bing scraping
```

### Схема БД

- **users** — пользователи (OAuth Kimi)
- **plans** — тарифные планы (free/pro/business)
- **jobs** — задачи на сравнение цен
- **job_items** — позиции в задаче

### Формула 2+1+1

Для каждой позиции агент ищет:
1. **Цена 1** — оригинал у поставщика 1
2. **Цена 2** — оригинал у ДРУГОГО поставщика
3. **Аналог 1** — другая марка, идентичные параметры
4. **Аналог 2** — та же марка, другая модель

Результат: Excel с 4 вкладками + рекомендации (согласовать / тест / отказать).

---

## 📦 Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Разработка (Vite dev server) |
| `npm run build` | Сборка production |
| `npm start` | Запуск production сервера |
| `npm run db:push` | Применить миграции Drizzle |
| `npm run db:generate` | Сгенерировать миграции |
| `npm test` | Запуск тестов (Vitest) |
| `npm run format` | Форматирование кода |

---

## 🐳 Docker

```bash
# Всё включено: MySQL + App
docker compose up -d

# Только база данных
docker compose up -d db

# Логи
docker compose logs -f app

# Остановить
docker compose down
```

---

## 🔑 Kimi OAuth — настройка

1. Перейти на [open.kimi.com](https://open.kimi.com)
2. Создать приложение
3. Callback URL: `http://localhost:3000/api/auth/callback`
4. Скопировать `APP_ID` и `APP_SECRET` в `.env`
5. Первый пользователь, который залогинится, получит роль `admin` (проверка по `OWNER_UNION_ID`)

---

## 📄 Лицензия

MIT
