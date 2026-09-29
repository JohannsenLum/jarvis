"""Jarvis recall: the right parts of the vault for a message. Shared by every harness adapter
(Hermes plugin, Claude/Codex hook, MCP tool).

Original notes:

Two injections, both into the user's message (never the system prompt, so the prompt cache holds):
- First turn of a conversation: the vault's `now.md` (current focus, open loops, next 7 days).
- Every turn: when the message names a person, client, project, goal or life area that has a page,
  a short excerpt of that page (at most 3). Nothing matched means nothing added.

Matching is plain text against page titles, file names and `aliases:` in frontmatter. No model call,
no network. Private areas (life/health, life/finance, journal) are only ever named, never excerpted,
so their content can't leak into a chat the user didn't open them in.
"""
from __future__ import annotations

import os
import re
import time
from pathlib import Path

NOW_LIMIT = 1800          # characters of now.md injected on the first turn
EXCERPT_LIMIT = 320       # characters per matched page
MAX_MATCHES = 3
RESCAN_SECONDS = 60

SEARCH_DIRS = ["relationships/people", "work", "life", "me/goals"]
POINTER_ONLY = ("life/health/", "life/finance/", "journal/")
SKIP_NAMES = {"overview", "index", "log", "readme", "role", "wins", "career", "metrics", "program",
              "budget", "notes", "projects", "meetings", "clients", "docs"}

_index: list[tuple[re.Pattern, str, Path]] = []
_scanned_at = 0.0


def vault() -> Path:
    from . import config
    return config.vault()


def _split_frontmatter(text: str) -> tuple[str, str]:
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            return text[3:end], text[end + 4:]
    return "", text


def _names_for(page: Path, text: str) -> list[str]:
    front, body = _split_frontmatter(text)
    names = set()
    title = re.search(r"^#\s+(.+)$", body, re.M)
    if title:
        names.add(title.group(1).strip())
    stem = page.parent.name if page.stem == "overview" else page.stem
    if stem.lower() not in SKIP_NAMES:
        names.add(stem.replace("-", " "))
    names = {n for n in names if len(n) >= 4}
    aliases = re.search(r"^aliases:\s*\[(.*?)\]", front, re.M)
    if aliases:  # aliases are chosen on purpose, so short ones like "Mum" count
        names.update(a.strip(" '\"") for a in aliases.group(1).split(",") if len(a.strip(" '\"")) >= 3)
    return [n for n in names if n.lower() not in SKIP_NAMES and "{{" not in n]


def _rescan(root: Path) -> None:
    global _index, _scanned_at
    entries = []
    for sub in SEARCH_DIRS:
        base = root / sub
        if not base.exists():
            continue
        for page in base.rglob("*.md"):
            try:
                text = page.read_text(errors="ignore")
            except OSError:
                continue
            for name in _names_for(page, text):
                entries.append((re.compile(rf"(?<![\w-]){re.escape(name)}(?![\w-])", re.I), name, page))
    entries.sort(key=lambda e: -len(e[1]))       # longer names first: "Wei Ling" before "Ling"
    _index, _scanned_at = entries, time.monotonic()


def _excerpt(page: Path) -> str:
    _, body = _split_frontmatter(page.read_text(errors="ignore"))
    body = re.sub(r"^#.*$", "", body, flags=re.M)
    body = re.sub(r"\n{2,}", "\n", body).strip()
    return body[:EXCERPT_LIMIT].rstrip() + ("…" if len(body) > EXCERPT_LIMIT else "")


def _text(user_message) -> str:
    if isinstance(user_message, str):
        return user_message
    if isinstance(user_message, list):
        return " ".join(p.get("text", "") for p in user_message if isinstance(p, dict))
    return ""


def recall_text(user_message="", is_first_turn=False, **_kwargs):
    try:
        root = vault()
        if not root.exists():
            return None
        parts: list[str] = []

        if is_first_turn:
            now = root / "now.md"
            if now.exists():
                _, body = _split_frontmatter(now.read_text(errors="ignore"))
                body = body.strip()
                if body:
                    parts.append("[Jarvis now.md: current focus and open loops]\n" + body[:NOW_LIMIT])

        if time.monotonic() - _scanned_at > RESCAN_SECONDS:
            _rescan(root)
        message = _text(user_message)
        seen: set[Path] = set()
        notes = []
        for pattern, _name, page in _index:
            if page in seen or not pattern.search(message):
                continue
            seen.add(page)
            rel = page.relative_to(root).as_posix()
            if rel.startswith(POINTER_ONLY):
                notes.append(f"- {rel} (private; open only if needed for this request)")
            else:
                notes.append(f"- {rel}: {_excerpt(page)}")
            if len(notes) >= MAX_MATCHES:
                break
        if notes:
            parts.append("[Jarvis vault pages matching this message]\n" + "\n".join(notes))
        return "\n\n".join(parts) if parts else None
    except Exception:  # never break a turn because of recall
        return None
