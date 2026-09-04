"""
Subagent Retry + Fallback — надёжное выполнение субагентов.

Использование:
    from subagent_retry import run_subagent_with_retry
    
    result = run_subagent_with_retry(
        task="Исследовать аналог",
        max_retries=3,
        timeout=300,
        fallback_tasks=["Поиск на сайтах дистрибьюторов", "Поиск datasheet"]
    )
"""

import time
import json
from datetime import datetime


class SubagentError(Exception):
    """Ошибка выполнения субагента."""
    pass


class SubagentTimeout(SubagentError):
    """Субагент превысил время выполнения."""
    pass


class SubagentResearchFailed(SubagentError):
    """Исследование не удалось после всех попыток."""
    pass


def run_subagent_with_retry(
    agent_id,
    task,
    max_retries=3,
    timeout=300,
    backoff_seconds=5,
    fallback_tasks=None,
    session=None
):
    """Запуск субагента с retry и fallback.
    
    Args:
        agent_id: ID агента (или None для default)
        task: задача для субагента
        max_retries: максимум попыток
        timeout: таймаут в секундах
        backoff_seconds: задержка между попытками
        fallback_tasks: список fallback-задач
        session: объект сессии (для вызова sessions_spawn)
    
    Returns: dict с результатом
    
    Raises:
        SubagentResearchFailed: если все попытки и fallback не помогли
    """
    last_error = None
    
    # Основные попытки
    for attempt in range(1, max_retries + 1):
        print(f"  🔄 Попытка {attempt}/{max_retries}...")
        try:
            start_time = time.time()
            
            # Здесь должен быть вызов субагента
            # Для OpenClaw: sessions_spawn с runtime="subagent"
            if session:
                # Используем OpenClaw API
                result = _call_openclaw_subagent(agent_id, task, timeout)
            else:
                # Мок для тестов
                result = _mock_subagent_call(task)
            
            elapsed = time.time() - start_time
            print(f"  ✅ Успех за {elapsed:.1f}с")
            return {
                'success': True,
                'result': result,
                'attempts': attempt,
                'elapsed': elapsed,
                'fallback_used': False
            }
            
        except SubagentTimeout:
            last_error = "timeout"
            print(f"  ⏱️ Таймаут после {timeout}с")
        except Exception as e:
            last_error = str(e)
            print(f"  ❌ Ошибка: {e}")
        
        if attempt < max_retries:
            wait = backoff_seconds * attempt
            print(f"  ⏳ Ожидание {wait}с перед повтором...")
            time.sleep(wait)
    
    # Fallback задачи
    if fallback_tasks:
        print(f"\n🔄 Fallback: пробуем альтернативные подходы...")
        for i, fallback_task in enumerate(fallback_tasks, 1):
            print(f"  Fallback {i}: {fallback_task}")
            try:
                if session:
                    result = _call_openclaw_subagent(agent_id, fallback_task, timeout)
                else:
                    result = _mock_subagent_call(fallback_task)
                
                print(f"  ✅ Fallback успешен!")
                return {
                    'success': True,
                    'result': result,
                    'attempts': max_retries + i,
                    'fallback_used': True,
                    'fallback_task': fallback_task
                }
            except Exception as e:
                print(f"  ❌ Fallback не удался: {e}")
                continue
    
    # Ничего не помогло
    raise SubagentResearchFailed(
        f"Субагент не справился после {max_retries} попыток + {len(fallback_tasks or [])} fallback. "
        f"Последняя ошибка: {last_error}"
    )


def _call_openclaw_subagent(agent_id, task, timeout):
    """Вызов субагента через OpenClaw API.
    
    Эта функция должна вызывать sessions_spawn или подобный API.
    Здесь заглушка — в реальном коде нужно импортировать openclaw API.
    """
    # TODO: интеграция с OpenClaw
    # from sessions_spawn import sessions_spawn
    # result = sessions_spawn(
    #     agent_id=agent_id,
    #     task=task,
    #     timeout_seconds=timeout
    # )
    # return result
    raise NotImplementedError("Интеграция с OpenClaw API не реализована")


def _mock_subagent_call(task):
    """Мок для тестов."""
    return {"task": task, "status": "completed", "data": {}}


def batch_run_subagents(items, agent_id=None, max_retries=3, timeout=300):
    """Пакетный запуск субагентов для нескольких аналогов.
    
    Args:
        items: список dict с original, analog
        agent_id: ID агента
        max_retries: макс. попыток на каждый
        timeout: таймаут на каждый
    
    Returns:
        dict: {successful: [...], failed: [...]}
    """
    results = {'successful': [], 'failed': []}
    
    for item in items:
        original = item.get('original')
        analog = item.get('analog')
        
        print(f"\n🔬 Исследование: {original} vs {analog}")
        
        task = f"Исследовать аналог {analog} для {original}"
        fallback_tasks = [
            f"Найти datasheet {analog}",
            f"Найти характеристики {analog} на сайтах дистрибьюторов"
        ]
        
        try:
            result = run_subagent_with_retry(
                agent_id=agent_id,
                task=task,
                max_retries=max_retries,
                timeout=timeout,
                fallback_tasks=fallback_tasks
            )
            results['successful'].append({
                'item': item,
                'result': result
            })
        except SubagentResearchFailed as e:
            print(f"  ⚠️ Не удалось исследовать: {e}")
            results['failed'].append({
                'item': item,
                'error': str(e)
            })
    
    print(f"\n📊 Batch Results:")
    print(f"   Успешно: {len(results['successful'])}/{len(items)}")
    print(f"   Не удалось: {len(results['failed'])}/{len(items)}")
    
    return results
