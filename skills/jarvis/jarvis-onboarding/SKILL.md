---
name: jarvis-onboarding
description: Step-by-step first-run setup for Jarvis. Interviews the user with tap-to-answer questions, builds their second-brain folders, installs routines, and records skipped questions so onboarding can be resumed later. Use on first contact, or when the user says "onboard me", "finish onboarding", "set me up", or wants to add a new job, company or life area.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, onboarding, setup]
    category: jarvis
---

# Jarvis onboarding

## When to Use
- `me/onboarding.json` in the knowledge vault is missing, or its `status` is not `complete`.
- The user asks to (re)do or finish onboarding, or to add a new job, company, client list or life area.
- Resume mode: onboarding is complete but `pending` is not empty and the user agreed to finish it.

## Rules for every question
- Ask with your question tool (Hermes your question tool, Claude Code's question tool). Put options in its
  choices, not in the question text. With no question tool, ask in plain text with numbered options and
  accept any free-text answer.
- Question tools typically allow at most 4 choices plus a free-text "Other" row; design for that. Put the recommended
  choice first. Where there is room, make the last choice **"Skip for now"**.
- Tell the user once, in the intro: *"Tap Other and type skip on any question to come back to it later."*
- Batch independent questions in one your question tool call (max 5). Ask dependent ones separately.
- **Skipping.** If the answer is "Skip for now", "skip", "later", "not now", or the call times out,
  do not ask again. Add the question to `pending` in `me/onboarding.json` (see `references/onboarding-json.md`)
  and move on. Nothing about a skipped question is guessed or invented.
- After every step, write what you learned to `me/onboarding.json` straight away, so a dropped chat
  loses nothing. Set `status: "in_progress"` and `current_step`.
- Keep each message short. One friendly line before each question batch, no lectures.
- Never ask for API keys, bot tokens or passwords in chat. Tell the user where to put them (below).

## Procedure

Knowledge vault: the path in your identity ("Your second brain"), or `jarvis_status`. Read `SCHEMA.md` there first.
Folder layouts per answer are in `references/templates.md`. Follow them exactly.

**Resume mode.** If `me/onboarding.json` exists with `status: in_progress`, continue from `current_step`.
If it is `complete` and has `pending` items, ask only those items, in step order, then remove each one
from `pending` once answered (or leave it if skipped again).

### 1. Hello and role
Say who you are in one line, that setup takes about five minutes, that everything is plain files they
own, and the skip rule. Then batch:
- "What should I call you?" (open)
- "What role do you want me to play?" choices:
  `Chief of Staff: run my priorities, prep me, push back`,
  `Executive Assistant: calendar, admin, logistics`,
  `Thinking Partner: strategy and decisions, challenge me`,
  `Something else: coach or life manager`
- "How should I talk to you?" choices: `Warm: friendly and casual`, `Formal: polite and precise`,
  `Direct: short and blunt`, `Skip for now`
- "How much should I do without asking?" choices:
  `Act and tell me: small things, then a one-line note`, `Ask first: always check with me`,
  `Handle it quietly: small things, summarised daily`, `Skip for now`

If they chose "Something else", ask one follow-up: "Which one?" choices:
`Coach: goals, habits, accountability`, `Life Manager: family, home, money, personal time`, `Skip for now`.

Skipped defaults: role `chief-of-staff`, tone `warm`, autonomy `act-and-tell` (each still goes in `pending`).
Apply the answers with `jarvis_settings` (role, tone, autonomy; it updates Jarvis in every connected tool) and
tell the user their chosen role takes full effect from the next conversation. Behave in it already.

### 2. Work
- "What does your work look like right now? Pick all that apply." multi_select, choices:
  `Agency or studio`, `Employee at a company`, `Founder or CEO`, `Freelancer`.
  (Student, retired, between jobs, etc. arrive through Other. Map "student" to the student template;
  anything else with no template: note it in `me/profile.md` and skip work folders.)

### 3. Work details (only for the types chosen; one batch)
- Agency: "What's the agency called?" (open) · "Who are your current clients? Comma-separated." (open)
- Employee: "Which company, and what's your role?" (open)
- Founder/CEO: "What's the company called?" (open) · "What stage is it at?" choices:
  `Seed or earlier`, `Series A+`, `Bootstrapped`, `Skip for now`
- Freelancer: "Who are your current freelance clients? Comma-separated." (open)
- Student: "Where do you study, and what?" (open)

### 4. Life areas (one batch, two multi-select questions)
- "Which parts of life should I help with?" `Health`, `Fitness`, `Money`, `Home & admin`
- "Any of these too?" `Learning`, `Creative work`, `Travel`, `Faith & reflection`

### 5. People
- "Who are the most important people in your life? Name and relationship, e.g. Sam (partner), Mum,
  Wei Ling (close friend), David (mentor)." (open)
Sort each person into a circle: partner, family, close, mentor, network (ask only if truly unclear).
Confirm the list back in one line before creating pages.

### 6. Goals
- "What are the one to three things you most want to make happen this year?" (open)

### 7. Principles (one batch)
- "Which ideas do you want to decide by?" multi_select: `Eisenhower matrix`, `Dichotomy of control`,
  `Regret minimization`, `80/20 rule`
- "Any of these?" multi_select: `First principles`, `Pre-mortem`, `Deep work`, `1% better`
- "Any rules of your own you live by? One per line, or skip." (open)
- "Want to start one of my frameworks after setup?" `168-hour week (budget your time)`,
  `Declarations (goals as who you are)`, `AIOO (plan backwards from the outcome)`, `Deal cards (track
  opportunities)`. "Other" / no answer = skip, and add it to `pending`. Record the choice as
  `frameworks.next` in onboarding.json; don't run it now. Deal cards fit people with clients or deals.

### 8. Rhythm and chat (one batch)
- "When should I send your morning briefing?" `07:30`, `07:00`, `08:00`, `Skip for now`
- "Which day for your weekly review?" `Sunday`, `Friday`, `Monday`, `Skip for now`
- "Do you want me on Telegram too?" `Yes, I have a bot token`, `Yes, walk me through it`,
  `Already connected`, `Skip for now`

Telegram:
- "walk me through it": give the steps from `references/telegram.md`, then continue.
- Either "Yes" answer: tell them to run `hermes gateway setup` in a terminal and paste the token
  **there**, not in this chat. Record `channels.telegram: "setup_pending"`, and add it to `pending`
  until the gateway reports Telegram connected.
- Once Telegram is connected (or if it already was), load `jarvis-telegram` and ask how Jarvis should
  appear: topics in the DM (recommended), one normal DM, a group with topics, or skip for now.

### 9. Connections
Load the `jarvis-connections` skill. Recommend only its eight connections. One batch, two multi-select
questions (recommended ones first, per that skill's defaults):
- "Which of these should I connect?" `Google: Gmail, Calendar, Drive`, `Apple: Reminders, Notes, iMessage`,
  `Obsidian: open your second brain`, `Work files: Word, Excel, PowerPoint, PDF`
- "Any of these for building or creating?" `GitHub: code`, `Vercel: websites`, `Cloudflare: domains`,
  `Higgsfield: AI images and video`
Either question can be skipped (Other → "skip").
Then connect the chosen ones one at a time with that skill's procedure. Each can be skipped; skipped
or failed ones are recorded as `connections.<id>: "pending"` and in `pending`. If the user wants to
leave setup for later, record all chosen ones as pending and move on: Google can take ten minutes.

### 10. Privacy (one batch, four questions, same choices)
For each of Health, Money, Relationships, Journal: "Where may your <area> notes live?"
choices: `Local only`, `Encrypted backup`, `Cloud OK`, `Skip for now`.
Skipped areas default to `local` (safest) and go in `pending`. Only ask Health/Money if chosen in step 4.

### 11. Voice at the desk
- "Do you want to talk to me by voice at your desk?" `Yes, with Jev fast mode`,
  `Yes, standard mode`, `Not now`
Jev fast mode (instant Mac commands and multi-step web tasks in Chrome): tell them to get a key at
console.typesafe.ai. Standard mode needs no key (every request comes to you; a bit slower).
Either way they run `jarvis setup hermes --voice` in a terminal: it fetches the jarvis-voice app if
needed, asks for the key privately (never paste keys in chat), and installs the `jarvis-voice` command.
"Not now" goes in `pending`.

### 12. Existing files
Load the `jarvis-import` skill and offer to look for existing client, project and work folders
(Documents, Desktop, Downloads, iCloud Drive, cloud drives). Follow its steps 1-5 now: scan (or use
setup's scan), show, ask, map, and record the choices as `queued` in `imports`. The actual import
happens after Build. "Skip for now" goes in `pending`.

### 13. Build
1. Create the pages the answers actually fill (profile, goals, each named person, client, company,
   chosen principle), in the places `references/templates.md` maps out, creating folders as needed.
   **No empty placeholder folders.** Use the page templates in `_templates/`. Do not overwrite
   existing files; merge. Also write `now.md` (from goals and anything due soon) and an empty
   `me/_proposals.md` with a one-line header.
2. Write `me/profile.md` (name, role, tone, autonomy, work summary) and `me/goals/<year>.md` as **drafts**
   (`status: draft` in frontmatter). Write chosen frameworks to `me/frameworks/<slug>.md` and own rules
   to `me/principles.md`.
3. Update `SCHEMA.md` → `## Active templates` with the chosen work and life templates.
4. Schedule the routines on the **home runtime** (`jarvis_status` → `home_runtime`). In Hermes, use the cron
   tool (natural language is fine), delivering to the user's main chat channel, or the CLI if none.
   Anywhere else, tell the user to run `jarvis schedule install` in a terminal (it creates the same jobs on
   the runner they chose: Hermes, launchd + Claude Code/Codex, or OpenClaw). The jobs:
   - daily at the briefing time: load `jarvis-morning-briefing`
   - weekly on the review day at 18:00: load `jarvis-weekly-review`
   - nightly at 01:30, silent: load `brain-consolidate`
   - nightly at 02:00, silent unless issues: load `brain-lint`
5. Set `status: "complete"` in `me/onboarding.json` (even with pending items), add `completed_at`.
6. Append to `log.md`: `## [YYYY-MM-DD] onboarding | created N pages, M pending`.
6b. If any `imports` are queued, start the first batch now with `jarvis-import` step 6, and schedule
   the rest overnight if there are more.
7. Finish with a short summary: what you built (counts), what's pending, and three things to try
   ("Tell me something to remember", "What's my week look like?", "Help me decide …").
   Mention they can open the vault folder in Obsidian. If they picked a framework (`frameworks.next`),
   offer to start it now with `jarvis-frameworks`.

## Pitfalls
- Asking too much at once. Stick to the batches above.
- Inventing details for skipped questions. Leave them out and list them in `pending`.
- Creating `work/` folders for types the user didn't pick.
- Writing tokens or keys anywhere in the vault.
- On a re-run, overwriting the user's edited pages. Always merge.

## Verification
- `me/onboarding.json` parses as JSON and matches `references/onboarding-json.md`.
- Every chosen work type has its folder; every person has a page under `relationships/people/`.
- `jarvis schedule status` (or `hermes cron list` on Hermes) shows the briefing, review, consolidate and lint jobs.
- `log.md` has the onboarding entry.
