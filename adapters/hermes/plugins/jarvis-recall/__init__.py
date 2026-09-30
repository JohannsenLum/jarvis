"""Hermes adapter for Jarvis recall (logic lives in core/jarvis_core/recall.py).

Adds now.md on the first turn and short notes on people/projects the message names, into the user's
message (never the system prompt). Local file reads only; nothing added when nothing matches.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "core"))
from jarvis_core.recall import recall_text  # noqa: E402


def recall(user_message="", is_first_turn=False, **kwargs):
    text = recall_text(user_message=user_message, is_first_turn=is_first_turn)
    return {"context": text} if text else None


def register(ctx):
    ctx.register_hook("pre_llm_call", recall)
