# PriceHunter 2+1+1 — SaaS для сравнения цен закупок

> Автоматический закупочный аналитик: ищет 2 цены оригинала + 2 аналога, строит матрицу сравнения и рекомендации.

## 🚀 Быстрый старт (автоматическая установка)

```bash
git clone https://github.com/kimicito/2-1-1-skill.git pricehunter
cd pricehunter

# 1. Настройте .env (минимум: DATABASE_URL, APP_ID, APP_SECRET, OWNER_UNION_ID)
cp .env.example .env
nano .env

# 2. Запустите автоматическую установку
sudo bash scripts/setup.sh
```

Приложение будет доступно по адресу `http://localhost:3000`

---

## 📋 Ручная установка (пошагово)

### 1. Зависимости

```bash
npm install
```

### 2. Переменные окружения

```bash
cp .env.example .env
# Отредактируйте .env
```

**Обязательные переменные:**

| Переменная | Описание |
|-----------|----------|
| `DATABASE_URL` | MySQL connection string |
| `APP_ID` | Kimi OAuth App ID |
| `APP_SECRET` | JWT secret (мин. 32 символа) |
| `OWNER_UNION_ID` | Union ID первого администратора |

**Опциональные:**

| Переменная | Описание | По умолчанию |
|-----------|----------|-------------|
| `KIMI_API_KEY` | Kimi API key для LLM-агента | — (fallback: scraping) |
| `PORT` | Порт сервера | 3000 |

### 3. База данных

```bash
# Установить MySQL (если ещё не установлен)
sudo apt-get update
sudo apt-get install -y mysql-server
sudo systemctl start mysql

# Создать БД и пользователя
sudo mysql -e "CREATE DATABASE pricehunter CHARACTER SET utf8mb4;"
sudo mysql -e "CREATE USER 'pricehunter'@'localhost' IDENTIFIED BY 'pricehunter_pass';"
sudo mysql -e "GRANT ALL PRIVILEGES ON pricehunter.* TO 'pricehunter'@'localhost';"
sudo mysql -e "FLUSH PRIVILEGES;"

# Применить миграции
npm run db:push
```

### 4. Сборка и запуск

```bash
# Production сборка
npm run build

# Запуск через Node.js напрямую
NODE_ENV=production PORT=3000 node dist/boot.js

# Или через systemd
sudo cp pricehunter.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable pricehunter
sudo systemctl start pricehunter
```

---

## 🎮 Управление приложением

### Systemd (рекомендуется)

```bash
# Статус
sudo systemctl status pricehunter

# Запуск / остановка / перезапуск
sudo systemctl start pricehunter
sudo systemctl stop pricehunter
sudo systemctl restart pricehunter

# Автозапуск при загрузке
sudo systemctl enable pricehunter

# Логи в реальном времени
sudo journalctl -u pricehunter -f

# Логи за последний час
sudo journalctl -u pricehunter --since "1 hour ago"
```

### PM2 (альтернатива)

```bash
# Установить PM2
npm install -g pm2

# Запуск
pm2 start ecosystem.config.js

# Управление
pm2 status
pm2 restart pricehunter
pm2 stop pricehunter
pm2 logs pricehunter

# Автозапуск
pm2 startup
pm2 save
```

### Логи

```bash
# Application logs
/var/log/pricehunter/out.log
/var/log/pricehunter/error.log

# Nginx logs (если настроен)
/var/log/nginx/pricehunter-access.log
/var/log/nginx/pricehunter-error.log
```

---

## 🌐 Nginx + SSL

### 1. Установить Nginx

```bash
sudo apt-get install -y nginx
```

### 2. Настроить конфиг

```bash
sudo cp nginx.conf /etc/nginx/sites-available/pricehunter
# Отредактируйте server_name
sudo nano /etc/nginx/sites-available/pricehunter

sudo ln -s /etc/nginx/sites-available/pricehunter /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### 3. SSL через Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pricehunter.yourdomain.com
```

---

## 💾 Бэкапы

### Ручной бэкап

```bash
bash scripts/backup.sh
# Создаст: /var/backups/pricehunter/pricehunter_YYYYMMDD_HHMMSS.sql.gz
```

### Автоматические бэкапы (cron)

```bash
# Ежедневно в 3:00
sudo crontab -e
# Добавить строку:
0 3 * * * /root/.openclaw/workspace/projects/2-1-1-skill/scripts/backup.sh >> /var/log/pricehunter/backup.log 2>&1
```

### Восстановление из бэкапа

```bash
gunzip /var/backups/pricehunter/pricehunter_20260101_030000.sql.gz
mysql -u pricehunter -p pricehunter < pricehunter_20260101_030000.sql
```

---

## 🔧 Обслуживание

### Обновление приложения

```bash
cd /root/.openclaw/workspace/projects/2-1-1-skill
git pull
npm install
npm run build
sudo systemctl restart pricehunter
```

### Проверка здоровья

```bash
# API доступен?
curl -s http://localhost:3000 | head -1

# База данных?
mysql -u pricehunter -p -e "SELECT COUNT(*) FROM pricehunter.jobs;"

# Место на диске
df -h

# Память
free -h
```

### Очистка старых данных

```bash
# Удалить задачи старше 90 дней
mysql -u pricehunter -p -e "
  DELETE FROM job_items WHERE jobId IN (
    SELECT id FROM jobs WHERE createdAt < NOW() - INTERVAL 90 DAY
  );
  DELETE FROM jobs WHERE createdAt < NOW() - INTERVAL 90 DAY;
"
```

---

## 📊 Мониторинг

### Базовые метрики

```bash
# CPU / Memory процесса
ps aux | grep pricehunter

# Сетевые соединения
ss -tlnp | grep 3000

# Размер БД
mysql -u pricehunter -p -e "
  SELECT 
    table_name,
    ROUND(data_length / 1024 / 1024, 2) AS size_mb
  FROM information_schema.tables
  WHERE table_schema = 'pricehunter';
"
```

### Настройка алертов (опционально)

Добавьте в cron проверку доступности:

```bash
*/5 * * * * curl -sf http://localhost:3000 > /dev/null || echo "PriceHunter DOWN" | mail -s "ALERT" admin@example.com
```

---

## 🐳 Docker (альтернатива)

```bash
# Только база данных
docker compose up -d db

# Всё приложение
docker compose up -d
```

---

## 🆘 Troubleshooting

### Приложение не запускается

```bash
# Проверить логи
sudo journalctl -u pricehunter -n 50

# Проверить .env
cat /root/.openclaw/workspace/projects/2-1-1-skill/.env

# Проверить права
ls -la /var/log/pricehunter
```

### Ошибки базы данных

```bash
# Проверить подключение
mysql -u pricehunter -p -e "SELECT 1;"

# Пересоздать БД (осторожно!)
mysql -u root -e "DROP DATABASE pricehunter; CREATE DATABASE pricehunter;"
npm run db:push
```

### Порт занят

```bash
# Найти процесс
sudo ss -tlnp | grep 3000

# Или изменить порт в .env
PORT=3001
```

---

## 📄 Структура проекта

```
pricehunter/
├── api/                    # Backend (Hono + tRPC)
│   ├── pricehunter/        # Core агент 2+1+1
│   │   ├── agent.ts        # Логика поиска
│   │   ├── worker.ts       # Фоновые задачи
│   │   ├── search.ts       # Web scraping
│   │   ├── llm.ts          # LLM-агент Kimi
│   │   ├── excel.ts        # Генерация отчётов
│   │   └── types.ts        # Типы данных
│   ├── jobs-router.ts      # API задач
│   └── boot.ts             # Точка входа
├── src/                    # Frontend (React + Vite)
│   ├── pages/              # Страницы
│   └── components/ui/      # UI компоненты
├── db/                     # Схема БД
├── scripts/                # Скрипты
│   ├── setup.sh            # Автоустановка
│   └── backup.sh           # Бэкапы
├── .env                    # Переменные окружения
├── pricehunter.service     # Systemd конфиг
├── nginx.conf              # Nginx конфиг
├── ecosystem.config.js     # PM2 конфиг
└── docker-compose.yml      # Docker
```

---

## 📦 Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Разработка |
| `npm run build` | Production сборка |
| `npm start` | Запуск сервера |
| `npm run db:push` | Миграции БД |
| `npm test` | Тесты |

---

## 📞 Поддержка

- **Репозиторий:** https://github.com/kimicito/2-1-1-skill
- **Логи:** `/var/log/pricehunter/`
- **Бэкапы:** `/var/backups/pricehunter/`
