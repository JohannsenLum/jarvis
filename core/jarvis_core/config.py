"""Where Jarvis lives on this Mac.

`~/.jarvis/config.json` is written by `jarvis install`. Environment variables win over it:
JARVIS_REPO, JARVIS_VAULT, JARVIS_HOME.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]          # core/jarvis_core/config.py → repo root


def home() -> Path:
    return Path(os.environ.get("JARVIS_HOME", Path.home() / ".jarvis")).expanduser()


def load() -> dict:
    try:
        return json.loads((home() / "config.json").read_text())
    except (OSError, ValueError):
        return {}


def save(data: dict) -> None:
    home().mkdir(parents=True, exist_ok=True)
    path = home() / "config.json"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n")
    tmp.replace(path)


def repo() -> Path:
    return Path(os.environ.get("JARVIS_REPO") or load().get("repo") or REPO).expanduser()


def vault() -> Path:
    env = os.environ.get("JARVIS_VAULT") or os.environ.get("OBSIDIAN_VAULT_PATH")
    return Path(env or load().get("vault") or repo() / "knowledge").expanduser()


def home_runtime() -> str:
    return load().get("home_runtime", "hermes")
