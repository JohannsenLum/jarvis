# Jarvis

A personal assistant you can plug into any agent harness (Claude Code, Codex, DeepSeek Harness, Hermes,
OpenClaw, Cursor, Gemini CLI, the Claude desktop app) and talk to from Telegram or by voice. Wherever you
use it, it's the same Jarvis: one identity, one private markdown vault, one set of skills and memory.

```
 Claude Code   Codex   DeepSeek   OpenClaw   Cursor   Gemini   Claude app        Telegram · voice · cron
      │          │        │          │         │        │          │                     │
      └──────────┴────────┴──── Jarvis MCP server + skills + identity ───────── Hermes (home runtime)
                                             │
                                  knowledge/ vault (Obsidian)
```

**Portable core (works in every harness)**
- `core/AGENTS.md.tmpl` + `core/roles/`: identity, rendered with your role/tone/autonomy by `jarvis render`
- `skills/`: Agent Skills (`SKILL.md`), linked into each harness's skills folder
- `mcp/jarvis_mcp.py`: the Jarvis MCP server (vault search/read/write with the rules enforced, now.md,
  recall, proposals, onboarding, settings, status). Standard-library Python, no install
- `hooks/recall.py`: per-message recall for harnesses with Claude-style hooks (Claude Code, Codex)
- `.claude-plugin/` + `.mcp.json` + `hooks/hooks.json`: installs as a plugin in Claude Code (and Codex/OpenClaw)

**Home runtime (always-on):** Hermes by default: Telegram, scheduled routines, the voice app's API.
Routines can instead run on this Mac through Claude Code or Codex (launchd), or on OpenClaw.

## Plug Jarvis into a harness

```bash
jarvis install claude-code      # or: codex | deepseek | hermes | openclaw | cursor | gemini | claude-desktop | all
jarvis doctor                   # what's installed where
jarvis render                   # re-apply identity after changing role/tone/autonomy (tools do this for you)
jarvis uninstall codex          # removes only what Jarvis added
```

| Harness | Skills | Identity | Tools | Recall |
|---|---|---|---|---|
| Claude Code | `~/.claude/skills` | `@~/.jarvis/AGENTS.md` in `~/.claude/CLAUDE.md` | MCP (`claude mcp add`) | hook |
| Codex | `~/.agents/skills` | `~/.codex/AGENTS.md` | MCP | hook |
| DeepSeek Harness | `~/.agents/skills` | `~/.dsh/AGENTS.md` | MCP (cordis patch) | `jarvis_recall` tool |
| Hermes | repo `skills/` | `~/.hermes/SOUL.md` | MCP | plugin |
| OpenClaw | `~/.agents/skills` | workspace `AGENTS.md` | MCP | `jarvis_recall` tool |
| Cursor / Gemini CLI | `~/.agents/skills` | User Rules / `~/.gemini/GEMINI.md` | MCP | tool |
| Claude desktop app | upload zips (`jarvis export-skills`) | via the MCP server's instructions | MCP | tool |

**As a plugin** (Claude Code; Codex and OpenClaw read the same format):
```bash
claude plugin marketplace add ~/Documents/jarvis
claude plugin install jarvis@jarvis
```
Use either the plugin or `jarvis install claude-code` for Claude Code, not both.

**Scheduled routines elsewhere:** `jarvis schedule install --runner hermes | launchd-claude |
launchd-codex | openclaw | claude-routines`. Local runners keep the vault on your Mac; Claude cloud
routines need it in a private GitHub repo (the command explains).

## Quick start (MacBook, Apple Silicon)

```bash
./setup.sh
```

The script is interactive and safe to re-run. It:

1. Installs Hermes if missing (official installer; or use the [Hermes desktop app](https://hermes-agent.nousresearch.com/desktop)).
2. Connects a model: **Claude subscription** (experimental plugin via the `claude` CLI), **ChatGPT/Codex
   subscription**, Nous Portal, or an API key.
3. Installs the `jarvis` command and plugs Jarvis into Hermes (identity, MCP tools, recall), then offers to plug it into every other AI tool it finds (Claude Code, Codex, DeepSeek Harness, OpenClaw, Cursor, Gemini, Claude app).
4. Enables the local API server (127.0.0.1:8642) for the voice client.
5. Connects Telegram: QR code, existing token, or a walkthrough. Skippable.
6. Installs the gateway as a login service so briefings and Telegram keep running.
7. Offers Telegram as one DM, topics in your DM (Inbox, Work, Life, Briefings, General), or a group
   with topics, or skip for later (`hermes/telegram_mode.sh`).
8. Offers to scan Documents, Desktop, Downloads and cloud drives for client and project folders (names
   only) so onboarding can bring them in (`jarvis-import`). Originals are never moved or changed.
9. Sets up desk voice: fetches the [`jarvis-voice`](https://github.com/JohannsenLum/jarvis-voice) repo listed in `deps.env` if it
   isn't next to this folder, then installs it. Jev key optional (blank = standard mode).

Then say hi (`hermes --tui`, the Hermes app, or your Telegram bot). Jarvis runs onboarding by itself.

## Onboarding

`skills/jarvis/jarvis-onboarding` interviews you step by step with tap-to-answer questions (Telegram
shows buttons; the terminal shows a numbered menu). Every question can be skipped. Skipped questions are
saved to `knowledge/me/onboarding.json` → `pending`, and Jarvis offers to finish them later, or you say
"finish onboarding". Your answers pick the folder layout: agency, employee, founder/CEO, freelancer,
student, plus the life areas you choose.

## Roles

Jarvis has one identity (rendered from `core/AGENTS.md.tmpl` into every harness) with three settings chosen in onboarding:

| Setting | Options |
|---|---|
| Role (`core/roles/`) | **Chief of Staff** (default): runs your priorities, preps you, pushes back · **Executive Assistant**: calendar, admin, logistics · **Thinking Partner**: strategy and decisions, challenges you · **Coach**: goals, habits, accountability · **Life Manager**: family, home, money, personal time |
| Tone | warm · formal · direct |
| Autonomy | ask-first · act-and-tell (default) · handle-quietly. Sending, spending, deleting and editing `me/` always ask. |

Borrow a role for one conversation ("thinking partner mode: should I raise prices?") or change it for
good ("from now on, be my coach"). Settings live in `me/onboarding.json`; the `jarvis_settings` tool
updates them and re-renders the identity in every connected harness.

## Talking at your desk

```bash
jarvis-voice              # say "Jarvis, …", or tap/hold Caps Lock and speak
jarvis-voice --hold       # Caps Lock only
jarvis-voice --open-mic   # start with the open mic on
jarvis-voice --task "find flights to Tokyo on Google Flights"   # multi-step web task in Chrome
```

Say "Jarvis, open mic" / "Jarvis, close mic" to toggle an open mic without restarting.

| Mode | Needs | Mac commands ("open Slack", "volume down") | Everything else |
|---|---|---|---|
| Jev fast | `TYPESAFE_API_KEY` in `~/.jarvis-voice/.env` | Instant, via Jev (~0.25–0.65s); multi-step web tasks run in Chrome via jev-ultrafast | Sent to Jarvis |
| Standard | nothing | Sent to Jarvis (it has computer-use tools) | Sent to Jarvis |

Unnamed background speech can only trigger quick Mac actions (Jev mode). It is never sent to Jarvis
unless you say its name, hold the key, or turn on the open mic.

## Layout

```
core/                 identity template, roles, jarvis_core (vault rules, recall, identity rendering)
mcp/jarvis_mcp.py     Jarvis MCP server (every harness)
hooks/                recall hook + plugin hooks.json
skills/jarvis/        onboarding, settings, connections, telegram, import, models, brain, routines…
skills/packs/         agency · employee · ceo · freelancer skill packs
skills/vendor/        third-party skills (fireworks-tech-graph)
skills/learned/       skills Jarvis writes for itself (git-ignored in the template)
bin/jarvis            the CLI (install, doctor, render, schedule, export-skills)
bin/fireworks         diagram launcher (PNG/GIF)   bin/scan_folders.py  existing-files scanner
hermes/               Hermes-only extras: recall plugin, Telegram modes
knowledge/            your vault (Obsidian)
.claude-plugin/       plugin + marketplace manifests
setup.sh              guided setup (Hermes home + other harnesses)
```

## Connections

Jarvis recommends eight, set up one at a time by the `jarvis-connections` skill (during onboarding,
or say "connect my Google" any time). Each can be skipped and finished later.

| Connection | Gives Jarvis | Setup |
|---|---|---|
| Google | Gmail, Calendar, Drive, Docs, Sheets, Contacts | Built-in skill, one-time Google OAuth (~10 min) |
| Apple | Reminders, Notes, iMessage, Find My | Built-in skills + small Homebrew tools, macOS permissions |
| Obsidian | Opens the vault | Built-in skill, pointed at `knowledge/` by setup |
| Work files | Word, Excel, PowerPoint, PDF | Built-in, no login |
| GitHub | Repos, issues, PRs | Built-in skill via `gh auth login` |
| Vercel | Deployments, logs, projects | Official hosted MCP, browser approval |
| Cloudflare | DNS, Workers, domains | Official hosted MCP, browser approval |
| Higgsfield | AI images and video, upscaling, voice, presets | Official hosted MCP by URL, Higgsfield login; uses your credits, asks before generating |

Sending, posting, deploying, DNS changes, spending credits and deleting always ask first. Hermes' built-in `llm-wiki`
skill is turned off so the vault stays the one brain.

## How the brain grows

- **During the day:** Jarvis files things you ask it to save (`brain-ingest`), and the `jarvis-recall`
  plugin adds `now.md` plus short notes on any person, client or project you mention to each message
  (local file reads, nothing added when nothing matches).
- **01:30 nightly:** `brain-consolidate` reads the day's conversations and files facts, commitments and
  decisions, queues suggested changes to `me/` in `me/_proposals.md`, saves working preferences to
  Hermes memory, and rewrites `now.md`.
- **02:00 nightly:** `brain-lint` tidies: inbox, broken links, duplicates, stale pages.
- **Always:** Hermes' own learning loop writes and refines skills for recurring tasks.

**Models:** connect Claude, ChatGPT/Codex, or both. Normal conversations use the strong model and
everything scheduled (briefing, review, nightly consolidation, tidy-up, imports) uses the lighter one:

| Connected | Chats | Scheduled jobs | Backup |
|---|---|---|---|
| Claude subscription | Opus 5.5 | Sonnet 5 | – |
| ChatGPT/Codex subscription | GPT-6 Sol | GPT-6 Luna | – |
| Both (Claude leads, recommended) | Opus 5.5 | Sonnet 5 | Codex GPT-6 Sol takes over if Claude is down or rate-limited |
| Both (Codex leads) | GPT-6 Sol | GPT-6 Luna | Claude Opus 5.5 |

Setup first detects what's already signed in (Claude Code login, Codex login, Nous, API keys) and
only asks about what it can't find.

**Using a specific model for one job:** say "use GPT Astra for the pricing analysis" or "use Opus
for this proposal". The `jarvis-models` skill puts the job on Hermes' task board pinned to that model;
the gateway runs it and the result comes back in the same chat. Coding jobs can go to the Codex or
Claude Code agents instead. To switch the whole conversation, type `/model <model>`; to change the
default, `hermes model`.

## Dashboards

- **Hermes dashboard** (`hermes dashboard`): token usage (Analytics), sessions, cron jobs, skills, logs.
- **Hermes desktop app**: live sub-agents, Memory Graph, HUD mode, voice.
- **Obsidian**: open `knowledge/` as a vault for the brain, graph view and backlinks.
- Planned: a Jarvis dashboard plugin (work pipeline, goals, people overdue) using Hermes' dashboard plugin SDK.

## Platform

MacBook only for now (Apple Silicon, macOS). Everything runs natively on the Mac: Hermes, the gateway,
the voice client and the vault. Jarvis is reachable on Telegram while the Mac is awake; scheduled jobs
that fall while it sleeps run when it wakes. Docker and server hosting are out of scope for this version.

## Privacy

`life/health`, `life/finance`, `relationships/` and `journal/` default to local-only. Keys and tokens
live in `~/.hermes/.env` and `~/.jarvis-voice/.env` (mode 600), never in the vault or in chat. Keep `knowledge/`
in its own private repo if you want history.
