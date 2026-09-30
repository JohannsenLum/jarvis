"""Vault operations with the SCHEMA rules enforced, shared by the MCP server, hooks and CLI.

Rules enforced here (see knowledge/SCHEMA.md):
- Paths stay inside the vault; no hidden files.
- `raw/` is write-once: new files only, never edited.
- `me/` is the user's: only `me/_proposals.md` (append via propose) and `me/onboarding.json` are writable.
- Every write appends a line to `log.md`.
"""
from __future__ import annotations

import datetime as _dt
import json
import re
from pathlib import Path

from . import config

PRIVATE = ("life/health/", "life/finance/", "journal/", "relationships/", "frameworks/declarations/")
TEXT_SUFFIXES = {".md", ".txt", ".json", ".csv", ".yaml", ".yml"}


class VaultError(ValueError):
    """A request broke a vault rule. The message says which and what to do instead."""


def today() -> str:
    return _dt.date.today().isoformat()


def resolve(rel: str) -> Path:
    root = config.vault().resolve()
    rel = (rel or "").strip().lstrip("/")
    # Reject hidden aliases and symlinks before resolution erases that information.
    parts = Path(rel).parts
    if any(part.startswith(".") and part not in (".", "..") for part in parts):
        raise VaultError(f"'{rel}' is a hidden path; hidden files aren't part of the vault.")
    current = root
    for part in parts:
        current = current / part
        if current.is_symlink():
            raise VaultError("Symlinks aren't supported inside the vault.")
    path = (root / rel).resolve()
    if path != root and root not in path.parents:
        raise VaultError(f"'{rel}' is outside the vault.")
    if any(part.startswith(".") for part in path.relative_to(root).parts):
        raise VaultError(f"'{rel}' is a hidden path; hidden files aren't part of the vault.")
    return path


def rel_of(path: Path) -> str:
    return path.resolve().relative_to(config.vault().resolve()).as_posix()


def is_private(rel: str) -> bool:
    return rel.casefold().startswith(PRIVATE)


def read(rel: str, max_chars: int = 20_000) -> str:
    path = resolve(rel)
    if not path.exists():
        raise VaultError(f"'{rel}' doesn't exist. Use jarvis_search to find the right page.")
    if path.is_dir():
        items = sorted(p.name + ("/" if p.is_dir() else "") for p in path.iterdir() if not p.name.startswith("."))
        return "\n".join(items) or "(empty folder)"
    text = path.read_text(errors="replace")
    return text if len(text) <= max_chars else text[:max_chars] + f"\n… (truncated at {max_chars} characters)"


def log(entry: str, kind: str = "update") -> str:
    line = f"## [{today()}] {kind} | {entry.strip()}"
    path = resolve("log.md")
    with path.open("a") as f:
        f.write(line + "\n")
    return line


def write(rel: str, content: str, mode: str = "replace", reason: str = "") -> str:
    """mode: create (fail if exists) | replace | append."""
    if mode not in ("create", "replace", "append"):
        raise VaultError("mode must be create, replace or append.")
    path = resolve(rel)
    rel = path.relative_to(config.vault().resolve()).as_posix()
    # macOS volumes are commonly case-insensitive; protect both spellings on every OS.
    policy = rel.casefold()
    exists = path.exists()
    if policy.startswith("raw/") and exists:
        raise VaultError("Files in raw/ are never edited. Save a new source instead.")
    if policy.startswith("me/") and policy not in ("me/onboarding.json", "me/_proposals.md"):
        raise VaultError("me/ belongs to the user. Use jarvis_propose to suggest the change instead.")
    if policy in ("log.md", "me/_proposals.md") and mode != "append":
        raise VaultError(f"{rel} is append-only. Use jarvis_log or jarvis_propose.")
    if path.suffix.lower() not in TEXT_SUFFIXES:
        raise VaultError(f"Only text files can be written ({', '.join(sorted(TEXT_SUFFIXES))}).")
    if mode == "create" and exists:
        raise VaultError(f"'{rel}' already exists. Use mode=replace or append.")
    path.parent.mkdir(parents=True, exist_ok=True)
    if mode == "append":
        with path.open("a") as f:
            f.write(("" if not exists or path.read_text().endswith("\n") else "\n") + content.rstrip("\n") + "\n")
    else:
        path.write_text(content.rstrip("\n") + "\n")
    verb = {"create": "create", "replace": "update" if exists else "create", "append": "update"}[mode]
    log(f"{rel}{': ' + reason if reason else ''}", verb)
    return f"{'Updated' if exists else 'Created'} {rel}"


def propose(change: str, why: str = "", source: str = "") -> str:
    path = resolve("me/_proposals.md")
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("# Proposed changes to me/\n\nJarvis suggests; you decide. Say yes/no to each.\n\n")
    entry = f"- [ ] {today()}: {change.strip()}"
    if why:
        entry += f"\n  - Why: {why.strip()}"
    if source:
        entry += f"\n  - Source: {source.strip()}"
    with path.open("a") as f:
        f.write(entry + "\n")
    log(f"me/_proposals.md: {change.strip()[:80]}", "propose")
    return "Added to me/_proposals.md"


def search(query: str, limit: int = 10, include_private: bool = False) -> list[dict]:
    """Case-insensitive search over file names and contents. Private areas return paths only
    unless include_private is set."""
    root = config.vault()
    terms = [t for t in re.split(r"\s+", query.lower().strip()) if t]
    if not terms:
        return []
    results = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        try:
            resolve(path.relative_to(root).as_posix())
            rel = rel_of(path)
        except (VaultError, ValueError, OSError):
            continue
        if any(part.startswith(".") for part in Path(rel).parts) or rel.casefold().startswith("raw/"):
            continue
        try:
            text = path.read_text(errors="ignore")
        except OSError:
            continue
        hay = (rel + "\n" + text).lower()
        score = sum(hay.count(t) for t in terms) + sum(5 for t in terms if t in rel.lower())
        if score == 0 or not all(t in hay for t in terms):
            continue
        entry = {"path": rel, "score": score}
        if is_private(rel) and not include_private:
            entry["snippet"] = "(private area: open with jarvis_read only if needed)"
        else:
            low = text.lower()
            i = max(0, low.find(terms[0]) - 80)
            entry["snippet"] = re.sub(r"\s+", " ", text[i:i + 240]).strip()
        results.append(entry)
    results.sort(key=lambda e: -e["score"])
    return results[:limit]


def onboarding() -> dict:
    try:
        data = json.loads(resolve("me/onboarding.json").read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError, VaultError):
        return {}


def update_onboarding(patch: dict) -> dict:
    """Deep-merge a patch into me/onboarding.json (lists are replaced, not merged)."""
    def merge(a: dict, b: dict) -> dict:
        for k, v in b.items():
            a[k] = merge(a.get(k, {}) if isinstance(a.get(k), dict) else {}, v) if isinstance(v, dict) else v
        return a
    data = merge(onboarding(), patch)
    path = resolve("me/onboarding.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    log(f"me/onboarding.json: {', '.join(patch)}", "update")
    return data
