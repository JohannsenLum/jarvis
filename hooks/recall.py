#!/usr/bin/env python3
"""Jarvis recall hook for harnesses with Claude-style hooks (Claude Code, Codex, DeepSeek Harness via
its Claude hooks bridge).

Register for two events (add --identity on SessionStart when installed as a plugin, where
there is no CLAUDE.md import):
- SessionStart      → adds now.md (current focus, open loops, next 7 days)
- UserPromptSubmit  → adds short vault notes on people/clients/projects the prompt names
Reads the hook JSON on stdin, prints `hookSpecificOutput.additionalContext`, prints nothing when there's
nothing to add. Never blocks the prompt, even on errors.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "core"))


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return
    event = data.get("hook_event_name") or data.get("hookEventName") or ""
    try:
        from jarvis_core.recall import recall_text
        if event == "SessionStart":
            text = recall_text(user_message="", is_first_turn=True)
            if "--identity" in sys.argv:     # plugin mode: no CLAUDE.md import, so bring the identity here
                from jarvis_core import identity
                text = identity.render_text() + ("\n\n" + text if text else "")
        elif event == "UserPromptSubmit":
            text = recall_text(user_message=data.get("prompt") or data.get("user_prompt") or "", is_first_turn=False)
        else:
            return
    except Exception:  # noqa: BLE001  recall must never break a prompt
        return
    if text:
        print(json.dumps({"hookSpecificOutput": {"hookEventName": event, "additionalContext": text}}))


if __name__ == "__main__":
    main()
