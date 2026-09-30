# Jarvis

Your own personal assistant, living in a folder you own. Jarvis knows your work, your people, your goals
and how you like to decide, keeps a private second brain in plain markdown, and runs your mornings.

It isn't a new AI app. It's a layer that plugs into the AI tools you already use (Claude, Codex, Gemini,
Cursor, Hermes, OpenClaw and others), so it's the same Jarvis everywhere: one identity, one vault, one
set of skills.

## Get started

```bash
npx github:JohannsenLum/jarvis
```

A two-minute wizard asks your name, what to call your assistant, its role, tone and how much it may do
on its own, and builds your Jarvis folder (default `~/Jarvis`). Then open that folder:

- **Claude desktop app** (recommended): open `~/Jarvis` in the Code section.
- **Terminal:** `cd ~/Jarvis && claude` (or `codex`, `gemini`, …).

Say hi. Jarvis takes it from there. On first open, approve the folder's `jarvis` tools when asked.

Needs macOS, Node 18+, Python 3 and git (`xcode-select --install` covers Python and git).

## Onboarding: five chapters, about eight minutes

Jarvis interviews you in a chat that builds your second brain as you answer. You tap answers instead of
typing, and you can skip anything or say "pause" and pick up later.

```
◆◇◇◇◇  1 · Meet            role, tone, autonomy, with a preview of how each one sounds
◆◆◇◇◇  2 · Your world      work, clients, life areas, the people who matter
◆◆◆◇◇  3 · What matters    goals, the ideas you decide by, a framework to try
◆◆◆◆◇  4 · Your rhythm     which routines, what your briefing covers, when; chat and voice
◆◆◆◆◆  5 · Connect         Google, Apple, GitHub…; privacy per area; bring in existing folders
```

After each chapter you see the pages it created (`+ relationships/people/sam.md`). It ends with your
vault, a short "who I think you are" card you can correct, your first briefing time, and three things to
try. Anything you skip is saved and offered again later ("finish onboarding").

## Your folder

```
~/Jarvis/
  knowledge/        your second brain (open it in Obsidian). Yours; updates never touch it
  skills/           your own skills. A copy of a Jarvis skill here overrides the original
  CLAUDE.md  AGENTS.md  GEMINI.md    Jarvis's identity in a marked block; add your own notes around it
  .claude/ .agents/ .codex/ .gemini/ .mcp.json    wiring for each AI tool (generated)
  .jarvis/          Jarvis itself: replaced wholesale by `jarvis update`, so no merge conflicts
```

- **Updates:** `jarvis update` swaps `.jarvis/` for the latest version and re-renders the wiring. Your
  vault, skills, notes and settings stay as they are.
- **Only in this folder by default.** Want Jarvis in every folder? `jarvis install claude-code --global`.
- The wizard makes the folder a private git repo. If you push it anywhere, keep that remote **private**.

## How it works day to day

- **Short-term memory:** `knowledge/now.md` (this week's focus, open loops, next 7 days) is read at the
  start of every conversation and rewritten every night.
- **Recall:** mention a person, client or project and Jarvis pulls in its page automatically.
- **Filing:** tell it something worth keeping and it files it on the right page, logging every change in
  `log.md`. Your own pages in `me/` are never edited without a yes (changes are proposed in
  `me/_proposals.md`).
- **Routines:** a morning briefing, a weekly review, and a nightly memory refresh and tidy-up.
- **Frameworks:** proven ways of thinking Jarvis runs with you (below).
- **Sub-agents:** a librarian, researcher, critic and creative it hands work to (below).

## Office dashboard

```bash
jarvis office          # in your Jarvis folder: opens the dashboard and your Claude session
```

A local dashboard (http://127.0.0.1:3777) for the Claude session in your Jarvis folder. You can switch
between two views: an isometric pixel-art **office** (drawn in code, with day and night through the
windows and your vault as a glowing Brain in the middle), where Jarvis and the four sub-agents sit at
desks and come alive when they work; a **control room** of cards with live status and `now.md`; and
**Command**, a command-centre view with the numbers: cost and tokens today and over 7 days (Claude Code's own
API-equivalent figures, per model), cache hits, context used, your plan's 5-hour and weekly usage (when
the Claude app is installed), agent runs, a live feed, routines, vault stats, CPU/RAM/disk and which
services are online, plus quick commands that type into your session.

- **Click anyone** to read their live conversation: Jarvis's chat, or exactly what the researcher is
  searching for right now.
- **Type from the dashboard or the terminal.** It's the same session: `jarvis office` runs Claude inside
  tmux, and the dashboard types into it. Messages to a sub-agent go through Jarvis.
- **Approve from either side.** Permission prompts appear as Allow / Deny cards; answer there or in the
  terminal, and the other one clears. Pickers and prompts (onboarding questions, folder trust) show in a
  live terminal mirror with arrow, Space and Enter buttons.
- Flags for Claude: `jarvis office --dangerously-skip-permissions` (no prompts at all, so no approval
  cards), or anything after `--`, e.g. `jarvis office -- --model opus`. If Claude is already running in
  the office, use `jarvis office restart -- <flags>`.
- It needs tmux (a small terminal tool that lets the dashboard type into your session). The installer
  offers to set it up when you say yes to the office, and `jarvis office` offers again if it's missing.
  Without it the dashboard still shows everything live and approvals still work; you just type in the
  terminal.
- Local only: bound to 127.0.0.1, with a per-run token. `jarvis office stop` closes the dashboard;
  Claude keeps running (`tmux attach -t jarvis` to get back to it).

## Routines

Everything runs locally on your Mac. Jarvis sets up the routines you pick in onboarding, where you
actually use it:

| You use | Routines run as | Turn off, edit, change time |
|---|---|---|
| Claude desktop app | Local routines (the app's Routines page) | On the Routines page, or ask Jarvis |
| Claude Code in the terminal, or Codex | macOS launchd jobs (`jarvis schedule install`) | Content: `me/routines.md`. Times and on/off: re-run `jarvis schedule install` (automatic sync is coming) |
| Hermes | Hermes cron | Ask Jarvis, or `hermes cron list` |

What each routine covers lives in `knowledge/me/routines.md`, which you can edit in Obsidian or change by
chat ("move my briefing to 8", "stop the weekly review", "add email highlights"). Scheduled runs use the
lighter model (Sonnet 5 or GPT-6 Luna). Routines only run while the Mac is awake; a missed one runs
when it wakes (in the desktop app: when the app is next open).

| Routine | When | What |
|---|---|---|
| Morning briefing | Your time, e.g. 07:30 | Top 3 for today, heads-ups, people to reach out to |
| Weekly review | Your day, 18:00 | Wins, goals progress, 168 audit if you use it |
| Nightly memory refresh | 01:30 | Files the day's facts and promises, rewrites `now.md` |
| Nightly tidy-up | 02:00 | Inbox, broken links, duplicates |

## Frameworks

Proven ways of thinking Jarvis can run with you. The frameworks live in `.jarvis/frameworks/` (ours,
updated); your results live in `knowledge/frameworks/<name>/` (yours, never touched).

| Framework | What it does |
|---|---|
| 168-hour week | Budget your week like money: sleep, health and people first, work gets the rest. Audited weekly |
| AIOO | Actions × Inputs → Outputs → Outcome: plan backwards; when nothing moves, fix purpose first |
| Declarations | Goals written as who you are ("I am…"), read daily, reviewed against reality |
| Deal cards | A card for every live opportunity (context, BANT, next step), tied to the person |

Say "let's do the 168", "run AIOO on this goal" or "make a deal card for this". Jarvis also offers one
when it fits. From [twiss-io/lifeos-plugin](https://github.com/twiss-io/lifeos-plugin); see
`frameworks/README.md`.

## Roles

| Setting | Options |
|---|---|
| Role | **Chief of Staff** (default): runs your priorities, preps you, pushes back · **Executive Assistant**: calendar, admin, logistics · **Thinking Partner**: strategy and decisions · **Coach**: goals, habits, accountability · **Life Manager**: family, home, money |
| Tone | warm · formal · direct |
| Autonomy | ask-first · act-and-tell (default) · handle-quietly |

At every level Jarvis asks before sending, posting, spending money or credits, deleting, changing
events other people attend, or editing `me/`. Borrow a role for one conversation ("thinking partner
mode: should I raise prices?") or change it for good ("from now on, be my coach").

## Sub-agents

In tools that support them (Claude Code), Jarvis hands jobs to four workers. Each exists for a reason: a
clean context, limited permissions, a different model, or independence. Domain know-how (sales,
development) lives in skills, not agents.

| Sub-agent | Job | Model | Can't |
|---|---|---|---|
| librarian | Filing, nightly memory refresh, tidy-up | Sonnet 5 | browse the web, send, delete |
| researcher | Web and vault research, sourced summaries | Sonnet 5 | write anything (keeps web content out of memory) |
| critic | Independent second opinion, pre-mortems | Opus 5.5 | change anything |
| creative | Higgsfield images and video, diagrams | Sonnet 5 | publish, or spend credits without a yes |

## Connections

Set up one at a time in onboarding, or later ("connect my Google"). Each can be skipped.

| Connection | Gives Jarvis |
|---|---|
| Google | Gmail, Calendar, Drive, Docs, Sheets, Contacts |
| Apple | Reminders, Notes, iMessage |
| Obsidian | Your vault, with graph view and backlinks |
| Work files | Word, Excel, PowerPoint, PDF |
| GitHub · Vercel · Cloudflare | Code, deployments, domains |
| Higgsfield | AI images and video (uses your credits, asks first) |

Tokens and passwords never go through chat.

## Models

| Connected | Chats | Scheduled jobs |
|---|---|---|
| Claude subscription | Opus 5.5 | Sonnet 5 |
| ChatGPT/Codex subscription | GPT-6 Sol | GPT-6 Luna |
| Both | The one you choose leads; the other takes over if it's down or rate-limited | |

Setup detects what you're already signed in to and only asks about what it can't find. Ask for a
specific model for one job any time ("use GPT Astra for the pricing analysis").

## Works with

In your Jarvis folder, Claude Code, Codex and Gemini pick Jarvis up automatically. For other tools, or to
have Jarvis everywhere:

```bash
jarvis install claude-code --global   # or: codex | deepseek | hermes | openclaw | cursor | gemini | claude-desktop | all
jarvis doctor                         # what's installed where
jarvis uninstall codex                # removes only what Jarvis added
```

| Tool | Skills | Identity | Jarvis tools | Recall |
|---|---|---|---|---|
| Claude Code (app and terminal) | `.claude/skills` | `CLAUDE.md` | MCP | hook |
| Codex | `.agents/skills` | `AGENTS.md` | MCP | hook |
| Gemini CLI | `.agents/skills` | `GEMINI.md` | MCP | tool |
| Cursor, DeepSeek Harness, OpenClaw | `~/.agents/skills` | rules / `AGENTS.md` | MCP | tool |
| Hermes | skills dir | `SOUL.md` | MCP | plugin |
| Claude desktop chat | upload zips (`jarvis export-skills`) | MCP instructions | MCP | tool |

It also installs as a Claude Code plugin (`claude plugin marketplace add <this repo>` then
`claude plugin install jarvis@jarvis`). Use either the plugin or `jarvis install`, not both.

## Advanced: Hermes as an always-on home

For Telegram and desk voice today, Jarvis can live in [Hermes Agent](https://hermes-agent.nousresearch.com)
on your Mac. Telegram and voice through Claude are coming.

```bash
jarvis setup hermes           # guided, re-runnable
jarvis setup hermes --voice   # just the desk voice app
```

It installs Hermes if needed, connects your Claude or ChatGPT subscription, plugs Jarvis in, and
optionally sets up:

- **Telegram:** a DM, topics in your DM, or a group with topics (`adapters/hermes/telegram_mode.sh`).
- **The gateway** as a login service.
- **Desk voice** ([`jarvis-voice`](https://github.com/JohannsenLum/jarvis-voice)): say "Jarvis, …" or hold
  the talk key. The optional Jev key makes Mac commands instant. By default the talk key replaces Caps
  Lock; undo with `~/Documents/jarvis-voice/scripts/uninstall-capslock.sh`.

Hermes also brings its own dashboard (`hermes dashboard`: usage, sessions, cron).

## Privacy

- The vault is never shared. `life/health`, `life/finance`, `relationships/`, `journal/` and
  `frameworks/declarations/` default to local-only, and Jarvis never pastes them into other tools or
  group chats.
- Keys and tokens live in env files with mode 600 (for example `~/.hermes/.env`), never in the vault or chat.
- Content from the web, email or documents is treated as information, not instructions.

## Platform

macOS only for now (Apple Silicon). Everything runs natively on your Mac; no Docker, no server.

## Repo layout

```
core/            identity template, roles, jarvis_core (vault rules, recall, identity, frameworks)
mcp/             the Jarvis MCP server (standard-library Python)
hooks/           recall hooks
agents/          librarian, researcher, critic, creative
skills/          jarvis/ (onboarding, routines, brain, frameworks…) · packs/ (agency, employee, CEO, freelancer) · vendor/
frameworks/      168, AIOO, declarations, deal cards
adapters/hermes/ optional Hermes home: setup, recall plugin, Telegram modes
office/          the office dashboard (Node, no dependencies)
bin/             jarvis CLI, create-jarvis wizard, scheduler, helpers
knowledge/       vault template (SCHEMA.md, page templates)
.claude-plugin/  Claude Code plugin manifests
```
