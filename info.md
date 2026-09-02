# PriceHunter 2+1+1

Автоматический закупочный аналитик на базе формулы 2+1+1.

## Stack
- Frontend: React 19 + Vite + Tailwind CSS + shadcn/ui
- Backend: Hono + tRPC + Drizzle ORM
- Database: MySQL
- Auth: Kimi OAuth
- LLM: Kimi API (optional, fallback to scraping)

## Quick Start
```bash
npm install
cp .env.example .env
# edit .env
docker compose up -d db
npm run db:push
npm run dev
```

## Docker (production)
```bash
docker compose up -d
```

## Env Variables
See `.env.example`

## Scripts
- `npm run dev` — development
- `npm run build` — production build
- `npm start` — production server
- `npm run db:push` — apply migrations
- `npm test` — run tests
