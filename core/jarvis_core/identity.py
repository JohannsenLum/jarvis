"""Render Jarvis's identity (core/AGENTS.md.tmpl + the user's settings) for every harness.

Settings live in the vault (`me/onboarding.json` → user.role / tone / autonomy), so changing them in
any harness changes Jarvis everywhere after the next `render`.
"""
from __future__ import annotations

import re
from pathlib import Path

from . import config, vault

ROLES = ("chief-of-staff", "executive-assistant", "thinking-partner", "coach", "life-manager")
TONES = ("warm", "formal", "direct")
AUTONOMY = ("ask-first", "act-and-tell", "handle-quietly")
DEFAULTS = {"role": "chief-of-staff", "tone": "warm", "autonomy": "act-and-tell"}

BEGIN = "<!-- JARVIS:BEGIN (managed by `jarvis render`; your own notes go outside this block) -->"
END = "<!-- JARVIS:END -->"


def settings() -> dict:
    user = vault.onboarding().get("user", {}) or {}
    if not isinstance(user, dict):
        user = {}
    allowed = {"role": ROLES, "tone": TONES, "autonomy": AUTONOMY}
    # Onboarding is writable independently of set_settings; validate at the read boundary.
    return {k: user[k] if user.get(k) in allowed[k] else v for k, v in DEFAULTS.items()}


def set_settings(role: str | None = None, tone: str | None = None, autonomy: str | None = None) -> dict:
    patch = {}
    for key, value, allowed in (("role", role, ROLES), ("tone", tone, TONES), ("autonomy", autonomy, AUTONOMY)):
        if value is None:
            continue
        if value not in allowed:
            raise vault.VaultError(f"{key} must be one of: {', '.join(allowed)}")
        patch[key] = value
    if patch:
        vault.update_onboarding({"user": patch})
    return settings()


def render_text() -> str:
    repo = config.repo()
    s = settings()
    role_file = repo / "core" / "roles" / f"{s['role']}.md"
    role_block = role_file.read_text().strip() if role_file.exists() else f"## Role: {s['role']}"
    text = (repo / "core" / "AGENTS.md.tmpl").read_text()
    return (text.replace("{{ROLE_BLOCK}}", role_block)
                .replace("{{TONE}}", s["tone"])
                .replace("{{AUTONOMY}}", s["autonomy"])
                .replace("{{HOME_RUNTIME}}", config.home_runtime())
                .replace("{{KNOWLEDGE_DIR}}", str(config.vault()))
                .replace("{{JARVIS_DIR}}", str(repo)))


def render() -> Path:
    """Write the canonical rendered identity to ~/.jarvis/AGENTS.md and return its path."""
    out = config.home() / "AGENTS.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_text())
    return out


def write_block(target: Path, body: str) -> None:
    """Put `body` between Jarvis markers in `target`, keeping everything else the user wrote."""
    target.parent.mkdir(parents=True, exist_ok=True)
    block = f"{BEGIN}\n{body.rstrip()}\n{END}"
    current = target.read_text() if target.exists() else ""
    if BEGIN in current and END in current:
        new = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), lambda _m: block, current, flags=re.S)
    else:
        new = (current.rstrip() + "\n\n" if current.strip() else "") + block + "\n"
    target.write_text(new)


def remove_block(target: Path) -> bool:
    if not target.exists():
        return False
    current = target.read_text()
    if BEGIN not in current:
        return False
    new = re.sub(r"\n*" + re.escape(BEGIN) + r".*?" + re.escape(END) + r"\n?", "\n", current, flags=re.S)
    target.write_text(new.strip() + "\n" if new.strip() else "")
    return True
