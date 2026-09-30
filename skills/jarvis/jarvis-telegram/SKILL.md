---
name: jarvis-telegram
description: Choose how Jarvis appears in Telegram - one normal DM, topics inside the DM (Inbox, Work, Life, Briefings, General), or a group with forum topics - and set it up, or skip for later. Use in onboarding, or when the user says "set up my Telegram topics", "switch Telegram to topics", "add Jarvis to a group".
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, telegram, topics]
    category: jarvis
---

# Jarvis on Telegram

## When to Use
- Onboarding step 8, after Telegram is connected.
- The user wants to change how Jarvis shows up in Telegram, or asks what the options are.

## The options (ask with your question tool, recommended first)
- `Topics in my DM (recommended)`: Inbox, Work, Life, Briefings, General inside the private chat. Each
  topic is its own conversation; Inbox auto-loads `brain-ingest`, so anything dropped there is filed;
  briefings arrive in Briefings. Work and life context stay apart.
- `One normal DM`: a single conversation. Simplest.
- `Group with topics`: a supergroup with forum topics, e.g. to add colleagues later. Jarvis answers
  only when @mentioned or replied to. Briefings stay in the private DM.
- `Skip for now`: record `channels.telegram_mode: "pending"` in `me/onboarding.json` and add it to `pending`.

## Procedure
Telegram must be connected first (`TELEGRAM_ALLOWED_USERS` set in `~/.hermes/.env`). If it isn't,
say so and offer the Telegram connection steps first (onboarding `references/telegram.md`).

Run the Jarvis helper (path: `<Jarvis repo>/adapters/hermes/telegram_mode.sh`, repo path: `jarvis_status`) with the terminal tool, with the user's approval:
- Topics in DM: `telegram_mode.sh dm-topics`, then tell the user the one manual step it prints
  (BotFather Mini App → My bots → bot → Bot Settings → Threads Settings → Threaded Mode on).
  After they confirm and the gateway has restarted (`hermes gateway restart`, ask first; it drops
  the current chat session), run `telegram_mode.sh link-briefings`, then restart once more.
- Normal DM: `telegram_mode.sh dm`, then restart the gateway.
- Group: `telegram_mode.sh group-topics`, relay its Telegram steps, restart the gateway.

Record the choice in `me/onboarding.json` → `channels.telegram_mode`:
`dm | dm_topics | group_topics | pending`, and append to `log.md`.

## Pitfalls
- Restarting the gateway from inside a Telegram chat ends that turn. Warn first; prefer the user
  running the restart from the terminal or the Hermes app.
- In a group, never reveal private areas (`me/`, `life/`, `relationships/`, `journal/`).
- Don't add colleagues to `TELEGRAM_ALLOWED_USERS` unless the user asks.

## Verification
`telegram_mode.sh status` shows the expected topics / mention setting; in topic mode, the five topics
appear in the DM and a test message in Inbox gets filed.
