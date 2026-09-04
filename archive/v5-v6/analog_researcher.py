#!/usr/bin/env python3
"""
Analog Researcher — Standalone research script for sub-agents.

This script can be run by a sub-agent to perform deep technical specification
c omparison between an original product and its analog.

Usage (from sub-agent):
    python3 analog_researcher.py \
        --original "Cisco C9200-24P-E" \
        --analog "Huawei S5735-S24P4X" \
        --output analog_matrix_result.json

The sub-agent should use kimi_search to find specifications and then
build the comparison matrix using this script's structure.
"""

import argparse
import json
import sys


def build_matrix_template(original_name, analog_name, original_price=None, analog_price=None):
    """Build a structured comparison matrix template.
    
    The sub-agent fills in the actual values after researching specs.
    """
    
    savings = ""
    if original_price and analog_price:
        diff = original_price - analog_price
        pct = (diff / original_price) * 100 if original_price > 0 else 0
        savings = f"{pct:.0f}% (~{diff:,}₽)"
    
    template = {
        "original": original_name,
        "analog": analog_name,
        "original_price": original_price,
        "analog_price": analog_price,
        "savings": savings,
        "recommendation": "",
        "matrix": []
    }
    
    # Define standard comparison categories and parameters
    standard_params = [
        ("Порты и интерфейсы", "GE порты (10/100/1000)", ""),
        ("Порты и интерфейсы", "Uplink порты", ""),
        ("Порты и интерфейсы", "Дополнительные слоты расширения", ""),
        ("Питание", "PoE бюджет (1 БП)", ""),
        ("Питание", "PoE бюджет (2 БП)", ""),
        ("Питание", "Резервирование питания", ""),
        ("Производительность", "Коммутационная способность", ""),
        ("Производительность", "Forwarding rate", ""),
        ("Производительность", "MAC-таблица", ""),
        ("Производительность", "Jumbo Frame", ""),
        ("Производительность", "VLAN", ""),
        ("ПО и управление", "Операционная система", ""),
        ("ПО и управление", "L3 маршрутизация (IPv4)", ""),
        ("ПО и управление", "L3 маршрутизация (IPv6)", ""),
        ("ПО и управление", "API и автоматизация", ""),
        ("ПО и управление", "Стекирование", ""),
        ("ПО и управление", "SDN / Облачное управление", ""),
        ("Физические характеристики", "Размеры (Ш×Г×В)", ""),
        ("Физические характеристики", "Вес", ""),
        ("Физические характеристики", "Вентиляция", ""),
        ("Безопасность", "MACsec (шифрование на L2)", ""),
        ("Безопасность", "802.1X / NAC", ""),
        ("Безопасность", "ACL / QoS", ""),
        ("Безопасность", "Защита от скачков напряжения", ""),
        ("Интеграция", "Совместимость с инфраструктурой", ""),
        ("Интеграция", "Лицензирование", ""),
        ("Надёжность", "MTBF", ""),
        ("Надёжность", "Гарантия", ""),
        ("Надёжность", "Память (RAM / Flash)", ""),
        ("Надёжность", "CPU", ""),
    ]
    
    for category, parameter, _ in standard_params:
        template["matrix"].append({
            "category": category,
            "parameter": parameter,
            "original": "",
            "analog": "",
            "status": "⚪ Н/Д"
        })
    
    return template


def validate_matrix(matrix_data):
    """Validate that the matrix has been properly filled."""
    errors = []
    
    if not matrix_data.get("matrix"):
        errors.append("Matrix is empty")
        return errors
    
    for i, item in enumerate(matrix_data["matrix"]):
        if not item.get("original"):
            errors.append(f"Row {i}: original value missing for '{item.get('parameter')}'")
        if not item.get("analog"):
            errors.append(f"Row {i}: analog value missing for '{item.get('parameter')}'")
        if not item.get("status") or item.get("status") == "⚪ Н/Д":
            errors.append(f"Row {i}: status not set for '{item.get('parameter')}'")
    
    if not matrix_data.get("recommendation"):
        errors.append("Recommendation is empty")
    
    return errors


def main():
    parser = argparse.ArgumentParser(description="Analog specification researcher")
    parser.add_argument("--original", required=True, help="Original product name")
    parser.add_argument("--analog", required=True, help="Analog product name")
    parser.add_argument("--original-price", type=int, help="Original product price")
    parser.add_argument("--analog-price", type=int, help="Analog product price")
    parser.add_argument("--output", required=True, help="Output JSON file path")
    parser.add_argument("--fill-template", action="store_true", help="Only generate template, don't validate")
    
    args = parser.parse_args()
    
    template = build_matrix_template(
        args.original,
        args.analog,
        args.original_price,
        args.analog_price
    )
    
    if not args.fill_template:
        # In real usage, the sub-agent would have filled in the values
        # Here we just save the template if no values are provided
        pass
    
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(template, f, ensure_ascii=False, indent=2)
    
    print(f"Template saved to: {args.output}")
    print(f"Categories: {len(set(item['category'] for item in template['matrix']))}")
    print(f"Parameters: {len(template['matrix'])}")
    print("\nSub-agent task: Fill in 'original', 'analog', and 'status' for each parameter.")
    print("Status codes: ✅ Совпадает | ⚠️ Частично | 🔴 Критично | ⚪ Н/Д")


if __name__ == "__main__":
    main()
