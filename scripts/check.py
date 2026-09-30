#!/usr/bin/env python3
"""Dependency-free syntax checks. Does not import application modules or install anything."""
import ast
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
count = 0
for file in sorted(ROOT.rglob('*')):
    if not file.is_file() or any(p in ('.git', 'node_modules', '__pycache__') for p in file.relative_to(ROOT).parts):
        continue
    if file.suffix == '.py':
        ast.parse(file.read_text(), filename=str(file))
    elif file.suffix in ('.js', '.mjs', '.cjs'):
        subprocess.run(['node', '--check', str(file)], check=True, timeout=20)
    elif file.suffix == '.json':
        json.loads(file.read_text())
    elif file.suffix == '.sh' or file.relative_to(ROOT).as_posix() in ('bin/jarvis', 'bin/fireworks'):
        subprocess.run(['bash', '-n', str(file)], check=True, timeout=20)
    elif file.suffix == '.html':
        for script in re.findall(r'<script>([\s\S]*?)</script>', file.read_text()):
            subprocess.run(['node', '--check', '--input-type=commonjs'], input=script, text=True, check=True, timeout=20)
    else:
        continue
    count += 1
print(f'Syntax checked {count} source/configuration files.')
