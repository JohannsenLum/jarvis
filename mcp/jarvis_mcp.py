#!/usr/bin/env python3
"""Jarvis MCP server: Jarvis's brain as tools for any MCP-capable harness.

Claude Code, Codex, DeepSeek Harness, Hermes, OpenClaw, Cursor, Gemini CLI and the Claude desktop app
all launch this the same way: `python3 <repo>/mcp/jarvis_mcp.py` over stdio. Standard library only.
Protocol: JSON-RPC 2.0, one message per line (MCP stdio transport).
"""
from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "core"))
from jarvis_core import config, frameworks, identity, vault  # noqa: E402
from jarvis_core.recall import recall_text  # noqa: E402

SERVER = {"name": "jarvis", "version": "1.0.0"}
PROTOCOLS = ("2025-06-18", "2025-03-26", "2024-11-05")
INSTRUCTIONS = (
    "Jarvis's second brain (the user's private markdown vault). Call jarvis_now at the start of a "
    "conversation and jarvis_recall when the user names a person, client or project. Use jarvis_write / "
    "jarvis_propose / jarvis_log for vault changes: they enforce the vault rules and keep the log."
)


def _s(desc: str, **props) -> dict:
    required = [k for k, v in props.items() if v.pop("required", False)]
    return {"type": "object", "properties": props, "required": required, "additionalProperties": False, "description": desc}


def _str(desc: str, required: bool = False, enum: list | None = None) -> dict:
    d = {"type": "string", "description": desc}
    if enum:
        d["enum"] = enum
    if required:
        d["required"] = True
    return d


TOOLS = {
    "jarvis_now": ("Short-term memory: focus this week, open loops, next 7 days (now.md).", _s("No arguments.")),
    "jarvis_recall": ("Vault notes about the people, clients, projects and goals named in a message. Returns nothing when nothing matches.",
                      _s("", message=_str("The user's message, verbatim.", True))),
    "jarvis_search": ("Search the vault by words in file names and contents, best matches first. Private areas (health, money, people, journal, declarations, deal cards) return the path only.",
                      _s("", query=_str("Words to find.", True), limit={"type": "integer", "description": "Max results (default 10)."},
                         space=_str("Only search inside this space (a company or client folder, e.g. work/acme/clients/brightlabs)."))),
    "jarvis_read": ("Read a vault page (or list a folder). Not for private areas: use jarvis_read_private for those.",
                    _s("", path=_str("Path relative to the vault, e.g. work/acme/clients/brightlabs/overview.md", True))),
    "jarvis_read_private": ("Read a page in a private area (life/health, life/finance, relationships, journal, frameworks/declarations, frameworks/deal-cards). The user is asked every time; use only when this request needs it, and never pass its contents to web tools or other people.",
                            _s("", path=_str("Path relative to the vault.", True), why=_str("One line on why this request needs it (shown to the user).", True))),
    "jarvis_write": ("Create, replace or append a vault page. Default mode is create, which fails if the page exists: read it first, then append or replace. Enforces the rules: raw/ is never edited, me/ is the user's (use jarvis_propose), every change is logged, and the previous version is kept (jarvis_restore).",
                     _s("", path=_str("Path relative to the vault.", True), content=_str("Full page content (replace/create) or text to append.", True),
                        mode=_str("create | replace | append (default create).", enum=["create", "replace", "append"]),
                        reason=_str("One line for log.md, e.g. 'Brightlabs wants Q1 rebrand (chat 2026-09-29)'."))),
    "jarvis_space": ("Company and client knowledge bases. Each company and client folder is its own space: its own pages, raw/ sources, log and generated index, with no links outside it, so it can be shared on its own later. "
                     "action=create makes a folder a space (safe on an existing folder), list shows them all, check reports what would leak if it were shared, "
                     "dev makes a new project repo in a client's dev/ folder (code lives there in its own git repo, outside the knowledge base).",
                     _s("", action=_str("create | list | check | dev", True, enum=["create", "list", "check", "dev"]),
                        path=_str("The folder, e.g. work/acme or work/acme/clients/brightlabs (create, check)."),
                        kind=_str("company | client | project | team (create; default client).", enum=["company", "client", "project", "team"]),
                        name=_str("Display name (create), e.g. Brightlabs; or the project name (dev), e.g. website."))),
    "jarvis_history": ("List the saved earlier versions of a page (kept automatically before every change).",
                       _s("", path=_str("Path relative to the vault.", True))),
    "jarvis_restore": ("Undo changes to a page: put back an earlier version (the latest saved one unless a version is given). The current text is saved first, so this can be undone too.",
                       _s("", path=_str("Path relative to the vault.", True), version=_str("A version name from jarvis_history (optional)."))),
    "jarvis_propose": ("Suggest a change to the user's own pages in me/ (goals, values, principles, profile). Adds it to me/_proposals.md for their yes/no.",
                       _s("", change=_str("The proposed change.", True), why=_str("Why."), source=_str("Where it came from."))),
    "jarvis_log": ("Append one line to log.md.", _s("", entry=_str("What changed.", True), kind=_str("ingest | update | create | lint | consolidate | connect | import (default update)."))),
    "jarvis_onboarding": ("Read me/onboarding.json, or merge a patch into it (onboarding answers, pending items, connections, imports).",
                          _s("", patch={"type": "object", "description": "Fields to merge. Omit to read."})),
    "jarvis_settings": ("Get or set Jarvis's role, tone and autonomy. Changes apply everywhere after identity is re-rendered (done automatically).",
                        _s("", role=_str("New role.", enum=list(identity.ROLES)), tone=_str("New tone.", enum=list(identity.TONES)),
                           autonomy=_str("New autonomy.", enum=list(identity.AUTONOMY)))),
    "jarvis_frameworks": ("List Jarvis's frameworks (168-hour week, AIOO, declarations, deal cards…), or get one: its full text, where its results go in the vault and what the user already has.",
                          _s("", name=_str("Framework id, e.g. 168, aioo, declarations, deal-cards. Omit to list them all."))),
    "jarvis_status": ("Where Jarvis is installed, its settings, onboarding progress and pending items.", _s("No arguments.")),
}


def call(name: str, args: dict) -> str:
    if name == "jarvis_now":
        path = vault.resolve("now.md")
        return path.read_text() if path.exists() else "now.md doesn't exist yet. It's written by onboarding and nightly consolidation."
    if name == "jarvis_recall":
        return recall_text(user_message=args.get("message", ""), is_first_turn=False) or "No vault pages match this message."
    if name == "jarvis_search":
        hits = vault.search(args["query"], int(args.get("limit") or 10), args.get("space") or "")
        return json.dumps(hits, indent=2, ensure_ascii=False) if hits else "No matches."
    if name == "jarvis_read":
        return vault.read(args["path"])
    if name == "jarvis_read_private":
        return vault.read(args["path"], allow_private=True)
    if name == "jarvis_write":
        return vault.write(args["path"], args["content"], args.get("mode") or "create", args.get("reason") or "")
    if name == "jarvis_space":
        action = args.get("action")
        if action == "list":
            spaces = vault.space_list()
            return json.dumps(spaces, indent=2, ensure_ascii=False) if spaces else "No spaces yet. Make a company or client folder a space with action=create."
        if not args.get("path"):
            raise vault.VaultError("Give the folder path.")
        if action == "create":
            return vault.space_create(args["path"], args.get("kind") or "client", args.get("name") or "")
        if action == "check":
            return json.dumps(vault.space_check(args["path"]), indent=2, ensure_ascii=False)
        if action == "dev":
            return vault.dev_new(args["path"], args.get("name") or "")
        raise vault.VaultError("action must be create, list or check.")
    if name == "jarvis_history":
        versions = vault.history(args["path"])
        return "\n".join(versions[-20:]) if versions else "No earlier versions saved for this page."
    if name == "jarvis_restore":
        return vault.restore(args["path"], args.get("version") or "")
    if name == "jarvis_propose":
        return vault.propose(args["change"], args.get("why", ""), args.get("source", ""))
    if name == "jarvis_log":
        return vault.log(args["entry"], args.get("kind") or "update")
    if name == "jarvis_onboarding":
        data = vault.update_onboarding(args["patch"]) if args.get("patch") else vault.onboarding()
        return json.dumps(data, indent=2, ensure_ascii=False) if data else "Onboarding hasn't started (no me/onboarding.json)."
    if name == "jarvis_settings":
        wanted = {k: args.get(k) for k in ("role", "tone", "autonomy")}
        if any(wanted.values()):
            s = identity.set_settings(**wanted)
            identity.render()
            _refresh_installed()
            return f"Settings now: {json.dumps(s)}. Applies from the next conversation in every connected tool."
        return json.dumps(identity.settings())
    if name == "jarvis_frameworks":
        return frameworks.get(args["name"]) if args.get("name") else json.dumps(frameworks.listing(), indent=2)
    if name == "jarvis_status":
        cfg = config.load()
        ob = vault.onboarding()
        return json.dumps({
            "repo": str(config.repo()), "vault": str(config.vault()), "home_runtime": config.home_runtime(),
            "installed_in": cfg.get("harnesses", []), "settings": identity.settings(),
            "onboarding": ob.get("status", "not started"), "pending": [p.get("question") for p in ob.get("pending", [])],
            "connections": ob.get("connections", {}),
        }, indent=2)
    raise vault.VaultError(f"Unknown tool {name}")


def _refresh_installed() -> None:
    """Re-apply the rendered identity to every harness Jarvis is installed in."""
    try:
        sys.path.insert(0, str(config.repo() / "bin"))
        from jarvis_cli import refresh_identity  # type: ignore
        refresh_identity(quiet=True)
    except Exception:  # identity still rendered to ~/.jarvis/AGENTS.md
        pass


def handle(msg: dict) -> dict | None:
    method, mid = msg.get("method"), msg.get("id")
    if mid is None:
        return None                                   # notification
    try:
        if method == "initialize":
            asked = (msg.get("params") or {}).get("protocolVersion")
            result = {"protocolVersion": asked if asked in PROTOCOLS else PROTOCOLS[0],
                      "capabilities": {"tools": {"listChanged": False}}, "serverInfo": SERVER, "instructions": INSTRUCTIONS}
        elif method == "ping":
            result = {}
        elif method == "tools/list":
            result = {"tools": [{"name": n, "description": d, "inputSchema": s} for n, (d, s) in TOOLS.items()]}
        elif method == "tools/call":
            p = msg.get("params") or {}
            try:
                text, err = call(p.get("name", ""), p.get("arguments") or {}), False
            except (vault.VaultError, KeyError) as e:
                text, err = (f"Missing argument: {e}" if isinstance(e, KeyError) else str(e)), True
            result = {"content": [{"type": "text", "text": text}], "isError": err}
        else:
            return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"Method not found: {method}"}}
        return {"jsonrpc": "2.0", "id": mid, "result": result}
    except Exception as e:  # noqa: BLE001
        traceback.print_exc(file=sys.stderr)
        return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32603, "message": str(e)}}


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        for m in (msg if isinstance(msg, list) else [msg]):
            reply = handle(m)
            if reply is not None:
                sys.stdout.write(json.dumps(reply, ensure_ascii=False) + "\n")
                sys.stdout.flush()


if __name__ == "__main__":
    main()
