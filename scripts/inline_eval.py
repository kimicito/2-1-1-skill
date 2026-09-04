"""
Inline Eval — проверки во время работы (не пост-фактум).

Использование:
    from inline_eval import check_price_sanity, check_analog_brand, check_url_valid, check_url_alive
    
    errors, warnings = inline_eval_item(item)
"""

from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def check_url_alive(url, timeout=2):
    """Проверяет, что URL возвращает не 404 (HEAD-запрос).
    
    Args:
        url: проверяемый URL
        timeout: таймаут в секундах
    
    Returns: (ok, level, msg)
        ok: bool — URL живой
        level: 'FAIL' | 'WARN' — уровень проблемы
        msg: str — описание
    """
    if not url:
        return True, None, None
    
    url = str(url).strip()
    if not (url.startswith('http://') or url.startswith('https://')):
        return True, None, None  # Не URL — пропускаем
    
    try:
        req = Request(url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
        response = urlopen(req, timeout=timeout)
        status = response.getcode()
        
        if status == 200:
            return True, None, None
        elif status in (301, 302, 307, 308):
            return True, None, None  # Редирект — нормально
        elif status == 404:
            return False, 'FAIL', f"URL возвращает 404 (Not Found): {url}"
        elif status == 403:
            return False, 'WARN', f"URL возвращает 403 (Forbidden) — возможно, защита от ботов: {url}"
        elif status == 500:
            return False, 'WARN', f"URL возвращает 500 (Server Error): {url}"
        else:
            return True, None, None  # Другие статусы — предупреждение не нужно
            
    except HTTPError as e:
        if e.code == 404:
            return False, 'FAIL', f"URL возвращает 404 (Not Found): {url}"
        elif e.code == 403:
            return False, 'WARN', f"URL возвращает 403 (Forbidden): {url}"
        else:
            return False, 'WARN', f"URL ошибка HTTP {e.code}: {url}"
    except URLError as e:
        return False, 'WARN', f"URL недоступен ({e.reason}): {url}"
    except Exception as e:
        return False, 'WARN', f"URL проверка не удалась ({e}): {url}"


def check_price_sanity(price, reference_price=None, max_deviation=10.0):
    """Проверка, что цена адекватна.
    
    Args:
        price: проверяемая цена
        reference_price: эталонная цена (для сравнения)
        max_deviation: макс. отклонение в разах
    
    Returns: (ok, warning_msg)
    """
    if price is None:
        return True, None
    
    if not isinstance(price, (int, float)):
        return False, f"Цена не числовая: {price}"
    
    if price <= 0:
        return False, f"Цена <= 0: {price}"
    
    if reference_price and reference_price > 0:
        ratio = max(price, reference_price) / min(price, reference_price)
        if ratio > max_deviation:
            return False, f"Цена отличается более чем в {max_deviation}x: {price} vs {reference_price}"
        elif ratio > 3.0:
            return True, f"Цена отличается в {ratio:.1f}x — проверить"
    
    # Абсурдные цены
    if price < 100:
        return True, f"Цена подозрительно низкая: {price} ₽"
    if price > 10_000_000:
        return True, f"Цена подозрительно высокая: {price} ₽"
    
    return True, None


def check_url_valid(url):
    """Проверка, что URL корректный.
    
    Returns: (ok, error_msg)
    """
    if not url:
        return True, None  # URL опционален
    
    url = str(url).strip()
    if not (url.startswith('http://') or url.startswith('https://')):
        return False, f"URL не начинается с http:// или https://: {url}"
    
    try:
        parsed = urlparse(url)
        if not parsed.netloc:
            return False, f"URL без домена: {url}"
    except Exception as e:
        return False, f"URL некорректный: {url} ({e})"
    
    return True, None


def check_analog_brand(original_name, analog_name):
    """Проверка, что аналог — другой бренд (или та же марка с отклонениями).
    
    Returns: (ok, error_msg, is_same_brand)
    """
    if not original_name or not analog_name:
        return True, None, False
    
    original_brand = str(original_name).split()[0].lower()
    analog_brand = str(analog_name).split()[0].lower()
    
    is_same = original_brand == analog_brand
    
    if is_same:
        return True, f"Аналог той же марки ({analog_brand}) — отметить отклонения", True
    
    return True, None, False


def check_suppliers_different(supplier1, supplier2):
    """Проверка, что поставщики разные.
    
    Returns: (ok, warning_msg)
    """
    if not supplier1 or not supplier2:
        return True, "Только один поставщик — рекомендуется найти второго"
    
    s1 = str(supplier1).lower().strip()
    s2 = str(supplier2).lower().strip()
    
    if s1 == s2:
        return False, f"Поставщики одинаковые: {supplier1}"
    
    return True, None


def check_no_duplication(price1, url1, supplier1, price2, url2, supplier2):
    """Проверка, что Цена2 не дублирует Цену1 (галлюцинация).
    
    Returns: (ok, error_msg)
    """
    if price2 is None or price1 is None:
        return True, None
    
    # Если цены числовые и идентичны
    if isinstance(price1, (int, float)) and isinstance(price2, (int, float)):
        if price1 > 0 and abs(price1 - price2) / price1 < 0.01:
            # Проверяем источники
            dom1 = ""
            dom2 = ""
            if url1 and url2:
                try:
                    dom1 = urlparse(str(url1).strip()).netloc.lower().replace('www.', '')
                    dom2 = urlparse(str(url2).strip()).netloc.lower().replace('www.', '')
                except:
                    pass
            elif supplier1 and supplier2:
                dom1 = str(supplier1).strip().lower()
                dom2 = str(supplier2).strip().lower()
            
            if dom1 and dom2 and dom1 == dom2:
                return False, f"Цена 2 дублирует Цену 1 ({price1:,.0f} ₽ от {dom1}). Требуется другой поставщик."
    
    # Проверка на идентичные URL
    if url1 and url2 and str(url1).strip() == str(url2).strip():
        return False, f"URL Цены 2 идентичен URL Цены 1 ({url1}). Один товар выдан за два."
    
    return True, None


def inline_eval_item(item):
    """Полная inline-проверка одной позиции.
    
    Args:
        item: dict с полями price1, price2, analog_price, url1, url2, analog_url, etc.
    
    Returns: (errors, warnings)
    """
    errors = []
    warnings = []
    
    # Проверка цен
    for field in ['price1', 'price2']:
        price = item.get(field)
        if price is not None:
            ok, msg = check_price_sanity(price)
            if not ok:
                errors.append(f"{field}: {msg}")
            elif msg:
                warnings.append(f"{field}: {msg}")
    
    # Проверка аналога
    analog_price = item.get('analog_price')
    analog_brand = item.get('analog_brand')
    
    if analog_brand:
        if analog_price is not None:
            ok, msg = check_price_sanity(analog_price, item.get('price1'))
            if not ok:
                errors.append(f"analog_price: {msg}")
            elif msg:
                warnings.append(f"analog_price: {msg}")
        else:
            warnings.append("analog_price: Цена аналога не указана (по запросу) — вкладка аналогов создаётся без цены")
    
    # Проверка альтернативы (той же марки)
    alt_brand = item.get('alt_brand')
    alt_price = item.get('alt_price')
    
    if alt_brand:
        if alt_price is not None:
            ok, msg = check_price_sanity(alt_price, item.get('price1'))
            if not ok:
                errors.append(f"alt_price: {msg}")
            elif msg:
                warnings.append(f"alt_price: {msg}")
        else:
            warnings.append("alt_price: Цена альтернативы не указана (по запросу) — вкладка аналогов создаётся без цены")
    
    # Проверка URL (формат)
    for field in ['url1', 'url2', 'analog_url']:
        url = item.get(field)
        ok, msg = check_url_valid(url)
        if not ok:
            errors.append(f"{field}: {msg}")
    
    # Проверка URL (404 / доступность) — опционально, с таймаутом
    for field in ['url1', 'url2', 'analog_url']:
        url = item.get(field)
        if url and str(url).startswith('http'):
            ok, level, msg = check_url_alive(url)
            if not ok and msg:
                if level == 'FAIL':
                    errors.append(f"{field}: {msg}")
                else:
                    warnings.append(f"{field}: {msg}")
    
    # Проверка бренда аналога
    ok, msg, is_same = check_analog_brand(item.get('name'), item.get('analog'))
    if msg:
        if is_same:
            warnings.append(f"Аналог: {msg}")
        else:
            warnings.append(f"Аналог: {msg}")
    
    # Проверка поставщиков
    ok, msg = check_suppliers_different(item.get('supplier1'), item.get('supplier2'))
    if msg:
        if not ok:
            errors.append(f"Поставщики: {msg}")
        else:
            warnings.append(f"Поставщики: {msg}")
    
    # Проверка на дублирование Цены1 в Цену2 (новое в v7.5)
    ok, msg = check_no_duplication(
        item.get('price1'), item.get('url1'), item.get('supplier1'),
        item.get('price2'), item.get('url2'), item.get('supplier2')
    )
    if not ok:
        errors.append(f"Дублирование: {msg}")
    
    return errors, warnings


def inline_eval_all(results):
    """Inline-проверка всех позиций.
    
    Returns: dict с суммарной статистикой
    """
    total_errors = 0
    total_warnings = 0
    items_with_errors = 0
    items_with_warnings = 0
    
    for item in results:
        errors, warnings = inline_eval_item(item)
        if errors:
            total_errors += len(errors)
            items_with_errors += 1
            print(f"  ❌ #{item.get('num', '?')}: {item.get('name', '')}")
            for e in errors:
                print(f"     ERROR: {e}")
        if warnings:
            total_warnings += len(warnings)
            items_with_warnings += 1
            if not errors:
                print(f"  ⚠️  #{item.get('num', '?')}: {item.get('name', '')}")
            for w in warnings:
                print(f"     WARN: {w}")
    
    print(f"\n📊 Inline Eval Summary:")
    print(f"   Позиций: {len(results)}")
    print(f"   С ошибками: {items_with_errors} ({total_errors} ошибок)")
    print(f"   С замечаниями: {items_with_warnings} ({total_warnings} предупреждений)")
    
    return {
        'total_items': len(results),
        'items_with_errors': items_with_errors,
        'items_with_warnings': items_with_warnings,
        'total_errors': total_errors,
        'total_warnings': total_warnings,
        'passed': total_errors == 0
    }
