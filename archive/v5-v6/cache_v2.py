"""
Cache v2 — улучшенное кэширование с TTL по категориям.

Использование:
    from cache_v2 import PriceCache
    
    cache = PriceCache('cache/prices_v2.json')
    cache.set('Cisco C9200', data, category='switches')
    data = cache.get('Cisco C9200', category='switches')
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path


class PriceCache:
    """Кэш цен с TTL по категориям и версионированием."""
    
    DEFAULT_TTL = {
        'ip_cameras': 14,      # Камеры — редко меняются
        'switches': 7,          # Коммутаторы — средне
        'fiber_optic_patches': 14,  # Оптика — редко
        'copper_cables': 30,    # Кабели — почти не меняются
        '_default': 7           # По умолчанию
    }
    
    CACHE_VERSION = 2
    
    def __init__(self, filepath='cache/prices_v2.json', ttl_rules=None):
        """
        Args:
            filepath: путь к файлу кэша
            ttl_rules: dict {category: days} или None для default
        """
        self.filepath = Path(filepath)
        self.ttl_rules = ttl_rules or self.DEFAULT_TTL
        self._data = self._load()
    
    def _load(self):
        """Загрузить кэш из файла."""
        if not self.filepath.exists():
            return {
                'version': self.CACHE_VERSION,
                'created': datetime.now().isoformat(),
                'entries': {}
            }
        
        try:
            with open(self.filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Проверка версии
            if data.get('version', 1) < self.CACHE_VERSION:
                print(f"⚠️  Кэш устарел (v{data.get('version', 1)}), миграция...")
                data = self._migrate(data)
            
            return data
        except (json.JSONDecodeError, IOError):
            print("⚠️  Кэш повреждён, создаём новый")
            return {
                'version': self.CACHE_VERSION,
                'created': datetime.now().isoformat(),
                'entries': {}
            }
    
    def _migrate(self, old_data):
        """Миграция старого кэша."""
        new_data = {
            'version': self.CACHE_VERSION,
            'created': old_data.get('created', datetime.now().isoformat()),
            'entries': {}
        }
        
        # Мигрируем старые записи
        for key, entry in old_data.get('entries', {}).items():
            new_data['entries'][key] = {
                **entry,
                'category': entry.get('category', '_default'),
                'cached_at': entry.get('last_updated', datetime.now().isoformat())
            }
        
        return new_data
    
    def _save(self):
        """Сохранить кэш в файл."""
        self.filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(self.filepath, 'w', encoding='utf-8') as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)
    
    def _is_expired(self, entry, category=None):
        """Проверить, просрочена ли запись."""
        cat = category or entry.get('category', '_default')
        ttl_days = self.ttl_rules.get(cat, self.ttl_rules['_default'])
        
        cached_at = entry.get('cached_at') or entry.get('last_updated')
        if not cached_at:
            return True
        
        try:
            cached_date = datetime.fromisoformat(cached_at)
            expiry = cached_date + timedelta(days=ttl_days)
            return datetime.now() > expiry
        except (ValueError, TypeError):
            return True
    
    def get(self, key, category=None):
        """Получить данные из кэша.
        
        Args:
            key: ключ (название ТМЦ)
            category: категория (для определения TTL)
        
        Returns:
            dict с данными или None если нет/просрочено
        """
        entry = self._data['entries'].get(key)
        if not entry:
            return None
        
        if self._is_expired(entry, category):
            print(f"🕐 Кэш просрочен: {key} ({category or 'default'})")
            return None
        
        print(f"✅ Кэш hit: {key}")
        return entry
    
    def set(self, key, data, category=None):
        """Сохранить данные в кэш.
        
        Args:
            key: ключ (название ТМЦ)
            data: данные для сохранения
            category: категория (для TTL)
        """
        self._data['entries'][key] = {
            **data,
            'category': category or '_default',
            'cached_at': datetime.now().isoformat()
        }
        self._save()
        print(f"💾 Кэш сохранён: {key} ({category or 'default'})")
    
    def invalidate(self, key=None, category=None):
        """Инвалидировать кэш.
        
        Args:
            key: конкретный ключ или None для всего
            category: категория для инвалидации
        """
        if key:
            self._data['entries'].pop(key, None)
            print(f"🗑️  Кэш инвалидирован: {key}")
        elif category:
            to_remove = [
                k for k, v in self._data['entries'].items()
                if v.get('category') == category
            ]
            for k in to_remove:
                del self._data['entries'][k]
            print(f"🗑️  Кэш инвалидирован для категории: {category} ({len(to_remove)} записей)")
        else:
            self._data['entries'] = {}
            print("🗑️  Кэш полностью очищен")
        
        self._save()
    
    def stats(self):
        """Статистика кэша."""
        entries = self._data['entries']
        by_category = {}
        expired = 0
        
        for key, entry in entries.items():
            cat = entry.get('category', '_default')
            by_category[cat] = by_category.get(cat, 0) + 1
            if self._is_expired(entry, cat):
                expired += 1
        
        return {
            'total_entries': len(entries),
            'expired': expired,
            'valid': len(entries) - expired,
            'by_category': by_category,
            'version': self._data.get('version', 1)
        }
    
    def cleanup_expired(self):
        """Очистить просроченные записи."""
        before = len(self._data['entries'])
        self._data['entries'] = {
            k: v for k, v in self._data['entries'].items()
            if not self._is_expired(v, v.get('category', '_default'))
        }
        after = len(self._data['entries'])
        removed = before - after
        
        if removed > 0:
            self._save()
            print(f"🧹 Очищено {removed} просроченных записей")
        
        return removed
