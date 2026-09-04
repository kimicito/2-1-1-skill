#!/usr/bin/env python3
"""
Eval скрипт для price-comparison skill v3.0.
Проверяет результат перед выдачей пользователю.

Usage:
    python3 eval.py /path/to/result.xlsx [input.xlsx]

Exit codes:
    0 = PASS
    1 = FAIL (критические ошибки)
    2 = WARN (есть замечания, но можно показать)
"""

import sys
import re
from pathlib import Path
from urllib.parse import urlparse

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not installed. Install: pip install openpyxl")
    sys.exit(1)


def is_clickable_url(url):
    """Проверяет, что URL кликабельный (начинается с http)."""
    if not url:
        return False
    url_str = str(url).strip().lower()
    return url_str.startswith('http://') or url_str.startswith('https://')


def is_product_page_url(url, sku_name=""):
    """
    Проверяет, что URL ведёт на конкретную страницу товара, а не на поиск/главную/404.

    Возвращает: (is_valid: bool, reason: str, level: "FAIL"|"WARN")
    """
    if not url:
        return False, "URL пустой", "FAIL"

    url_str = str(url).strip().lower()

    # Проверка на главную страницу (без пути)
    parsed = urlparse(url_str)
    path = parsed.path.strip('/') if parsed.path else ''

    # Если путь пустой - это главная страница
    if not path or path in ['', '/', 'index.html', 'index.php']:
        return False, f"URL ведёт на главную страницу ({parsed.netloc}), не на товар", "FAIL"

    # Паттерны поиска/каталога - не конкретный товар
    search_patterns = [
        '/search', '?q=', 'query=', '/catalog/', '/category/',
        '/products/', '/product-list/', '/filter/',
        '/collection/', '/tag/', '/brand/',
    ]
    for pattern in search_patterns:
        if pattern in url_str:
            return False, f"URL содержит паттерн поиска/каталога ({pattern})", "WARN"

    # Проверка на 404-паттерны (некоторые магазины редиректят на 404-страницу)
    not_found_patterns = [
        '/404', '/not-found', '/error', '/no-product',
        '?error=', '?status=404', '/page-not-found'
    ]
    for pattern in not_found_patterns:
        if pattern in url_str:
            return False, f"URL содержит паттерн 404/ошибки ({pattern})", "FAIL"

    # Проверка что URL содержит идентификатор товара (артикул, ID, slug)
    # Хороший URL товара содержит конкретный идентификатор, а не общие слова
    common_words = ['catalog', 'category', 'search', 'products', 'collection', 'tag']
    path_segments = [s for s in path.split('/') if s]

    # Если последний сегмент - общее слово, скорее всего это не товар
    if path_segments and path_segments[-1] in common_words:
        return False, f"URL оканчивается на общее слово '{path_segments[-1]}'", "WARN"

    # Если URL слишком короткий (< 2 сегмента после домена) - подозрительно
    if len(path_segments) < 2:
        # Но если есть query-параметр с ID - ок
        if not any(param in url_str for param in ['?id=', '&id=', '/id/', '-id-']):
            return False, f"URL слишком короткий ({len(path_segments)} сегмента), похож на категорию", "WARN"

    # Проверка: URL должен содержать числа или специфичные символы (артикул обычно содержит цифры)
    # Это эвристика - не 100%, но ловит явные проблемы
    last_segment = path_segments[-1] if path_segments else ''
    has_identifier = bool(re.search(r'\d', last_segment)) or bool(re.search(r'[-_][a-z0-9]{3,}', last_segment))

    if not has_identifier and sku_name:
        # Проверим, что в URL есть часть артикула (без учёта регистра и спецсимволов)
        sku_clean = re.sub(r'[^a-z0-9]', '', str(sku_name).lower())[:10]
        url_clean = re.sub(r'[^a-z0-9]', '', url_str)
        if sku_clean and sku_clean not in url_clean:
            return False, f"URL не содержит идентификатора товара (артикул '{sku_name}' не найден в URL)", "WARN"

    return True, "OK", "OK"


def get_domain(url):
    """Извлекает домен из URL."""
    try:
        parsed = urlparse(str(url).strip())
        domain = parsed.netloc
        if domain.startswith('www.'):
            domain = domain[4:]
        return domain
    except:
        return ""


def is_numeric_price(value):
    """Проверяет, что значение - число (int/float), не текст."""
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return True
    # Проверяем специальные строковые значения
    str_val = str(value).strip()
    if str_val in ["Цена не указана", "Не найдена", "-", "", "-"]:
        return False
    # Пробуем распарсить строку
    cleaned = str_val.replace(" ", "").replace("₽", "").replace("$", "")
    # Умная обработка запятых: если запятая между цифрами - разделитель тысяч, удаляем
    # Если запятая перед 1-2 цифрами в конце - десятичный разделитель, заменяем на точку
    import re
    # Сначала обрабатываем десятичные запятые (пример: 106,5 → 106.5)
    cleaned = re.sub(r'(\d),(\d{1,2})(?!\d)', r'\1.\2', cleaned)
    # Оставшиеся запятые - разделители тысяч, удаляем
    cleaned = cleaned.replace(",", "")
    try:
        float(cleaned)
        return True
    except:
        return False


def extract_price(value):
    """Извлекает числовое значение цены."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = str(value).strip().replace(" ", "").replace("₽", "").replace("$", "")
    import re
    cleaned = re.sub(r'(\d),(\d{1,2})(?!\d)', r'\1.\2', cleaned)
    cleaned = cleaned.replace(",", "")
    try:
        return float(cleaned)
    except:
        return None


def eval_price_comparison(filepath, input_filepath=None):
    """Основная функция проверки."""

    errors = []
    warnings = []
    stats = {
        "total": 0,
        "with_price_1": 0,
        "with_price_2": 0,
        "with_url_1": 0,
        "with_url_2": 0,
        "missing_any_price": 0,
        "with_analog": 0,
        "analog_not_found": 0,
        "missing_comment": 0,
    }

    wb = openpyxl.load_workbook(filepath)
    ws = wb['Результат сравнения'] if 'Результат сравнения' in wb.sheetnames else wb.active

    # Определяем заголовки по содержимому первой строки
    headers = {}
    for col_idx, cell in enumerate(ws[1], start=1):
        if cell.value:
            headers[str(cell.value).strip().lower()] = col_idx

    def find_col(*variants):
        for v in variants:
            for h, idx in headers.items():
                if v in h:
                    return idx
        return None

    # Ищем колонки (гибко - по подстроке)
    col_num = find_col("No п/п", "No", "номер")
    col_sku = find_col("наименование", "материал", "оборудование", "тмц")
    col_price_1 = find_col("цена 1", "цена1", "поставщик 1", "цена поставщика 1")
    col_url_1 = find_col("url 1", "url1", "сайт 1", "ссылка 1")
    col_supplier_1 = find_col("поставщик 1", "поставщик1")
    col_price_2 = find_col("цена 2", "цена2", "поставщик 2", "цена поставщика 2")
    col_url_2 = find_col("url 2", "url2", "сайт 2", "ссылка 2")
    col_supplier_2 = find_col("поставщик 2", "поставщик2")
    col_analog = find_col("аналог", "другая марка")
    col_analog_price = find_col("цена аналога")
    col_analog_url = find_col("url аналога", "сайт аналога")
    col_analog_supplier = find_col("поставщик аналога")
    col_comment = find_col("комментарий", "рекомендация")

    # Проверка наличия обязательных колонок
    if not col_sku:
        errors.append("FAIL: Не найдена колонка 'Наименование ТМЦ'")
    if not col_price_1:
        errors.append("FAIL: Не найдена колонка 'Цена 1'")
    if not col_analog:
        errors.append("FAIL: Не найдена колонка 'Аналог (другая марка)'")
    if not col_comment:
        errors.append("FAIL: Не найдена колонка 'Комментарий'")

    if errors and len(errors) >= 3:  # Если критичных колонок не хватает
        return "FAIL", errors, warnings, stats

    # Проверка количества позиций vs input
    if input_filepath and Path(input_filepath).exists():
        try:
            wb_input = openpyxl.load_workbook(input_filepath)
            ws_input = wb_input.active
            input_count = ws_input.max_row - 1  # минус заголовок
            if abs(input_count - (ws.max_row - 1)) > 0:
                errors.append(f"FAIL: Количество позиций изменилось: input={input_count}, output={ws.max_row-1}")
        except Exception as e:
            warnings.append(f"WARN: Не удалось сравнить с input файлом: {e}")

    # Проверка каждой строки
    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=False), start=2):
        sku_cell = row[col_sku - 1] if col_sku else None
        sku = str(sku_cell.value).strip()[:50] if sku_cell and sku_cell.value else f"строка_{row_idx}"

        stats["total"] += 1

        # --- Извлекаем значения ---
        price_1 = row[col_price_1 - 1].value if col_price_1 else None
        price_2 = row[col_price_2 - 1].value if col_price_2 else None
        url_1 = row[col_url_1 - 1].value if col_url_1 else None
        url_2 = row[col_url_2 - 1].value if col_url_2 else None
        supplier_1 = row[col_supplier_1 - 1].value if col_supplier_1 else None
        supplier_2 = row[col_supplier_2 - 1].value if col_supplier_2 else None
        analog = row[col_analog - 1].value if col_analog else None
        analog_price = row[col_analog_price - 1].value if col_analog_price else None
        analog_url = row[col_analog_url - 1].value if col_analog_url else None
        analog_supplier = row[col_analog_supplier - 1].value if col_analog_supplier else None
        comment = row[col_comment - 1].value if col_comment else None

        # Если нет URL колонок, но есть магазины - проверим, не содержат ли магазины URL
        if not url_1 and supplier_1 and str(supplier_1).strip().startswith('http'):
            url_1 = supplier_1
        if not url_2 and supplier_2 and str(supplier_2).strip().startswith('http'):
            url_2 = supplier_2
        if not analog_url and analog_supplier and str(analog_supplier).strip().startswith('http'):
            analog_url = analog_supplier

        has_price_1 = price_1 is not None and str(price_1).strip() not in ["", "-", "Не найдена", "Цена не указана"]
        has_price_2 = price_2 is not None and str(price_2).strip() not in ["", "-", "Не найдена", "Цена не указана"]
        has_analog = analog is not None and str(analog).strip() not in ["", "-", "Аналог не найден", "Нет прямого аналога"]

        if has_price_1:
            stats["with_price_1"] += 1
        if has_price_2:
            stats["with_price_2"] += 1
        if has_analog:
            stats["with_analog"] += 1
        if analog and "не найден" in str(analog).lower():
            stats["analog_not_found"] += 1

        # ==================== FAIL CHECKS ====================

        # FAIL 1: Комментарий обязателен
        if not comment or str(comment).strip() in ["", "-"]:
            errors.append(f"FAIL [{sku}]: Пустой комментарий. Каждая позиция должна иметь заполненный комментарий.")
            stats["missing_comment"] += 1

        # FAIL 2: Хотя бы одна цена оригинала
        if not has_price_1 and not has_price_2:
            stats["missing_any_price"] += 1
            errors.append(f"FAIL [{sku}]: Нет ни одной цены оригинала. Минимум 1 цена обязательна.")
            continue

        # FAIL 3: Цены - числовой формат (кроме спецзначений)
        price_1_is_numeric = is_numeric_price(price_1)
        price_2_is_numeric = is_numeric_price(price_2)
        analog_price_is_numeric = is_numeric_price(analog_price) if analog_price is not None else False

        # "Цена не указана" - это нормально, если есть URL
        price_1_is_special = str(price_1).strip() in ["Цена не указана", "Не найдена", "-"] if price_1 else False
        price_2_is_special = str(price_2).strip() in ["Цена не указана", "Не найдена", "-"] if price_2 else False
        analog_price_is_special = str(analog_price).strip() in ["Цена не указана", "Не найдена", "-", "По запросу"] if analog_price is not None else True  # null = по запросу

        if has_price_1 and not price_1_is_numeric and not price_1_is_special:
            errors.append(f"FAIL [{sku}]: Цена 1 не является числом ({price_1}). Должна быть числовая ячейка или 'Цена не указана'.")
        if has_price_2 and not price_2_is_numeric and not price_2_is_special:
            errors.append(f"FAIL [{sku}]: Цена 2 не является числом ({price_2}). Должна быть числовая ячейка или 'Цена не указана'.")
        if has_analog and analog_price is not None and str(analog_price).strip() not in ["", "-"] and not analog_price_is_numeric and not analog_price_is_special:
            errors.append(f"FAIL [{sku}]: Цена аналога не является числом ({analog_price}).")

        # FAIL 4: URL ведут на конкретный товар, а не на поиск/главную/404
        # Если есть URL колонки - проверяем их. Если нет - проверяем магазины (могут быть URL)
        if col_url_1 or (supplier_1 and str(supplier_1).strip().startswith('http')):
            check_url = url_1 if url_1 else supplier_1
            url1_check = is_product_page_url(check_url, sku)
            if has_price_1 and not url1_check[0]:
                if url1_check[2] == "FAIL":
                    errors.append(f"FAIL [{sku}]: {url1_check[1]} - Поставщик 1: {check_url}")
                else:
                    warnings.append(f"WARN [{sku}]: {url1_check[1]} - Поставщик 1: {check_url}")
            elif is_clickable_url(check_url):
                stats["with_url_1"] += 1

        if col_url_2 or (supplier_2 and str(supplier_2).strip().startswith('http')):
            check_url = url_2 if url_2 else supplier_2
            url2_check = is_product_page_url(check_url, sku)
            if has_price_2 and not url2_check[0]:
                if url2_check[2] == "FAIL":
                    errors.append(f"FAIL [{sku}]: {url2_check[1]} - Поставщик 2: {check_url}")
                else:
                    warnings.append(f"WARN [{sku}]: {url2_check[1]} - Поставщик 2: {check_url}")
            elif is_clickable_url(check_url):
                stats["with_url_2"] += 1

        # Если нет URL колонок и магазины - просто названия (не URL)
        if not col_url_1 and not (supplier_1 and str(supplier_1).strip().startswith('http')):
            warnings.append(f"WARN [{sku}]: Нет колонки URL 1. Невозможно проверить ссылку на товар.")
        if not col_url_2 and not (supplier_2 and str(supplier_2).strip().startswith('http')):
            warnings.append(f"WARN [{sku}]: Нет колонки URL 2. Невозможно проверить ссылку на товар.")

        # FAIL 5: Поставщики не дублируются
        if has_price_1 and has_price_2:
            # Если есть URL - сравниваем домены. Если нет - сравниваем названия магазинов
            if url_1 and url_2:
                dom1 = get_domain(url_1)
                dom2 = get_domain(url_2)
            else:
                dom1 = str(supplier_1).strip().lower() if supplier_1 else ""
                dom2 = str(supplier_2).strip().lower() if supplier_2 else ""

            if dom1 and dom2 and dom1 == dom2:
                errors.append(f"FAIL [{sku}]: Поставщики 1 и 2 - один источник ({dom1}). Нужны разные поставщики.")

        # FAIL 6: Аналог - другая марка
        if has_analog and sku:
            original_brand = str(sku).split()[0].lower() if sku else ""
            analog_brand = str(analog).split()[0].lower() if analog else ""
            if original_brand and analog_brand and original_brand == analog_brand:
                errors.append(f"FAIL [{sku}]: Аналог той же марки ({analog_brand}). Должен быть другой производитель.")

        # FAIL 7: Подозрительные паттерны галлюцинаций цен
        if has_price_1 and has_price_2:
            p1 = extract_price(price_1)
            p2 = extract_price(price_2)
            if p1 and p2 and p1 > 0 and p2 > 0:
                ratio = max(p1, p2) / min(p1, p2)
                # Цены отличаются в >10x - вероятная галлюцинация
                if ratio > 10:
                    errors.append(f"FAIL [{sku}]: Цены оригинала отличаются в {ratio:.1f}x ({p1:,.0f} vs {p2:,.0f}). Вероятна галлюцинация - проверьте артикул.")

        # FAIL 8: Возможно разные единицы измерения
        if has_price_1 and has_price_2:
            p1 = extract_price(price_1)
            p2 = extract_price(price_2)
            if p1 and p2:
                # Цена 1 > 100k, Цена 2 < 10k - возможно, упаковка vs штука
                if p1 > 100000 and p2 < 10000 and p1 / p2 > 10:
                    errors.append(f"FAIL [{sku}]: Цена 1 ({p1:,.0f} ₽) в {p1/p2:.0f}x больше Цены 2 ({p2:,.0f} ₽). Возможно, разные единицы измерения (шт vs упаковка/метр).")

        # FAIL 9: Несоответствие рекомендации и цены аналога
        if comment and has_analog and has_price_1 and analog_price:
            comment_lower = str(comment).lower()
            p1 = extract_price(price_1)
            pa = extract_price(analog_price)
            if p1 and pa and pa > p1 * 1.1:  # Аналог дороже на >10%
                if 'согласовать' in comment_lower and not any(word in comment_lower for word in ['лучше', 'премиум', 'надёжн', 'качеств', 'причина', 'дороже']):
                    errors.append(f"FAIL [{sku}]: Рекомендация 'Согласовать', но аналог дороже оригинала ({pa:,.0f} > {p1:,.0f}) без объяснения причины.")

        # FAIL 10: Дублирование Цены1 в Цену2 (галлюцинация)
        # Если Цена2 не найдена — нельзя копировать Цену1, URL1, supplier1 в поле Цены2
        if has_price_1 and has_price_2:
            p1 = extract_price(price_1)
            p2 = extract_price(price_2)
            # Если цены идентичны (или разница < 1%) — проверяем источники
            if p1 and p2 and p1 > 0 and abs(p1 - p2) / p1 < 0.01:
                # Сравниваем источники
                if url_1 and url_2:
                    dom1 = get_domain(url_1)
                    dom2 = get_domain(url_2)
                else:
                    dom1 = str(supplier_1).strip().lower() if supplier_1 else ""
                    dom2 = str(supplier_2).strip().lower() if supplier_2 else ""
                
                if dom1 and dom2 and dom1 == dom2:
                    errors.append(f"FAIL [{sku}]: Цена 2 дублирует Цену 1 (идентичная цена {p1:,.0f} ₽ от того же источника {dom1}). Требуется реальная Цена 2 от другого поставщика или оставить 'Не найдена'.")
        
        # FAIL 11: Цена2 заполнена копией Цены1 при отсутствии второго поставщика
        # Проверяем по совпадению URL или поставщика при наличии обеих цен
        if has_price_1 and has_price_2 and url_1 and url_2:
            if str(url_1).strip() == str(url_2).strip():
                errors.append(f"FAIL [{sku}]: URL Цены 2 идентичен URL Цены 1 ({url_1}). Это один и тот же товар — требуется другой поставщик или 'Не найдена'.")

        # ==================== WARN CHECKS ====================

        # WARN 1: Цена аналога > оригинала → нужно объяснение
        if has_analog and has_price_1:
            p1 = extract_price(price_1)
            pa = extract_price(analog_price)
            if p1 and pa and pa >= p1:
                if comment and ("дороже" not in str(comment).lower() and "лучше" not in str(comment).lower() and "премиум" not in str(comment).lower()):
                    warnings.append(f"WARN [{sku}]: Аналог дороже оригинала ({pa:,.0f} ≥ {p1:,.0f}), но в комментарии нет объяснения.")

        # WARN 2: Экономия рассчитана (в комментарии есть сумма или %)
        if has_analog and has_price_1:
            p1 = extract_price(price_1)
            pa = extract_price(analog_price)
            if p1 and pa and pa < p1:
                economy = p1 - pa
                economy_pct = (economy / p1) * 100
                if comment:
                    comment_lower = str(comment).lower()
                    has_economy = any(word in comment_lower for word in ["экономия", "дешевле", "разница", "выгода", "%", "руб", "₽", "р."])
                    if not has_economy:
                        warnings.append(f"WARN [{sku}]: Не указана экономия в комментарии. Расчёт: {economy:,.0f} ₽ ({economy_pct:.0f}%).")

        # WARN 3: Только 1 цена оригинала
        if has_price_1 and not has_price_2:
            warnings.append(f"WARN [{sku}]: Только 1 цена оригинала. Цель: 2 цены от разных поставщиков.")

        # WARN 4: Цены отличаются подозрительно
        if has_price_1 and has_price_2:
            p1 = extract_price(price_1)
            p2 = extract_price(price_2)
            if p1 and p2 and p1 > 0 and p2 > 0:
                ratio = max(p1, p2) / min(p1, p2)
                if ratio > 10:
                    errors.append(f"FAIL [{sku}]: Цены оригинала отличаются в {ratio:.1f}x ({p1:,.0f} vs {p2:,.0f}). Проверьте артикул.")
                elif ratio > 3:
                    warnings.append(f"WARN [{sku}]: Цены отличаются в {ratio:.1f}x. Рекомендуется проверка ({p1:,.0f} vs {p2:,.0f}).")

        # WARN 5: Абсурдные цены
        if has_price_1:
            p1 = extract_price(price_1)
            if p1 and p1 < 10:
                warnings.append(f"WARN [{sku}]: Подозрительно низкая цена ({p1:,.0f} ₽). Проверьте единицу измерения.")
            if p1 and p1 > 10_000_000:
                warnings.append(f"WARN [{sku}]: Подозрительно высокая цена ({p1:,.0f} ₽). Проверьте единицу измерения.")

        # WARN 6: Есть аналог, но нет URL аналога (URL нужен всегда, особенно при "по запросу")
        if has_analog:
            check_analog_url = analog_url if analog_url else (analog_supplier if analog_supplier and str(analog_supplier).strip().startswith('http') else None)
            if not is_clickable_url(check_analog_url):
                if analog_price is None or str(analog_price).strip() in ["", "-", "По запросу"]:
                    warnings.append(f"WARN [{sku}]: У аналога нет кликабельного URL ({check_analog_url}). При цене 'по запросу' URL обязателен для связи с поставщиком.")
                else:
                    warnings.append(f"WARN [{sku}]: У аналога нет кликабельного URL ({check_analog_url}).")
            else:
                # Проверим, что URL аналога - на конкретный товар
                analog_check = is_product_page_url(check_analog_url, analog)
                if not analog_check[0]:
                    warnings.append(f"WARN [{sku}]: {analog_check[1]} - URL аналога: {check_analog_url}")

        # WARN: Маркетплейс вместо прямого поставщика
        marketplace_patterns = ['market.yandex.ru', 'ozon.ru', 'wildberries.ru', 'aliexpress.ru', 'ebay.com', 'avito.ru']
        for supplier_val, supplier_name in [(supplier_1, "1"), (supplier_2, "2"), (analog_supplier, "аналог")]:
            if supplier_val:
                s_lower = str(supplier_val).lower()
                for mp in marketplace_patterns:
                    if mp in s_lower:
                        warnings.append(f"WARN [{sku}]: Поставщик {supplier_name} - маркетплейс ({mp}). Рекомендуется прямой поставщик для точной цены.")
                        break

        # WARN 7: URL ведёт на поиск или главную страницу (уже проверено в FAIL 4)
        # Дополнительная проверка для аналогов
        if has_analog and analog_url:
            analog_url_check = is_product_page_url(analog_url, analog)
            if not analog_url_check[0]:
                if analog_url_check[2] == "FAIL":
                    errors.append(f"FAIL [{sku}]: {analog_url_check[1]} - URL аналога: {analog_url}")
                else:
                    warnings.append(f"WARN [{sku}]: {analog_url_check[1]} - URL аналога: {analog_url}")

        # WARN 8: Подозрительно низкая цена - возможно, за метр/кг/упаковку
        if has_price_1:
            p1 = extract_price(price_1)
            if p1 and p1 < 10:
                warnings.append(f"WARN [{sku}]: Подозрительно низкая цена ({p1:,.0f} ₽). Проверьте единицу измерения (возможно, цена за метр/кг, а не за штуку).")

        # WARN 9: Подозрительно высокая цена
        if has_price_1:
            p1 = extract_price(price_1)
            if p1 and p1 > 10_000_000:
                warnings.append(f"WARN [{sku}]: Подозрительно высокая цена ({p1:,.0f} ₽). Проверьте единицу измерения (возможно, цена за партию/проект).")

    # ==================== ПРОВЕРКА ДАТЫ ПОИСКА ====================
    # WARN: Дата поиска устарела (>7 дней)
    # Проверяем колонку с датой если она есть
    col_date = find_col("дата", "date")
    if col_date:
        from datetime import datetime, timedelta
        cutoff_date = datetime.now() - timedelta(days=7)
        for row in ws.iter_rows(min_row=2, values_only=False):
            date_cell = row[col_date - 1] if col_date <= len(row) else None
            if date_cell and date_cell.value:
                try:
                    date_val = date_cell.value
                    if isinstance(date_val, str):
                        # Пробуем распарсить строку даты
                        for fmt in ['%Y-%m-%d', '%d.%m.%Y', '%d/%m/%Y']:
                            try:
                                date_val = datetime.strptime(date_val.strip(), fmt)
                                break
                            except:
                                continue
                    if isinstance(date_val, datetime) and date_val < cutoff_date:
                        sku_date = row[col_sku - 1].value if col_sku else ""
                        warnings.append(f"WARN [{sku_date}]: Дата поиска ({date_val.strftime('%Y-%m-%d')}) устарела (>7 дней). Цена может быть неактуальной.")
                except:
                    pass
    # ==================== ПРОВЕРКА КАЧЕСТВА ПОКРЫТИЯ ====================
    if stats['total'] > 0:
        coverage_2prices = stats['with_price_2'] / stats['total'] * 100
        if coverage_2prices < 50:
            warnings.append(f"WARN: Только {coverage_2prices:.0f}% позиций имеют 2 цены оригинала. Цель: >80% для надёжного сравнения.")

        coverage_analog = stats['with_analog'] / stats['total'] * 100
        if coverage_analog < 30 and stats['total'] >= 5:
            warnings.append(f"WARN: Только {coverage_analog:.0f}% позиций имеют аналоги. Возможно, недостаточно глубокий поиск.")

    # ==================== ПРОВЕРКА МАТРИЦ ====================
    matrix_sheets = [s for s in wb.sheetnames if s.startswith("Матрица") or s in ["Аналоги другой марки", "Аналоги той же марки"]]

    # WARN 7: Если есть аналоги, но нет матриц
    if stats["with_analog"] > 0 and len(matrix_sheets) == 0:
        warnings.append(f"WARN: Найдено {stats['with_analog']} аналогов, но нет вкладок с матрицами сравнения.")

    # WARN 8: Критичные отличия в матрице → проверить комментарий
    for sheet_name in matrix_sheets:
        ws_matrix = wb[sheet_name]
        has_critical = False
        for row in ws_matrix.iter_rows(min_row=2, values_only=True):
            for cell in row:
                if cell and "🔴" in str(cell):
                    has_critical = True
                    break
            if has_critical:
                break
        if has_critical:
            # Проверим, что в основном листе есть объяснение риска
            found_risk_comment = False
            for row in ws.iter_rows(min_row=2, values_only=True):
                comment_cell = row[col_comment - 1] if col_comment and col_comment <= len(row) else None
                if comment_cell:
                    c = str(comment_cell).lower()
                    if any(word in c for word in ["критич", "риск", "опасн", "вниман", "⚠️", "🔴"]):
                        found_risk_comment = True
                        break
            if not found_risk_comment:
                warnings.append(f"WARN [{sheet_name}]: В матрице есть критичные отличия (🔴), но в комментариях нет упоминания рисков.")

    # FAIL 9: Проверка наличия ссылок на источники спецификаций в матрицах
    for sheet_name in matrix_sheets:
        ws_matrix = wb[sheet_name]
        has_sources = False
        # Ищем ссылки в первых 10 строках
        for row in ws_matrix.iter_rows(min_row=1, max_row=10, values_only=True):
            for cell in row:
                if cell and isinstance(cell, str):
                    cell_lower = cell.lower()
                    if any(word in cell_lower for word in ['источник', 'http', 'datasheet', 'spec', 'pdf', 'документация']):
                        has_sources = True
                        break
            if has_sources:
                break
        
        if not has_sources:
            # Проверим, есть ли хотя бы URL в ячейках
            has_urls = False
            for row in ws_matrix.iter_rows(min_row=1, max_row=15, values_only=False):
                for cell in row:
                    if cell.value and isinstance(cell.value, str) and cell.value.startswith('http'):
                        has_urls = True
                        break
                if has_urls:
                    break
            
            if not has_urls:
                warnings.append(f"WARN [{sheet_name}]: Нет ссылок на источники спецификаций. Рекомендуется добавить datasheets/сайты производителей для проверки совместимости.")
        else:
            # Проверим, что ссылки кликабельные
            clickable_sources = 0
            for row in ws_matrix.iter_rows(min_row=1, max_row=10, values_only=False):
                for cell in row:
                    if cell.value and isinstance(cell.value, str) and 'http' in str(cell.value):
                        if cell.hyperlink:
                            clickable_sources += 1
            
            if clickable_sources == 0:
                warnings.append(f"WARN [{sheet_name}]: Ссылки на источники найдены, но не кликабельны. Добавьте гиперссылки для удобства проверки.")
    
    # WARN 10: Проверка структуры матриц
    for sheet_name in matrix_sheets:
        ws_matrix = wb[sheet_name]
        headers_found = []
        # Ищем заголовки в первых 5 строках
        for row in ws_matrix.iter_rows(min_row=1, max_row=5, values_only=True):
            for cell in row:
                if cell and isinstance(cell, str):
                    headers_found.append(str(cell).lower())
        
        # Проверяем различные варианты структуры
        has_param = any('параметр' in h for h in headers_found)
        has_original = any(h in headers_found for h in ['оригинал', 'original'])
        has_analog = any(h in headers_found for h in ['аналог', 'альтернатива'])
        has_comparison = any(h in headers_found for h in ['отклонение', 'влияние', 'сравнение'])
        
        # Если есть хотя бы параметр и одна из колонок для сравнения — структура ок
        if not (has_param and (has_original or has_analog or has_comparison)):
            warnings.append(f"WARN [{sheet_name}]: Матрица может быть неполной. Рекомендуемая структура: Параметр | Оригинал | Аналог | Отклонение | Влияние")

    return ("FAIL" if errors else "WARN" if warnings else "PASS"), errors, warnings, stats


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 eval.py <result.xlsx> [input.xlsx]")
        sys.exit(1)

    filepath = Path(sys.argv[1])
    input_filepath = Path(sys.argv[2]) if len(sys.argv) > 2 else None

    if not filepath.exists():
        print(f"ERROR: File not found: {filepath}")
        sys.exit(1)

    status, errors, warnings, stats = eval_price_comparison(filepath, input_filepath)

    # Вывод
    print(f"\n{'='*70}")
    print(f"EVAL RESULT: {status}")
    print(f"{'='*70}")
    print(f"\n📊 Статистика:")
    print(f"  Всего позиций: {stats['total']}")
    print(f"  С ценой 1 (оригинал): {stats['with_price_1']} ({stats['with_price_1']/max(stats['total'],1)*100:.0f}%)")
    print(f"  С ценой 2 (оригинал): {stats['with_price_2']} ({stats['with_price_2']/max(stats['total'],1)*100:.0f}%)")
    print(f"  С аналогом: {stats['with_analog']} ({stats['with_analog']/max(stats['total'],1)*100:.0f}%)")
    print(f"  Аналог не найден: {stats['analog_not_found']}")
    print(f"  Без комментария: {stats['missing_comment']}")
    print(f"  Без цен: {stats['missing_any_price']}")

    if errors:
        print(f"\n❌ FAIL ({len(errors)}):")
        for e in errors[:15]:
            print(f"  • {e}")
        if len(errors) > 15:
            print(f"  ... и ещё {len(errors) - 15}")

    if warnings:
        print(f"\n⚠️  WARN ({len(warnings)}):")
        for w in warnings[:15]:
            print(f"  • {w}")
        if len(warnings) > 15:
            print(f"  ... и ещё {len(warnings) - 15}")

    print(f"\n{'='*70}")

    if status == "PASS":
        print("✅ Готово к выдаче пользователю")
        sys.exit(0)
    elif status == "WARN":
        print("⚠️  Есть замечания, но можно показать")
        sys.exit(2)
    else:
        print("❌ Требуется доработка - отправь feedback агенту")
        sys.exit(1)


if __name__ == "__main__":
    main()
