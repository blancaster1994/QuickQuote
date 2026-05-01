"""Consolidate QuickProp v3.1.1's split config files into a single
seed/config.json, the bootstrap input for QuickQuote's first-launch DB seed.

Run from the repo root:
    py scripts/build-seed.py

Source files (read-only):
    QuickProp/config/allowed_users.json
    QuickProp/config/employees.json
    QuickProp/config/category_mapping.json
    QuickProp/config/consulting_rates.json
    QuickProp/config/structural_rates.json
    QuickProp/quickprop/config.py     (only EXPENSE_LINES — hardcoded here)

Output: seed/config.json (overwritten in place).

Re-run if QuickProp's config files change before the cutover. After
migration this file lives in QuickQuote alone — QuickQuote becomes the
source of truth.
"""

from __future__ import annotations

import json
import os

QP_ROOT = r'C:\Users\blancaster\dev\QuickProp\config'
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH = os.path.join(HERE, 'seed', 'config.json')


def load(name: str):
    with open(os.path.join(QP_ROOT, name), 'r', encoding='utf-8') as f:
        return json.load(f)


def main() -> None:
    allowed = load('allowed_users.json')
    # Strip the comment field; only keep `users` and `roles`.
    allowed_users = allowed.get('users', [])
    roles = allowed.get('roles', {})

    employees_raw = load('employees.json')
    # Pairs in QuickProp are [name, category] — reshape to objects.
    employees = [{'name': n, 'category': c} for n, c in employees_raw]

    payload = {
        '_source': 'Built from QuickProp v3.1.1 config files via scripts/build-seed.py',
        'allowed_users': allowed_users,
        'roles': roles,
        'employees': employees,
        'category_mapping': load('category_mapping.json'),
        'consulting_rates': load('consulting_rates.json'),
        'structural_rates': load('structural_rates.json'),
        'expense_lines': [
            {'name': 'Mileage to Airport',   'qty_unit': 'miles',  'default_rate': 0.70,  'rate_unit': '/mi'},
            {'name': 'Parking at Airport',   'qty_unit': 'days',   'default_rate': 30.00, 'rate_unit': '/day'},
            {'name': 'Airfare - Round Trip', 'qty_unit': 'trips',  'default_rate': 500.00, 'rate_unit': '/trip'},
            {'name': 'Rental Car',           'qty_unit': 'days',   'default_rate': 75.00, 'rate_unit': '/day'},
            {'name': 'Hotel',                'qty_unit': 'nights', 'default_rate': 150.00, 'rate_unit': '/night'},
            {'name': 'Per Diem',             'qty_unit': 'days',   'default_rate': 75.00, 'rate_unit': '/day'},
        ],
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(payload, f, indent=2)
        f.write('\n')

    print(
        f'wrote {OUT_PATH}: '
        f'{len(allowed_users)} users, '
        f'{len(employees)} employees, '
        f'{len(payload["category_mapping"])} category mappings, '
        f'{len(payload["consulting_rates"])} consulting rates, '
        f'{len(payload["structural_rates"])} structural rates, '
        f'{len(payload["expense_lines"])} expense lines.',
    )


if __name__ == '__main__':
    main()
