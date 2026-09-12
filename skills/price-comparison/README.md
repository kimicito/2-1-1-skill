# Price Comparison Skill v7.7

[![OpenClaw](https://img.shields.io/badge/OpenClaw-Skill-blue)](https://openclaw.ai)
[![Version](https://img.shields.io/badge/version-7.7-green)](SKILL.md)

Skill для поиска и сравнения цен на материалы и оборудование. Работает с Excel-таблицами, ищет по B2B-каталогам и маркетплейсам, записывает 2 цены + аналоги.

## ⚠️ Важно: Какие файлы использовать

**Для работы используйте только эти файлы:**

| Файл | Назначение | Обязательный |
|------|-----------|-------------|
| `scripts/runner_v3.py` | Генерация Excel с inline eval | ✅ Да |
| `scripts/eval.py` | Post-factum проверка (25 проверок) | ✅ Да |
| `scripts/inline_eval.py` | Inline проверки во время работы | ✅ Да (вызывается runner_v3.py) |
| `scripts/matrix_builder_v3.py` | Сборка матриц аналогов | ⚪ Опционально |
| `SKILL.md` | Полная документация для агента | 📖 Читать |
| `HARNESS.md` | Архитектура и state machine | 📖 Читать |

**Не используйте** файлы из `archive/v5-v6/` — они устарели.

## Формула 2+1+1

| Тип | Описание | Лимит | Fallback |
|-----|----------|-------|----------|
| **Цена 1** | Оригинал, поставщик 1 | 10 мин | FAIL если не найдена |
| **Цена 2** | Оригинал, поставщик 2 | 10 мин | «Не найдена за 10 мин» |
| **Аналог др. марки** | Другой бренд | 5 мин | «—» (прочерк) |
| **Аналог той же марки** | Тот же бренд | 10 мин | «—» (прочерк) |

## Возможности v7.7

- ✅ **Кликабельные цены** — каждая цена = гиперссылка на товар
- ✅ **25 проверок eval** — 11 FAIL + 14 WARN
- ✅ **Матрицы аналогов** — секции сравнения на отдельных вкладках
- ✅ **Проверка URL** — защита от ссылок на главную/404/поиск
- ✅ **Graceful fallback** — "Цена не указана" вместо блокировки

## Быстрый старт

```bash
# Установка
git clone https://github.com/kimicito/price-comparison-skill.git

# Создание Excel с ценами
python3 scripts/runner_v3.py input.xlsx results.json output/

# Проверка готового файла
python3 scripts/eval.py output/price_comparison_main_*.xlsx
```

## Структура репозитория

```
price-comparison-skill/
├── scripts/
│   ├── runner_v3.py          ← Используй это (основной runner)
│   ├── eval.py               ← Используй это (проверка)
│   ├── inline_eval.py        ← Используй это (inline проверки)
│   ├── matrix_builder_v3.py  ← Используй это (матрицы аналогов)
│   └── ...                   ← Другие актуальные скрипты
├── archive/
│   └── v5-v6/                ← ❌ НЕ ИСПОЛЬЗУЙ (старые версии)
│       ├── runner.py
│       ├── runner_v2.py
│       ├── cache_v2.py
│       └── ...
├── SKILL.md                  ← 📖 Документация для агента
├── HARNESS.md                ← 📖 Архитектура
├── README.md                 ← 📖 Этот файл
└── templates/                ← Шаблоны категорий
```

## Архитектура

```
[Excel input] → [Поиск цен] → [Inline Eval] → [Excel + URL] → [Eval] → [Итоговый файл]
                                      ↓
                              [Матрицы аналогов]
```

## Версии

- **v7.7** — URL validation + fallback prices + matrix sheets
- **v7.3** — Anti-hallucination eval checks
- **v7.0** — Formula 2+1+1 + Clickable Links + Full Design
- **v6.0** — Tests, retry/fallback, cache v2 (в архиве)
- **v5.2** — Excel Format v2 (в архиве)

## Лицензия

MIT — свободное использование в проектах OpenClaw.
