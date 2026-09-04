#!/usr/bin/env python3
"""
Price Comparison Runner — полный workflow.

1. Подготавливает Excel-шаблон (добавляет колонки)
2. (Предполагается, что агент заполняет цены)
3. Запускает eval перед выдачей пользователю

Usage:
    python3 runner.py input.xlsx
    # После заполнения агентом:
    python3 runner.py --eval result.xlsx
"""

import sys
import subprocess
from pathlib import Path

SKILL_DIR = Path(__file__).parent.parent


def prepare(input_path):
    """Шаг 0: Подготовить шаблон."""
    script = SKILL_DIR / "scripts" / "process_excel.py"
    result = subprocess.run(
        [sys.executable, str(script), input_path],
        capture_output=True, text=True
    )
    print(result.stdout)
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        sys.exit(1)
    # Извлекаем путь выходного файла из stdout
    for line in result.stdout.splitlines():
        if "Saved to:" in line:
            return line.split("Saved to:")[1].strip()
    return None


def evaluate(result_path):
    """Шаг 5: Запустить eval."""
    script = SKILL_DIR / "scripts" / "eval.py"
    result = subprocess.run(
        [sys.executable, str(script), result_path]
    )
    return result.returncode


def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  Prepare template:  python3 runner.py input.xlsx")
        print("  Eval result:       python3 runner.py --eval result.xlsx")
        sys.exit(1)
    
    if sys.argv[1] == "--eval":
        if len(sys.argv) < 3:
            print("Usage: python3 runner.py --eval result.xlsx")
            sys.exit(1)
        code = evaluate(sys.argv[2])
        sys.exit(code)
    else:
        output = prepare(sys.argv[1])
        if output:
            print(f"\n✅ Шаблон готов: {output}")
            print("Далее: заполни цены агентом, затем запусти:")
            print(f"  python3 runner.py --eval {output}")
        else:
            print("❌ Не удалось подготовить шаблон")
            sys.exit(1)


if __name__ == "__main__":
    main()
