---
name: jarvis-settings
description: Change Jarvis's role (chief of staff, executive assistant, thinking partner, coach, life manager), tone (warm, formal, direct) or autonomy (ask-first, act-and-tell, handle-quietly) permanently. Use when the user says "from now on be my…", "be more formal/direct", "you can handle small things yourself", "always ask me first", or asks what roles exist.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, settings, identity]
    category: jarvis
---

# Jarvis settings

## When to Use
- A **permanent** change to role, tone or autonomy. For a one-off ("coach me on this"), don't use this
  skill: just read the role file and follow it for the current conversation.
- The user asks which roles exist or what they mean: summarise each role file in one line.

## Where things live
- Settings: `me/onboarding.json` → `user.role`, `user.tone`, `user.autonomy` in the vault.
- Role library: `core/roles/<role>.md` in the Jarvis repo.
- Identity: rendered from `core/AGENTS.md.tmpl` + those settings into every connected tool (Claude Code,
  Codex, DeepSeek Harness, Hermes, OpenClaw, Gemini) by `jarvis render`.

Valid values
- role: `chief-of-staff | executive-assistant | thinking-partner | coach | life-manager`
- tone: `warm | formal | direct`
- autonomy: `ask-first | act-and-tell | handle-quietly`

## Procedure
1. If the request is ambiguous, confirm with your question tool (one question, choices from the valid
   values, recommended first). Raising autonomy to `handle-quietly`: confirm once and name what it covers.
2. Call `jarvis_settings` with the new value(s). It updates `me/onboarding.json`, re-renders the identity
   and applies it to every connected tool. Without the Jarvis MCP server: update `me/onboarding.json`
   yourself, then ask the user to run `jarvis render` in a terminal.
3. Append to `log.md` (the tool does this): `settings: role=<role> tone=<tone> autonomy=<autonomy>`.
4. Reply in one line and say it applies from the next conversation, in every tool. For the rest of this
   conversation, behave in the new way already.

## Pitfalls
- Editing rendered identity files (AGENTS.md, SOUL.md, CLAUDE.md blocks) by hand: they're regenerated.
- Letting autonomy override the "always ask first" list. It never does.

## Verification
- `jarvis_settings` (no arguments) returns the new values; `~/.jarvis/AGENTS.md` shows the new role.
