---
name: brain-consolidate
description: Nightly "sleep" for Jarvis - read the day's conversations (Telegram, terminal, voice, dashboard), file durable facts into the vault, capture commitments, queue proposed changes to me/, save lessons about how the user likes to work, and rewrite now.md. Runs on cron at 01:30; also on request ("consolidate today", "catch up the brain").
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, brain, memory, nightly]
    category: jarvis
---

# Brain consolidation (nightly)

## When to Use
- The nightly cron job (01:30, before `brain-lint` at 02:00).
- The user asks to catch the brain up on today, or it's been more than a day since the last run.

## Why
Facts only reach the vault today when someone says "save this". Most useful facts are said in
passing: "Sam's moving to Berlin in March", "I promised Brightlabs the deck by Friday", "don't book
me before 10am". This job makes sure none of that is lost.

## Procedure
1. **Find the window.** The last run is the newest `## [YYYY-MM-DD] consolidate` line in `log.md`.
   Default window: since then, or the last 24 hours if there's none.
2. **List conversations** from every tool the user talks to Jarvis in:
   - Hermes (Telegram, terminal, voice, dashboard): `session_search` with no arguments lists recent
     sessions; read each in the window by its `session_id`.
   - Claude Code: transcripts in `~/.claude/projects/**/*.jsonl` modified in the window.
   - Codex: `~/.codex/sessions/**` modified in the window.
   Read only user and assistant messages. Skip scheduled-job sessions and this job's own sessions.
3. **Extract, per conversation**, only durable things (skip small talk, one-off lookups, anything
   already in the vault):
   | Found | Goes to |
   |---|---|
   | Facts about people, clients, projects, places, dates | The right page, via the `brain-ingest` procedure; cite `sources: [conversation YYYY-MM-DD <platform>]` |
   | Commitments ("I'll send…", "remind me…", "waiting on Sam") | The project/person page as `- [ ]` items with dates; open loops in `now.md` |
   | Decisions made | `decisions/` page (`log-decision`) or the project page |
   | Changes to goals, values, principles, profile | **Never edit `me/`.** Append to `me/_proposals.md`: date, proposed change, why, source |
   | How the user likes Jarvis to work ("shorter", "no calls before 10") | The runtime's memory if it has one (Hermes `memory` tool, target `user`); always also propose it for `me/profile.md` → "How I like to be helped" so every tool sees it |
   | A procedure that worked well and will recur | Say so in the summary; the skill-learning loop picks it up |
4. **Respect boundaries.**
   - Content Jarvis *read* in a conversation (emails, web pages, documents) is not a fact about the user
     unless the user confirmed it. File it as a source only if they asked.
   - Things said in group chats: only work facts, to work pages. Nothing personal about other people.
   - Health, money and journal material goes only to its private area, following `me/onboarding.json` privacy.
5. **Rewrite `now.md`** from scratch (keep it under ~250 words), from goals, open loops, the next
   7 days' events and deadlines, and today's changes:
   ```
   # Now
   Updated: YYYY-MM-DD
   ## Focus this week
   ## Open loops (waiting on / promised)
   ## Next 7 days
   ## Recently changed
   ```
6. **Record.** Append to `log.md`: `## [YYYY-MM-DD] consolidate | N conversations, M facts, K commitments, P proposals`.
7. **Report.** Stay silent at night. The morning briefing mentions it in one line
   ("Overnight I filed 6 facts and 2 commitments; 1 suggested change to your goals is waiting").

## Pitfalls
- Duplicating facts already on a page. Read the page first; update, don't append the same fact twice.
- Filing guesses. If a conversation is ambiguous ("maybe we'll move the launch"), file it as tentative
  or skip it.
- Editing `me/` directly. Proposals only.
- Re-processing the same conversations: always start from the last `consolidate` line.

## Verification
`log.md` has tonight's line; every new fact cites its conversation; `now.md` has today's date;
`me/_proposals.md` lists anything touching `me/`.
