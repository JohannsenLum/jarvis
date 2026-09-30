"""The framework library (<repo>/frameworks, ours) and the user's results (<vault>/frameworks/<id>/, theirs)."""
from __future__ import annotations

import json
import re

from . import config, vault


def _catalog() -> dict:
    try:
        return json.loads((config.REPO / "frameworks" / "catalog.json").read_text())
    except (OSError, ValueError):
        return {"frameworks": []}


def _results(fid: str) -> list[str]:
    folder = config.vault() / "frameworks" / fid
    if not folder.is_dir():
        return []
    return sorted(vault.rel_of(p) for p in folder.rglob("*.md") if not any(part.startswith(".") for part in p.parts))


def listing() -> list[dict]:
    return [{"id": f["id"], "kind": f["kind"], "in_one_line": f["short"], "cadence": f.get("cadence", ""),
             "started": bool(_results(f["id"]))} for f in _catalog()["frameworks"]]


def get(name: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-").removesuffix("-md")
    for f in _catalog()["frameworks"]:
        if key in (f["id"], f["file"].removesuffix(".md")):
            text = (config.REPO / "frameworks" / f["file"]).read_text()
            outputs = "\n".join(f"- frameworks/{f['id']}/{path}: {what}" for path, what in f["outputs"].items())
            done = _results(f["id"])
            return (f"{text}\n\n---\n## In this Jarvis\n"
                    f"Framework version: {f['version']} (put `framework: {f['id']}` and `framework_version: {f['version']}` "
                    f"in the frontmatter of every result page).\n"
                    f"Results go in the vault (use jarvis_write):\n{outputs}\n"
                    + ("These are private: never paste them into other tools or chats with other people.\n" if f.get("private") else "")
                    + (f"Already there:\n" + "\n".join(f"- {p}" for p in done) if done else "Not started yet."))
    raise vault.VaultError(f"No framework called {name!r}. Available: {', '.join(f['id'] for f in _catalog()['frameworks'])}")
