"""`jarvis` command: plug Jarvis into any agent harness.

    jarvis install <harness...> | all      wire skills, identity, MCP server and recall into a harness
    jarvis uninstall <harness...>          remove exactly what install added
    jarvis render                          re-render identity (role/tone/autonomy) everywhere installed
    jarvis doctor                          what's installed where, and what's detected on this Mac
    jarvis schedule ...                    run scheduled jobs from another runtime (see `jarvis schedule -h`)
    jarvis setup hermes [--voice]          optional: Hermes as the always-on home (Telegram, cron, voice)
    jarvis office [stop|status|restart]    dashboard: watch Jarvis and its sub-agents, type and approve from the browser
                                           (flags for Claude after --, e.g. jarvis office -- --model opus)
    jarvis mcp                             run the Jarvis MCP server on stdio (what harnesses launch)

Harnesses: claude-code, codex, deepseek, hermes, openclaw, cursor, gemini, claude-desktop.
Everything install adds is marked, so uninstall removes only Jarvis's parts.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "core"))
from jarvis_core import config, identity  # noqa: E402

HOME = Path.home()
PY = shutil.which("python3") or sys.executable
MCP_CMD = [PY, str(REPO / "mcp" / "jarvis_mcp.py")]
HOOK_CMD = f'"{PY}" "{REPO / "hooks" / "recall.py"}"'
AGENTS_SKILLS = HOME / ".agents" / "skills"          # read by Codex, DeepSeek Harness, OpenClaw, Gemini, Cursor
HARNESSES = ["claude-code", "codex", "deepseek", "hermes", "openclaw", "cursor", "gemini", "claude-desktop"]
DETECT = {
    "claude-code": lambda: shutil.which("claude"),
    "codex": lambda: shutil.which("codex") or (HOME / ".codex").exists(),
    "deepseek": lambda: shutil.which("dsh") or (HOME / ".dsh").exists(),
    "hermes": lambda: shutil.which("hermes") or (HOME / ".hermes").exists(),
    "openclaw": lambda: shutil.which("openclaw") or (HOME / ".openclaw").exists(),
    "cursor": lambda: Path("/Applications/Cursor.app").exists() or (HOME / ".cursor").exists(),
    "gemini": lambda: shutil.which("gemini") or (HOME / ".gemini").exists(),
    "claude-desktop": lambda: Path("/Applications/Claude.app").exists(),
}


def say(msg: str, quiet: bool = False) -> None:
    if not quiet:
        print(msg)


def run(cmd: list[str], answer: str | None = None) -> bool:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=60, input=answer).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


# ------------------------------------------------------------------ skills

def skill_dirs() -> list[Path]:
    """Every folder under skills/ that holds a SKILL.md, excluding self-learned ones in skills/learned."""
    found = []
    for md in sorted((REPO / "skills").rglob("SKILL.md")):
        if "learned" in md.relative_to(REPO / "skills").parts[:1]:
            continue
        found.append(md.parent)
    return found


def link_skills(target: Path, quiet: bool) -> list[str]:
    target.mkdir(parents=True, exist_ok=True)
    linked = []
    for src in skill_dirs():
        dst = target / src.name
        if dst.is_symlink() and dst.resolve() == src.resolve():
            linked.append(src.name)
            continue
        if dst.exists() or dst.is_symlink():
            if dst.is_symlink() and (str(REPO) in os.readlink(dst) or ".jarvis/" in os.readlink(dst)):
                dst.unlink()                       # our old link pointing somewhere stale
            else:
                say(f"  ! {dst} already exists and isn't Jarvis's; left it alone", quiet)
                continue
        dst.symlink_to(os.path.relpath(src, target) if config.INSTANCE else src)
        linked.append(src.name)
    return linked


def link_agents(target: Path, quiet: bool) -> int:
    """Claude Code sub-agents (librarian, researcher, critic, creative) as per-file links."""
    target.mkdir(parents=True, exist_ok=True)
    n = 0
    for src in sorted((REPO / "agents").glob("*.md")):
        dst = target / src.name
        if dst.is_symlink() and (str(REPO) in os.readlink(dst) or ".jarvis/" in os.readlink(dst)):
            dst.unlink()
        elif dst.exists():
            say(f"  ! {dst} already exists and isn't Jarvis's; left it alone", quiet)
            continue
        dst.symlink_to(os.path.relpath(src, target) if config.INSTANCE else src)
        n += 1
    return n


def link_user_skills(source: Path, target: Path) -> int:
    """Skills in the folder's own skills/ (user-made, edited copies, self-learned) override framework
    skills of the same name. Updates never touch this folder."""
    n = 0
    if not source.exists():
        return n
    for md in sorted(source.rglob("SKILL.md")):
        src, dst = md.parent, target / md.parent.name
        if dst.is_symlink():
            dst.unlink()
        elif dst.exists():
            continue
        dst.symlink_to(os.path.relpath(src, target))
        n += 1
    return n


def unlink_skills(target: Path) -> int:
    n = 0
    if target.exists():
        for dst in target.iterdir():
            if dst.is_symlink() and (str(REPO) in os.readlink(dst) or ".jarvis/" in os.readlink(dst)):
                dst.unlink()
                n += 1
    return n


# ------------------------------------------------------------------ config file helpers

def json_merge(path: Path, update) -> None:
    data = {}
    if path.exists():
        try:
            data = json.loads(path.read_text() or "{}")
        except ValueError:
            raise SystemExit(f"{path} isn't valid JSON; fix it first, then re-run.")
        backup = path.with_name(path.name + ".jarvis-backup")
        if not backup.exists():
            shutil.copy2(path, backup)
    update(data)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def mcp_entry() -> dict:
    return {"command": MCP_CMD[0], "args": MCP_CMD[1:]}


def set_mcp_json(path: Path, key: str = "mcpServers") -> None:
    json_merge(path, lambda d: d.setdefault(key, {}).__setitem__("jarvis", mcp_entry()))


def unset_mcp_json(path: Path, key: str = "mcpServers") -> None:
    if path.exists():
        json_merge(path, lambda d: d.get(key, {}).pop("jarvis", None))


def claude_hooks(add: bool, path: Path) -> None:
    """Add/remove the recall hook for SessionStart and UserPromptSubmit in a Claude-format hooks file."""
    def update(d: dict) -> None:
        hooks = d.setdefault("hooks", {})
        for event in ("SessionStart", "UserPromptSubmit"):
            groups = [g for g in hooks.get(event, []) if not any("hooks/recall.py" in h.get("command", "") and str(REPO) in h.get("command", "")
                                                                  for h in g.get("hooks", []))]
            if add:
                groups.append({"hooks": [{"type": "command", "command": HOOK_CMD, "timeout": 10}]})
            if groups:
                hooks[event] = groups
            else:
                hooks.pop(event, None)
        if not hooks:
            d.pop("hooks", None)
    json_merge(path, update)


def text_block(path: Path, body: str, comment: str = "#") -> None:
    begin, end = f"{comment} JARVIS:BEGIN (managed by `jarvis install`)", f"{comment} JARVIS:END"
    current = path.read_text() if path.exists() else ""
    block = f"{begin}\n{body.rstrip()}\n{end}"
    if begin in current:
        new = re.sub(re.escape(begin) + r".*?" + re.escape(end), lambda _m: block, current, flags=re.S)
    else:
        new = (current.rstrip() + "\n\n" if current.strip() else "") + block + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(new)


def remove_text_block(path: Path, comment: str = "#") -> None:
    if not path.exists():
        return
    begin, end = f"{comment} JARVIS:BEGIN (managed by `jarvis install`)", f"{comment} JARVIS:END"
    new = re.sub(r"\n*" + re.escape(begin) + r".*?" + re.escape(end) + r"\n?", "\n", path.read_text(), flags=re.S)
    path.write_text(new.strip() + "\n" if new.strip() else "")


# ------------------------------------------------------------------ identity targets

def identity_targets() -> dict[str, Path]:
    return {
        "codex": HOME / ".codex" / "AGENTS.md",
        "deepseek": HOME / ".dsh" / "AGENTS.md",
        "openclaw": HOME / ".openclaw" / "workspace" / "AGENTS.md",
        "gemini": HOME / ".gemini" / "GEMINI.md",
    }


def render_instance(quiet: bool = False) -> None:
    """Wire a Jarvis folder (made by create-jarvis) so every tool opened in it becomes Jarvis.

    Everything is project-scoped: nothing outside the folder changes. Absolute paths are written on
    purpose and refreshed on every render, so moving the folder only needs `jarvis render`.
    """
    root = config.instance_root()
    text = identity.render().read_text()
    identity.write_block(root / "AGENTS.md", text)            # Codex, Grok Build, OpenClaw, DeepSeek, Cursor…
    identity.write_block(root / "CLAUDE.md", "@AGENTS.md")     # Claude Code
    identity.write_block(root / "GEMINI.md", "@AGENTS.md")     # Gemini CLI
    for target in (root / ".claude" / "skills", root / ".agents" / "skills"):
        link_skills(target, quiet)
        link_user_skills(root / "skills", target)            # yours win over Jarvis's on a name clash
    link_agents(root / ".claude" / "agents", quiet)
    json_merge(root / ".mcp.json", lambda d: d.setdefault("mcpServers", {}).__setitem__("jarvis", mcp_entry()))
    claude_hooks(True, root / ".claude" / "settings.json")
    # Jarvis's own tools don't need a click each time (they enforce the vault rules themselves)
    json_merge(root / ".claude" / "settings.json", lambda d: d.setdefault("permissions", {}).__setitem__(
        "allow", sorted(set(d.get("permissions", {}).get("allow", [])) | {"mcp__jarvis"})))
    args = ", ".join(json.dumps(a) for a in MCP_CMD[1:])
    text_block(root / ".codex" / "config.toml", f'[mcp_servers.jarvis]\ncommand = {json.dumps(MCP_CMD[0])}\nargs = [{args}]')
    set_mcp_json(root / ".gemini" / "settings.json")
    say(f"✓ Jarvis folder wired: {root}", quiet)


def refresh_identity(quiet: bool = False) -> None:
    if config.INSTANCE:
        render_instance(quiet=True)
    rendered = identity.render()
    installed = config.load().get("harnesses", [])
    text = rendered.read_text()
    for name, path in identity_targets().items():
        if name in installed:
            identity.write_block(path, text)
    if "hermes" in installed:
        soul = Path(os.environ.get("HERMES_HOME", HOME / ".hermes")) / "SOUL.md"
        soul.write_text(text)
    say(f"Identity rendered to {rendered} and applied to: {', '.join(installed) or 'nothing yet'}", quiet)


# ------------------------------------------------------------------ installers

def install(name: str, quiet: bool = False) -> None:
    rendered = identity.render()
    if name == "claude-code":
        n = len(link_skills(HOME / ".claude" / "skills", quiet))
        identity.write_block(HOME / ".claude" / "CLAUDE.md", f"@{rendered}")
        ok = run(["claude", "mcp", "remove", "--scope", "user", "jarvis"]) or True
        ok = run(["claude", "mcp", "add", "--scope", "user", "jarvis", "--", *MCP_CMD])
        if not ok:                                       # CLI missing: write the user config directly
            set_mcp_json(HOME / ".claude.json")
        claude_hooks(True, HOME / ".claude" / "settings.json")
        a = link_agents(HOME / ".claude" / "agents", quiet)
        say(f"✓ Claude Code: {n} skills, {a} sub-agents, identity (@import in ~/.claude/CLAUDE.md), MCP server, recall hook", quiet)
    elif name == "codex":
        n = len(link_skills(AGENTS_SKILLS, quiet))
        identity.write_block(identity_targets()["codex"], rendered.read_text())
        if not (shutil.which("codex") and run(["codex", "mcp", "add", "jarvis", "--", *MCP_CMD])):
            args = ", ".join(json.dumps(a) for a in MCP_CMD[1:])
            text_block(HOME / ".codex" / "config.toml", f'[mcp_servers.jarvis]\ncommand = {json.dumps(MCP_CMD[0])}\nargs = [{args}]')
        claude_hooks(True, HOME / ".codex" / "hooks.json")
        say(f"✓ Codex: {n} skills (~/.agents/skills), identity (~/.codex/AGENTS.md), MCP server, recall hook", quiet)
    elif name == "deepseek":
        n = len(link_skills(AGENTS_SKILLS, quiet))
        identity.write_block(identity_targets()["deepseek"], rendered.read_text())
        args = ", ".join(json.dumps(a) for a in MCP_CMD[1:])
        text_block(HOME / ".dsh" / "cordis.patch.yml",
                   "- insert:\n    - id: mcp-jarvis\n      name: '@deepseek-ai/dsh-mcp-client'\n"
                   f"      config: {{serverName: jarvis, transport: stdio, command: {json.dumps(MCP_CMD[0])}, args: [{args}]}}")
        say(f"✓ DeepSeek Harness: {n} skills (~/.agents/skills), identity (~/.dsh/AGENTS.md), MCP server (cordis patch). "
            "Recall comes from the jarvis_recall tool.", quiet)
    elif name == "hermes":
        hermes_home = Path(os.environ.get("HERMES_HOME", HOME / ".hermes"))
        (hermes_home / "SOUL.md").write_text(rendered.read_text())
        run(["hermes", "mcp", "remove", "jarvis"])
        run(["hermes", "mcp", "add", "jarvis", "--command", MCP_CMD[0], "--args", *MCP_CMD[1:]], answer="Y\n")
        plugin = hermes_home / "plugins" / "jarvis-recall"
        plugin.parent.mkdir(parents=True, exist_ok=True)
        if plugin.is_symlink():
            plugin.unlink()                                   # relink (the plugin may have moved)
        if not plugin.exists():
            plugin.symlink_to(REPO / "adapters" / "hermes" / "plugins" / "jarvis-recall")
        run(["hermes", "plugins", "enable", "jarvis-recall"])
        say("✓ Hermes: identity (SOUL.md), MCP server, recall plugin. Skills load from the repo (skills.external_dirs).", quiet)
    elif name == "openclaw":
        n = len(link_skills(AGENTS_SKILLS, quiet))
        identity.write_block(identity_targets()["openclaw"], rendered.read_text())
        if not (shutil.which("openclaw") and run(["openclaw", "mcp", "add", "jarvis", "--command", MCP_CMD[0], "--arg", MCP_CMD[1]])):
            json_merge(HOME / ".openclaw" / "openclaw.json",
                       lambda d: d.setdefault("mcp", {}).setdefault("servers", {}).__setitem__("jarvis", mcp_entry()))
        say(f"✓ OpenClaw: {n} skills (~/.agents/skills), identity (workspace AGENTS.md), MCP server. Recall via jarvis_recall.", quiet)
    elif name == "cursor":
        n = len(link_skills(AGENTS_SKILLS, quiet))
        set_mcp_json(HOME / ".cursor" / "mcp.json")
        say(f"✓ Cursor: {n} skills (~/.agents/skills), MCP server. Paste `@{rendered}` into Cursor's User Rules for the identity.", quiet)
    elif name == "gemini":
        n = len(link_skills(AGENTS_SKILLS, quiet))
        identity.write_block(identity_targets()["gemini"], rendered.read_text())
        set_mcp_json(HOME / ".gemini" / "settings.json")
        say(f"✓ Gemini CLI: {n} skills (~/.agents/skills), identity (~/.gemini/GEMINI.md), MCP server", quiet)
    elif name == "claude-desktop":
        set_mcp_json(HOME / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json")
        say("✓ Claude desktop app: MCP server (restart the app). Skills live in your claude.ai account: "
            "run `jarvis export-skills` and upload the zips in Settings → Capabilities → Skills.", quiet)
    else:
        raise SystemExit(f"Unknown harness '{name}'. Choose from: {', '.join(HARNESSES)}")
    cfg = config.load()
    cfg.update({"repo": str(REPO), "vault": str(config.vault()), "home_runtime": cfg.get("home_runtime", "hermes")})
    cfg["harnesses"] = sorted(set(cfg.get("harnesses", [])) | {name})
    config.save(cfg)


def uninstall(name: str) -> None:
    if name == "claude-code":
        print(f"  removed {unlink_skills(HOME / '.claude' / 'skills')} skill links")
        print(f"  removed {unlink_skills(HOME / '.claude' / 'agents')} sub-agent links")
        identity.remove_block(HOME / ".claude" / "CLAUDE.md")
        run(["claude", "mcp", "remove", "--scope", "user", "jarvis"])
        claude_hooks(False, HOME / ".claude" / "settings.json")
    elif name in ("codex", "deepseek", "openclaw", "gemini", "cursor"):
        others = set(config.load().get("harnesses", [])) - {name}
        if not others & {"codex", "deepseek", "openclaw", "gemini", "cursor"}:
            print(f"  removed {unlink_skills(AGENTS_SKILLS)} skill links from ~/.agents/skills")
        if name in identity_targets():
            identity.remove_block(identity_targets()[name])
        if name == "codex":
            run(["codex", "mcp", "remove", "jarvis"])
            remove_text_block(HOME / ".codex" / "config.toml")
            claude_hooks(False, HOME / ".codex" / "hooks.json")
        elif name == "deepseek":
            remove_text_block(HOME / ".dsh" / "cordis.patch.yml")
        elif name == "openclaw":
            run(["openclaw", "mcp", "remove", "jarvis"])
            p = HOME / ".openclaw" / "openclaw.json"
            if p.exists():
                json_merge(p, lambda d: d.get("mcp", {}).get("servers", {}).pop("jarvis", None))
        elif name == "cursor":
            unset_mcp_json(HOME / ".cursor" / "mcp.json")
        elif name == "gemini":
            unset_mcp_json(HOME / ".gemini" / "settings.json")
    elif name == "hermes":
        run(["hermes", "mcp", "remove", "jarvis"])
        print("  Hermes keeps its SOUL.md and recall plugin (it's the home runtime). Remove them by hand if you want.")
    elif name == "claude-desktop":
        unset_mcp_json(HOME / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json")
    else:
        raise SystemExit(f"Unknown harness '{name}'.")
    cfg = config.load()
    cfg["harnesses"] = [h for h in cfg.get("harnesses", []) if h != name]
    config.save(cfg)
    print(f"✓ Removed Jarvis from {name}")


def doctor() -> None:
    installed = set(config.load().get("harnesses", []))
    print(f"Repo:  {REPO}\nVault: {config.vault()}\nHome runtime: {config.home_runtime()}\n"
          f"Settings: {identity.settings()}\n")
    print(f"{'Harness':<16}{'On this Mac':<14}{'Jarvis installed'}")
    for h in HARNESSES:
        print(f"{h:<16}{'yes' if DETECT[h]() else '-':<14}{'yes' if h in installed else '-'}")
    print(f"\nSkills: {len(skill_dirs())} in {REPO / 'skills'}")


def init_instance(answers_file: Path) -> None:
    """Called by create-jarvis after it copies the framework into <folder>/.jarvis."""
    from jarvis_core import vault
    if not config.INSTANCE:
        raise SystemExit("init-instance only runs inside a Jarvis folder's .jarvis/.")
    a = json.loads(answers_file.read_text())
    kv = config.vault()
    for name, body in {
        "index.md": "# Index\n\nCatalog of every page in the vault, grouped by folder. Jarvis updates this on every change.\n\n"
                    "## me\n\n## life\n\n## relationships\n\n## work\n\n## journal\n",
        "log.md": "# Log\n\nAppend-only. One line per change: `## [YYYY-MM-DD] <kind> | <what>`\n\n",
        "now.md": f"---\ntype: note\nstatus: active\nupdated: {vault.today()}\n---\n# Now\nUpdated: {vault.today()}\n\n"
                  "## Focus this week\n- Finish onboarding with Jarvis.\n\n## Open loops (waiting on / promised)\n- \n\n"
                  "## Next 7 days\n- \n\n## Recently changed\n- Jarvis folder created.\n",
    }.items():
        if not (kv / name).exists():
            (kv / name).write_text(body)
    user = {k: v for k, v in (a.get("user") or {}).items() if v}
    pending = [{"step": p, "question": q, "skipped_at": vault.today(), "reason": "skipped"} for p, q in a.get("skipped", [])]
    data = vault.onboarding() or {"version": 1, "started_at": vault.today()}
    data.update({"status": "in_progress", "current_step": a.get("next_step", "work_details"),
                 "user": {**data.get("user", {}), **user}, "assistant": a.get("assistant") or "Jarvis"})
    if a.get("work"):
        data["work"] = [{"template": t} for t in a["work"]]
    data["pending"] = data.get("pending", []) + pending
    vault.resolve("me").mkdir(parents=True, exist_ok=True)
    vault.resolve("me/onboarding.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    own = config.instance_root() / "skills"
    (own / "learned").mkdir(parents=True, exist_ok=True)
    (own / "learned" / ".gitkeep").touch()
    readme = own / "README.md"
    if not readme.exists():
        readme.write_text("# Your skills\n\nSkills here are yours: Jarvis updates never change this folder.\n"
                          "- Add your own: `skills/<name>/SKILL.md`.\n"
                          "- Customise a Jarvis skill: copy it from `.jarvis/skills/…` to here and edit; yours wins.\n"
                          "- `learned/` holds skills Jarvis writes for itself.\n"
                          "Run `jarvis render` after adding or removing one.\n")
    cfg = config.load()
    cfg.update({"repo": str(REPO), "vault": str(kv), "home_runtime": a.get("home_runtime", "claude-code"),
                "harnesses": sorted(set(cfg.get("harnesses", [])) | {"project"})})
    config.save(cfg)
    render_instance()
    vault.log("Jarvis folder created by create-jarvis", "create")


def update(source: str) -> None:
    """Refresh the framework in <folder>/.jarvis from GitHub, keeping settings and self-learned skills."""
    import tempfile
    if not config.INSTANCE:
        raise SystemExit("`jarvis update` runs inside a Jarvis folder. For the repo itself, use `git pull`.")
    with tempfile.TemporaryDirectory() as tmp:
        if subprocess.run(["git", "clone", "--depth", "1", "-q", source, tmp]).returncode != 0:
            raise SystemExit(f"Couldn't download {source}")
        # What to copy comes from the NEW version (framework.json), so folders added later arrive too
        try:
            manifest = json.loads((Path(tmp) / "framework.json").read_text())
        except (OSError, ValueError):
            manifest = {"parts": ["core", "mcp", "hooks", "bin", "agents", "frameworks", "adapters", "office",
                                  "deps.env", "README.md"], "removed": ["hermes", "setup.sh"]}
        for old in manifest.get("removed", []):
            p_old = REPO / old
            if p_old.is_dir():
                shutil.rmtree(p_old)
            elif p_old.exists():
                p_old.unlink()
        for part in manifest["parts"]:
            src, dst = Path(tmp) / part, REPO / part
            if not src.exists():
                continue
            if dst.is_dir():
                shutil.rmtree(dst)
            elif dst.exists():
                dst.unlink()
            (shutil.copytree if src.is_dir() else shutil.copy2)(src, dst)
        for sub in (Path(tmp) / "skills").iterdir():                 # framework skills only
            if sub.name == "learned" or not sub.is_dir():
                continue
            dst = REPO / "skills" / sub.name
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(sub, dst)
        for tpl in (Path(tmp) / "knowledge" / "_templates").glob("*.md"):   # add new page templates only
            target = config.vault() / "_templates" / tpl.name
            if not target.exists():
                shutil.copy2(tpl, target)
        version = subprocess.run(["git", "-C", tmp, "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    refresh_identity(quiet=True)
    print(f"✓ Jarvis framework updated to {version}. Your vault, your skills/ folder, settings and notes are untouched.")


def export_skills(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for src in skill_dirs():
        shutil.make_archive(str(out / src.name), "zip", root_dir=src.parent, base_dir=src.name)
    print(f"✓ {len(skill_dirs())} skill zips in {out}. Upload them in the Claude app: Settings → Capabilities → Skills.")


OFFICE_DIR = Path.home() / ".jarvis-office"


def _node() -> str | None:
    return shutil.which("node") or next((str(p) for p in (Path.home() / ".local/opt/node/bin/node",
                                                         Path("/opt/homebrew/bin/node")) if p.exists()), None)


def _tmux() -> str | None:
    return shutil.which("tmux") or next((p for p in ("/opt/homebrew/bin/tmux", "/usr/local/bin/tmux") if Path(p).exists()), None)


def _office_up(port: int) -> bool:
    import urllib.request
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1)
        return True
    except Exception:
        return False


def office_hook(add: bool, settings: Path, node: str) -> None:
    """The approval hook: lets the dashboard answer permission prompts (the terminal still can)."""
    cmd = f'"{node}" "{REPO / "office" / "permission-hook.mjs"}"'
    def update(d: dict) -> None:
        hooks = d.setdefault("hooks", {})
        groups = [g for g in hooks.get("PermissionRequest", [])
                  if not any("office/permission-hook.mjs" in h.get("command", "") for h in g.get("hooks", []))]
        if add:
            groups.append({"matcher": "*", "hooks": [{"type": "command", "command": cmd, "timeout": 120}]})
        if groups:
            hooks["PermissionRequest"] = groups
        else:
            hooks.pop("PermissionRequest", None)
        if not hooks:
            d.pop("hooks", None)
    json_merge(settings, update)


def office(action: str, port: int, approvals: bool, attach: bool, claude_args: list[str], new: bool = False) -> None:
    root = config.instance_root() or Path.cwd()
    pidfile = OFFICE_DIR / "server.pid"
    if action in ("stop", "stop-all"):
        try:
            os.kill(int(pidfile.read_text()), 15)
            print("✓ Office dashboard stopped.")
        except (OSError, ValueError):
            print("The office dashboard isn't running.")
        tm = _tmux()
        if action == "stop-all" and tm:
            if subprocess.run([tm, "kill-session", "-t", "jarvis"], capture_output=True).returncode == 0:
                print("✓ Claude session 'jarvis' closed. Pick the conversation up later with: claude --continue")
        elif tm:
            print("Your Claude session keeps running. To close it too: jarvis office stop-all")
        return
    if action == "status":
        print(f"Dashboard: {'running at http://127.0.0.1:%d' % port if _office_up(port) else 'not running (log: ' + str(OFFICE_DIR / 'server.log') + ')'}")
        tm = _tmux()
        alive = bool(tm) and subprocess.run([tm, "has-session", "-t", "jarvis"], capture_output=True).returncode == 0
        print(f"Claude session (tmux 'jarvis'): {'running' if alive else 'not running'}")
        return
    node, tm = _node(), _tmux()
    if not node:
        raise SystemExit("The office needs Node.js 18+ (https://nodejs.org).")
    OFFICE_DIR.mkdir(parents=True, exist_ok=True)
    if approvals:
        office_hook(True, root / ".claude" / "settings.json", node)
    # Always run the current dashboard code: restart a server left over from before an update.
    # (It holds no state that matters; your Claude session is separate and keeps running.)
    if _office_up(port):
        import time
        pids = set()
        try:
            pids.add(int(pidfile.read_text()))
        except (OSError, ValueError):
            pass
        # Also whatever office server is actually listening on the port (an older one may have lost its pidfile)
        listen = subprocess.run(["lsof", "-ti", f"tcp:{port}", "-sTCP:LISTEN"], capture_output=True, text=True).stdout.split()
        for pid in listen:
            cmd = subprocess.run(["ps", "-o", "command=", "-p", pid], capture_output=True, text=True).stdout
            if "office/server.mjs" in cmd:
                pids.add(int(pid))
        for pid in pids:
            try:
                os.kill(pid, 15)
            except OSError:
                pass
        for _ in range(30):
            if not _office_up(port):
                break
            time.sleep(0.1)
        if _office_up(port):
            raise SystemExit(f"! Something else is using port {port}. Try: jarvis office --port 3778")
    if not _office_up(port):
        log = open(OFFICE_DIR / "server.log", "a")
        proc = subprocess.Popen([node, str(REPO / "office" / "server.mjs"), "--root", str(root), "--port", str(port)],
                                stdout=log, stderr=log, stdin=subprocess.DEVNULL, start_new_session=True)
        pidfile.write_text(str(proc.pid))
        for _ in range(30):
            if _office_up(port):
                break
            import time
            time.sleep(0.1)
    url = f"http://127.0.0.1:{port}"
    if _office_up(port):
        print(f"✓ Office dashboard: {url}")
        subprocess.run(["open", url], capture_output=True)
    else:
        log_tail = ""
        try:
            log_tail = "\n".join((OFFICE_DIR / "server.log").read_text().splitlines()[-8:])
        except OSError:
            pass
        ver = subprocess.run([node, "--version"], capture_output=True, text=True).stdout.strip()
        print(f"! The office dashboard didn't start (node {ver or '?'} at {node}).\n"
              f"  Last lines of {OFFICE_DIR / 'server.log'}:\n{log_tail or '  (empty)'}")
    if not tm:
        brew = shutil.which("brew") or next((p for p in ("/opt/homebrew/bin/brew", "/usr/local/bin/brew") if Path(p).exists()), None)
        if brew and sys.stdin.isatty():
            yes = input("tmux isn't installed. It lets the dashboard type into your Claude session.\n"
                        "Install it now with Homebrew? [Y/n] ").strip().lower()
            if not yes.startswith("n") and subprocess.run([brew, "install", "tmux"]).returncode == 0:
                tm = _tmux()
    if not tm:
        print("! Without tmux the dashboard can watch and approve but not type (brew install tmux).\n"
              "  Start Claude as usual: cd", root, "&& claude")
        return
    if action == "restart":
        subprocess.run([tm, "kill-session", "-t", "jarvis"], capture_output=True)
    if subprocess.run([tm, "has-session", "-t", "jarvis"], capture_output=True).returncode == 0:
        if claude_args:
            print("! Claude is already running in the office session, so these flags weren't applied:",
                  " ".join(claude_args), "\n  Restart it with them: jarvis office restart --", " ".join(claude_args))
    else:
        # Start clean: don't inherit markers from a Claude session this command might be run from
        unset = [x for k in os.environ if k == "CLAUDECODE" or k.startswith("CLAUDE_CODE_") for x in ("-u", k)]
        # Run Claude in a login shell and keep the shell afterwards, so if Claude exits you see why and
        # can start it again (`claude --continue`) instead of the whole session disappearing.
        # Pick up the last conversation in this folder, unless asked for a new one (or flags choose a session)
        project = HOME / ".claude" / "projects" / re.sub(r"[^a-zA-Z0-9]", "-", str(root))
        chooses = {"--continue", "-c", "--resume", "-r", "--session-id"} & set(claude_args)
        if not new and not chooses and any(project.glob("*.jsonl")):
            claude_args = ["--continue", *claude_args]
        claude_cmd = " ".join(shlex.quote(x) for x in ["env", *unset, "claude", *claude_args])
        shell = os.environ.get("SHELL", "/bin/zsh")
        script = (f'{claude_cmd}; echo; echo "Claude exited. Start it again with: claude --continue '
                  f'(or close this with: exit)"; exec {shlex.quote(shell)} -l')
        subprocess.run([tm, "new-session", "-d", "-s", "jarvis", "-c", str(root), shell, "-lc", script], check=True)
        # If the session ever dies, keep the last screen and a log so you can see why.
        subprocess.run([tm, "set-option", "-t", "jarvis", "remain-on-exit", "on"], capture_output=True)
        subprocess.run([tm, "pipe-pane", "-t", "jarvis", "-o", f"cat >> {shlex.quote(str(OFFICE_DIR / 'session.log'))}"], capture_output=True)
        import time
        time.sleep(1.5)
        dead = subprocess.run([tm, "display-message", "-p", "-t", "jarvis", "#{pane_dead} #{pane_dead_status}"],
                              capture_output=True, text=True).stdout.split()
        if dead and dead[0] == "1":
            screen = subprocess.run([tm, "capture-pane", "-p", "-t", "jarvis"], capture_output=True, text=True).stdout.strip()
            subprocess.run([tm, "kill-session", "-t", "jarvis"], capture_output=True)
            raise SystemExit(f"! Claude's session closed straight away (exit {dead[1] if len(dead) > 1 else '?'}). It showed:\n{screen[-1500:]}\n"
                             f"  Full log: {OFFICE_DIR / 'session.log'}")
        print("✓ Started Claude in this folder (tmux session 'jarvis')" + (f" with {' '.join(claude_args)}." if claude_args else "."))
    if os.environ.get("TMUX"):
        current = subprocess.run([tm, "display-message", "-p", "#S"], capture_output=True, text=True).stdout.strip()
        if current == "jarvis":
            print("You're already in the Jarvis session (this terminal). The dashboard is up to date.")
        elif attach:
            subprocess.run([tm, "switch-client", "-t", "jarvis"])
        return
    if attach and sys.stdin.isatty():
        print("Opening the session here. Detach with Ctrl-b then d (Claude keeps running).")
        os.execv(tm, [tm, "attach", "-t", "jarvis"])
    print(f"Open the session in a terminal any time: {tm} attach -t jarvis")


def main() -> None:
    ap = argparse.ArgumentParser(prog="jarvis", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("install", help="plug Jarvis into harnesses")
    p.add_argument("harness", nargs="+", help=f"{', '.join(HARNESSES)} or all (all = the ones found on this Mac)")
    p.add_argument("--global", dest="glob", action="store_true", help="in a Jarvis folder: install everywhere, not just this folder")
    p = sub.add_parser("uninstall", help="remove Jarvis from harnesses")
    p.add_argument("harness", nargs="+")
    sub.add_parser("render", help="re-render identity everywhere")
    sub.add_parser("doctor", help="show status")
    p = sub.add_parser("export-skills", help="zip skills for upload to the Claude app")
    p.add_argument("--out", type=Path, default=config.home() / "skill-zips")
    p = sub.add_parser("init-instance", help=argparse.SUPPRESS)
    p.add_argument("answers", type=Path)
    p = sub.add_parser("update", help="update the framework in this Jarvis folder")
    p.add_argument("--source", default="https://github.com/JohannsenLum/jarvis.git")
    p = sub.add_parser("setup", help="optional always-on home: jarvis setup hermes [--voice]")
    p.add_argument("runtime", choices=["hermes"])
    p.add_argument("rest", nargs=argparse.REMAINDER)
    p = sub.add_parser("office", help="dashboard: watch Jarvis and its sub-agents, type and approve from the browser")
    p.add_argument("action", nargs="?", default="start", choices=["start", "stop", "stop-all", "status", "restart"])
    p.add_argument("--dangerously-skip-permissions", dest="skip", action="store_true",
                   help="start Claude with --dangerously-skip-permissions (no prompts at all)")
    p.add_argument("--port", type=int, default=3777)
    p.add_argument("--no-approvals", dest="approvals", action="store_false", help="don't answer permission prompts from the dashboard")
    p.add_argument("--no-attach", dest="attach", action="store_false", help="don't open the session in this terminal")
    p.add_argument("--new", action="store_true", help="start a new conversation instead of continuing the last one")
    sub.add_parser("mcp", help="run the MCP server on stdio")
    p = sub.add_parser("schedule", help="scheduled jobs from another runtime")
    p.add_argument("args", nargs=argparse.REMAINDER)
    argv = sys.argv[1:]
    passthrough: list[str] = []
    if "--" in argv:                                        # jarvis office -- --model opus …
        i = argv.index("--")
        argv, passthrough = argv[:i], argv[i + 1:]
    a = ap.parse_args(argv)

    if a.cmd == "install":
        names = [h for h in HARNESSES if DETECT[h]()] if a.harness == ["all"] else a.harness
        if config.INSTANCE and not a.glob and {"claude-code", "codex", "gemini"} & set(names):
            print("This Jarvis folder already works in Claude Code, Codex and Gemini when you open them here.\n"
                  "To make Jarvis active in every folder, add --global.")
            names = [h for h in names if h not in ("claude-code", "codex", "gemini")]
        for h in names:
            install(h)
        refresh_identity(quiet=True)
    elif a.cmd == "uninstall":
        for h in a.harness:
            uninstall(h)
    elif a.cmd == "render":
        refresh_identity()
    elif a.cmd == "init-instance":
        init_instance(a.answers)
    elif a.cmd == "update":
        update(a.source)
    elif a.cmd == "doctor":
        doctor()
    elif a.cmd == "export-skills":
        export_skills(a.out)
    elif a.cmd == "setup":
        os.execv("/bin/zsh", ["/bin/zsh", str(REPO / "adapters" / a.runtime / "setup.sh"), *a.rest])
    elif a.cmd == "office":
        extra = (["--dangerously-skip-permissions"] if a.skip else []) + passthrough
        office(a.action, a.port, a.approvals and not a.skip, a.attach, extra, a.new)
    elif a.cmd == "mcp":
        os.execv(MCP_CMD[0], MCP_CMD)
    elif a.cmd == "schedule":
        from jarvis_schedule import main as schedule_main  # type: ignore
        schedule_main(a.args)


if __name__ == "__main__":
    main()
