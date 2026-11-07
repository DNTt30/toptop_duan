import os

for root, dirs, files in os.walk('apps/game/src'):
    for f in files:
        if f.endswith('.ts') or f.endswith('.tsx'):
            p = os.path.join(root, f)
            with open(p, 'r', encoding='utf-8', errors='ignore') as file:
                content = file.read()
                if 'unit_age' in content:
                    print(f"{p}: found unit_age")
