"""`jarvis` command: plug Jarvis into any agent harness.

    jarvis install <harness...> | all      wire skills, identity, MCP server and recall into a harness
    jarvis uninstall <harness...>          remove exactly what install added
    jarvis render                          re-render identity (role/tone/autonomy) everywhere installed
    jarvis doctor                          what's installed where, and what's detected on this Mac
    jarvis schedule ...                    run scheduled jobs from another runtime (see `jarvis schedule -h`)
    jarvis mcp                             run the Jarvis MCP server on stdio (what harnesses launch)

Harnesses: claude-code, codex, deepseek, hermes, openclaw, cursor, gemini, claude-desktop.
Everything install adds is marked, so uninstall removes only Jarvis's parts.
"""
from __future__ import annotations

import argparse
import json
import os
import re
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
        if dst.is_symlink() and Path(os.readlink(dst)).resolve() == src.resolve():
            linked.append(src.name)
            continue
        if dst.exists() or dst.is_symlink():
            if dst.is_symlink() and str(REPO) in os.readlink(dst):
                dst.unlink()                       # our old link pointing somewhere stale
            else:
                say(f"  ! {dst} already exists and isn't Jarvis's; left it alone", quiet)
                continue
        dst.symlink_to(src)
        linked.append(src.name)
    return linked


def link_agents(target: Path, quiet: bool) -> int:
    """Claude Code sub-agents (librarian, researcher, critic, creative) as per-file links."""
    target.mkdir(parents=True, exist_ok=True)
    n = 0
    for src in sorted((REPO / "agents").glob("*.md")):
        dst = target / src.name
        if dst.is_symlink() and str(REPO) in os.readlink(dst):
            dst.unlink()
        elif dst.exists():
            say(f"  ! {dst} already exists and isn't Jarvis's; left it alone", quiet)
            continue
        dst.symlink_to(src)
        n += 1
    return n


def unlink_skills(target: Path) -> int:
    n = 0
    if target.exists():
        for dst in target.iterdir():
            if dst.is_symlink() and str(REPO) in os.readlink(dst):
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


def refresh_identity(quiet: bool = False) -> None:
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
        if not plugin.exists():
            plugin.symlink_to(REPO / "hermes" / "plugins" / "jarvis-recall")
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


def export_skills(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for src in skill_dirs():
        shutil.make_archive(str(out / src.name), "zip", root_dir=src.parent, base_dir=src.name)
    print(f"✓ {len(skill_dirs())} skill zips in {out}. Upload them in the Claude app: Settings → Capabilities → Skills.")


def main() -> None:
    ap = argparse.ArgumentParser(prog="jarvis", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("install", help="plug Jarvis into harnesses")
    p.add_argument("harness", nargs="+", help=f"{', '.join(HARNESSES)} or all (all = the ones found on this Mac)")
    p = sub.add_parser("uninstall", help="remove Jarvis from harnesses")
    p.add_argument("harness", nargs="+")
    sub.add_parser("render", help="re-render identity everywhere")
    sub.add_parser("doctor", help="show status")
    p = sub.add_parser("export-skills", help="zip skills for upload to the Claude app")
    p.add_argument("--out", type=Path, default=config.home() / "skill-zips")
    sub.add_parser("mcp", help="run the MCP server on stdio")
    p = sub.add_parser("schedule", help="scheduled jobs from another runtime")
    p.add_argument("args", nargs=argparse.REMAINDER)
    a = ap.parse_args()

    if a.cmd == "install":
        names = [h for h in HARNESSES if DETECT[h]()] if a.harness == ["all"] else a.harness
        for h in names:
            install(h)
        refresh_identity(quiet=True)
    elif a.cmd == "uninstall":
        for h in a.harness:
            uninstall(h)
    elif a.cmd == "render":
        refresh_identity()
    elif a.cmd == "doctor":
        doctor()
    elif a.cmd == "export-skills":
        export_skills(a.out)
    elif a.cmd == "mcp":
        os.execv(MCP_CMD[0], MCP_CMD)
    elif a.cmd == "schedule":
        from jarvis_schedule import main as schedule_main  # type: ignore
        schedule_main(a.args)


if __name__ == "__main__":
    main()
