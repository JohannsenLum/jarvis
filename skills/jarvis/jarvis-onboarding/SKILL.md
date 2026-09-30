---
name: jarvis-onboarding
description: The first-run experience for Jarvis. A guided, five-chapter conversation with tap-to-answer questions that builds the user's second brain live as they answer, sets up routines, and records skipped questions so onboarding can be resumed later. Use on first contact, or when the user says "onboard me", "finish onboarding", "set me up", or wants to add a new job, company or life area.
version: 2.0.0
metadata:
  hermes:
    tags: [jarvis, onboarding, setup]
    category: jarvis
---

# Jarvis onboarding

Onboarding is the user's first real experience of Jarvis. It should feel like meeting a sharp new
chief of staff who is already getting to work, not like filling in a form. Five short chapters, about
eight minutes, and every answer turns into something they can see.

## When to Use
- `me/onboarding.json` in the knowledge vault is missing, or its `status` is not `complete`.
- The user asks to (re)do or finish onboarding, or to add a new job, company, client list or life area.
- Resume mode: onboarding is complete but `pending` is not empty and the user agreed to finish it.

## The experience rules

**Chapters, with a progress line.** Open every chapter with one line like:

```
◆◆◇◇◇  Chapter 2 of 5 · Your world
```

(filled diamonds = chapters reached). Then one short, human sentence, then the questions.

**Tap, don't type.** Ask with your question tool (Claude Code's question tool, Hermes `clarify`). Options
go in its choices, not in the question text. Design for at most 4 questions per call and 2-4 choices per
question plus the free-text "Other" row. Recommended choice first. With no question tool, ask in plain
text with numbered options and accept free text.

**Open questions: one at a time, with a picker when you can.** Never send a numbered list of open
questions to answer in one reply. Ask each one on its own, one short line, and wait.
- If you can suggest likely answers, ask it with the question tool instead: the suggestions are the
  choices and the user types anything else in "Other". Sources for suggestions: what the installer
  saved, the existing-folders scan (client and project folder names), a connected calendar or contacts
  (frequent names), and earlier answers. Example: "Who are your current clients?" multi-select
  `Brightlabs`, `Nomi`, `Kopi Co` (from folder names), Other to add more.
- No suggestions available: ask in plain text, one question, and accept a free-text answer. Mention
  "or skip".
- Batch only choice questions (up to 4 per call). Open questions never share a message.

**Show, don't tell.** Where your question tool supports option previews (Claude Code), use them for the
choices that change how you behave. Each preview is a short sample of what that choice feels like
(see Chapter 1). No previews available: put a four-to-six-word taste in the choice label instead.

**Build live.** After each chapter, create what the answers fill straight away (pages, folders, settings)
and show it as a small growing tree, only the new lines marked `+`:

```
knowledge/
+ work/northwind-studio/clients/brightlabs/
+ relationships/people/sam.md
```

One line under it on what that unlocks ("Mention Sam or Brightlabs any time and I'll have the context.").
The user should watch their second brain appear.

**React like a person.** One specific line in response to an answer, never generic praise ("Three
retainers and a half marathon. Busy year, I'll protect your mornings."). No lectures, no filler, no
exclamation-mark enthusiasm. Use their name now and then, not every message. Match the tone they chose
from the moment they choose it.

**Skip anything, pause any time.** Say once, in the opening: *"Skip anything (tap Other, type skip) and
say 'pause' whenever you like. I'll pick up where we left off."*
- A skip ("Skip for now", "skip", "later", "not now", or a timeout) is never re-asked in this session.
  Add it to `pending` in `me/onboarding.json` (see `references/onboarding-json.md`). Nothing about a
  skipped question is guessed or invented.
- "Pause": save, say how to resume ("say *finish onboarding*"), stop.

**Save as you go.** After every chapter write `me/onboarding.json` (`status: "in_progress"`,
`current_step`), so a dropped chat loses nothing.

**Never ask for keys, tokens or passwords in chat.** Tell the user where to put them.

## Procedure

Knowledge vault: the path in your identity ("Your second brain"), or `jarvis_status`. Read `SCHEMA.md`
there first. Folder layouts per answer are in `references/templates.md`. Follow them exactly.

**Resume mode.** If `me/onboarding.json` has `status: in_progress`, continue from `current_step`
(open with "Welcome back, we were on chapter N."). If it is `complete` with `pending` items, ask only
those, in step order, removing each from `pending` once answered.

**Came from the installer?** The `npx` wizard may already have saved name, role, tone, autonomy and work
type (`user.*`, `work`, and `current_step`). Never ask those again: confirm them in one line in the
opening and continue from `current_step`.

### Opening (before Chapter 1)
Three short lines, in the chosen tone if known:
1. Who you are and what you're about to do: "I'm <assistant name>. Give me eight minutes and I'll know
   your work, your people and what matters to you, and I'll set up your mornings."
2. Everything is plain files they own, in `knowledge/`, readable in Obsidian.
3. The skip / pause rule.

### Chapter 1 · Meet (step `hello_role`)
Skip the questions already answered by the installer. Otherwise one batch:
- "What should I call you?" (open)
- "What role do you want me to play?" `Chief of Staff`, `Executive Assistant`, `Thinking Partner`,
  `Something else: coach or life manager`
- "How should I talk to you?" `Warm`, `Formal`, `Direct`, `Skip for now`
- "How much should I do without asking?" `Act and tell me`, `Ask first`, `Handle it quietly`, `Skip for now`

Previews (Claude Code), all answering the same imagined moment, *"your 3pm moved and clashes with the
school run"*:
- Role: Chief of Staff "Moved Brightlabs to 4:30 and told them. School run's clear. Prep notes are in
  the project page." · Executive Assistant "Your 3pm now clashes with the school run. Two open slots
  tomorrow: 10:00 or 14:00. Which?" · Thinking Partner "Before I move it: is this call still worth an
  hour this week?"
- Tone: Warm "Heads up, your 3pm now clashes with the school run. Want me to move it?" · Formal "Your
  15:00 meeting now conflicts with school pickup. Shall I propose a new time?" · Direct "3pm clashes
  with school run. Move it?"
- Autonomy: Act and tell "Moved it to 4:30. (One-line note, you can undo.)" · Ask first "Can I move it
  to 4:30?" · Handle quietly "(Moved. Listed in tomorrow's briefing.)"

"Something else" → one follow-up: `Coach`, `Life Manager`, `Skip for now`.
Skipped defaults: `chief-of-staff`, `warm`, `act-and-tell` (still listed in `pending`).
Apply with `jarvis_settings`. Switch to the chosen tone in your very next line.

### Chapter 2 · Your world (steps `work`, `work_details`, `life`, `people`)
Batch A (skip work if the installer asked it):
- "What does your work look like? Pick all that apply." multi-select: `Agency or studio`,
  `Employee at a company`, `Founder or CEO`, `Freelancer` (student and others via Other; map "student"
  to the student template; anything without a template goes in `me/profile.md`, no work folders)
- "Which parts of life should I help with?" multi-select: `Health`, `Fitness`, `Money`, `Home & admin`
- "Any of these too?" multi-select: `Learning`, `Creative work`, `Travel`, `Faith & reflection`

Then, only for the work types chosen, one question at a time (picker when you have suggestions):
- Agency: company name · current clients (comma-separated)
- Employee: company and role
- Founder/CEO: company name · stage (`Seed or earlier`, `Series A+`, `Bootstrapped`, `Skip for now`)
- Freelancer: current clients
- Student: where and what
Then, on its own: "Who matters most in your life? Name and relationship, e.g. Sam (partner), Mum,
Wei Ling (close friend), David (mentor)." (open; if contacts are connected, offer frequent names as a
multi-select picker first). Sort into circles (partner, family, close, mentor, network), asking
only if truly unclear. Confirm the list back in one line.

**Build live:** work folders from the templates, one page per client and per person (`_templates/`),
the tree, then: "Mention any of them and I'll bring the context."

### Chapter 3 · What matters (steps `goals`, `principles`)
- First, on its own: "What are the one to three things you most want to make happen this year?" (open)
- Then one batch of the choice questions below.
- "Which ideas do you want to decide by?" multi-select: `Eisenhower matrix`, `Dichotomy of control`,
  `Regret minimization`, `80/20 rule` (others via Other: first principles, pre-mortem, deep work…)
- "Want to try one of my frameworks after setup?" `168-hour week: budget your time`,
  `Declarations: goals as who you are`, `AIOO: plan backwards from the outcome`,
  `Deal cards: track opportunities` (Other / skip = none; add to `pending`). Deal cards suit people
  with clients or deals. Record as `framework_next`; don't run it now.

After the batch, on its own: "Any rules of your own you live by? One per line, or skip." (open)
React to the goals with one specific line (what you'll watch for, what might get in the way).
**Build live:** `me/goals/<year>.md` and `me/principles.md` as drafts (`status: draft`), chosen decision
frameworks to `me/frameworks/<slug>.md`, and a first `now.md`. Show it: "This is my short-term memory.
I read it at the start of every conversation."

### Chapter 4 · Your rhythm (steps `rhythm`, `voice`)
Batch A:
- "Which routines do you want?" multi-select: `Morning briefing`, `Weekly review`,
  `Nightly memory refresh (recommended)`, `Nightly tidy-up`
- "What should the morning briefing cover?" multi-select: `Calendar and top 3`, `Open loops and
  follow-ups`, `People to reach out to`, `Email highlights` (framework checks are added automatically
  once a framework is started)
- "When should it arrive?" `07:30`, `07:00`, `08:00`, `Skip for now`
- "Which day for your weekly review?" `Sunday`, `Friday`, `Monday`, `Skip for now`
Record the choices (they're written to `me/routines.md` in the Finale).
Show a two-line sample of tomorrow's briefing built from what you know so far (goals, people, anything
dated). It's a taste, not a real run.

Batch B, chat and voice:
- If the home runtime is Hermes: "Do you want me on Telegram too?" `Yes, I have a bot token`,
  `Yes, walk me through it`, `Already connected`, `Skip for now`. "Walk me through it": steps from
  `references/telegram.md`. Either Yes: they run `hermes gateway setup` in a terminal and paste the token
  **there**. Record `channels.telegram: "setup_pending"` and add to `pending` until connected. Once
  connected, load `jarvis-telegram` for the layout (DM topics recommended, plain DM, group with topics).
  Other homes: say Telegram through Claude is coming, and add it to `pending`.
- "Talk to me by voice at your desk?" `Yes, with Jev fast mode`, `Yes, standard mode`, `Not now`.
  Jev fast mode needs a key from console.typesafe.ai (instant Mac commands, web tasks in Chrome);
  standard mode needs none. Either way they run `jarvis setup hermes --voice` in a terminal, which asks
  for the key privately. Warn before it happens: the talk key can take over Caps Lock; they can pick
  another key, and `~/Documents/jarvis-voice/scripts/uninstall-capslock.sh` undoes it. "Not now" goes in
  `pending`.

### Chapter 5 · Connect and protect (steps `connections`, `privacy`, `existing_files`)
Batch A (load `jarvis-connections`; recommend only its eight):
- "Which of these should I connect?" multi-select: `Google: Gmail, Calendar, Drive`,
  `Apple: Reminders, Notes, iMessage`, `Obsidian: open your second brain`, `Work files: Office, PDF`
- "Any of these for building or creating?" multi-select: `GitHub`, `Vercel`, `Cloudflare`,
  `Higgsfield: AI images and video`
Connect the chosen ones one at a time with that skill's procedure. Each can be skipped; skipped or failed
ones become `connections.<id>: "pending"` and go in `pending`. Offer "set these up later" for all:
Google can take ten minutes. Mark each working connection with a real result in one line
("Connected. You've got 4 events tomorrow, first at 9:30.").

Batch B, privacy (only Health/Money if chosen in Chapter 2): for each of Health, Money, Relationships,
Journal: "Where may your <area> notes live?" `Local only`, `Encrypted backup`, `Cloud OK`,
`Skip for now`. Skipped = `local` (safest), listed in `pending`.

Then existing files: load `jarvis-import` and offer to look for client, project and work folders
(Documents, Desktop, Downloads, iCloud Drive, cloud drives). Follow its steps 1-5 (scan or use setup's
scan, show, ask, map) and record choices as `queued` in `imports`. The import itself runs after Build.

### Finale · Build and reveal (step `build`)
1. Create any pages the answers fill that don't exist yet (profile, company, clients, people,
   principles), in the places `references/templates.md` maps out. **No empty placeholder folders.**
   Use `_templates/`. Never overwrite existing files; merge. Write an empty `me/_proposals.md` with a
   one-line header.
2. Write `me/profile.md` (name, role, tone, autonomy, work summary) as a draft. Update `SCHEMA.md` →
   `## Active templates`.
3. Rewrite `now.md` from everything learned.
4. **Routines.** Write `me/routines.md`, one section per routine (on/off, time, days, what to include,
   where to deliver), for example:
   ```
   ## Morning briefing: on, 07:30, weekdays
   Include: calendar and top 3, open loops, people to reach out to
   Deliver: notification
   ## Weekly review: on, Sunday 18:00
   ## Nightly memory refresh: on, 01:30
   ## Nightly tidy-up: off
   ```
   Then schedule the routines that are on, where the user actually is, and record it in
   `rhythm.scheduled_on`:
   - **Claude desktop app** (you have `create_scheduled_task`): create one Local routine per job,
     `taskId` `jarvis-morning-briefing`, `jarvis-weekly-review`, `jarvis-consolidate`, `jarvis-lint`,
     titled "Jarvis · …", with a local-time `cronExpression`. Each prompt must stand alone: "You are
     Jarvis. Load the <skill> skill and follow it, using me/routines.md in the Jarvis vault for what to
     include." Pass `notifyOnCompletion: false` for the two nightly jobs. Tell the user they'll see them
     under Routines, that they run while the app is open (missed ones run on next launch), and suggest
     setting their model to Sonnet 5 there.
   - **Hermes home**: use the cron tool, delivering to their main chat channel.
   - **Anywhere else**: ask them to run `jarvis schedule install` in a terminal (it picks launchd with
     Claude Code or Codex, Hermes, or OpenClaw).
   Skills: `jarvis-morning-briefing`, `jarvis-weekly-review` (review day 18:00), `brain-consolidate`
   (01:30, silent), `brain-lint` (02:00, silent unless issues).
5. Set `status: "complete"` (even with pending items) and `completed_at`. Append to `log.md`:
   `## [YYYY-MM-DD] onboarding | created N pages, M pending`.
6. If `imports` are queued, start the first batch with `jarvis-import` step 6; the rest run overnight.
7. **The reveal.** Finish with:
   - `◆◆◆◆◆  Ready.` and one line in their tone.
   - The final vault tree (top two levels, with counts: "12 pages · 4 people · 3 clients").
   - A mini "who I think you are" card, three or four lines from their answers, ending with "Anything
     wrong? Tell me and I'll fix it." This is where they notice you actually listened.
   - What's scheduled and when ("First briefing: tomorrow 07:30").
   - What's pending, as one line ("Left for later: Telegram, Google").
   - Three things to try, specific to them ("Prep me for Brightlabs on Thursday", "What should I
     focus on this week?", "Remember that Mum's birthday is 12 March").
   - If they picked a framework (`framework_next`): "Want to start the 168 now? Ten minutes."
   - Mention they can open `knowledge/` in Obsidian to see everything.

## Pitfalls
- Asking more than 4 questions in one call, putting several open questions in one message, or
  re-asking what the installer already saved.
- Long messages. Every message before a question batch is one to three lines.
- Inventing details for skipped questions. Leave them out and list them in `pending`.
- Creating `work/` folders for types the user didn't pick, or empty placeholder folders.
- Writing tokens or keys anywhere in the vault.
- On a re-run, overwriting the user's edited pages. Always merge.
- Generic flattery. React to what they actually said, or say nothing.

## Verification
- `me/onboarding.json` parses as JSON and matches `references/onboarding-json.md`.
- Every chosen work type has its folder; every person has a page under `relationships/people/`.
- `me/routines.md` exists, and the routines that are on appear on the Routines page, in
  `jarvis schedule status`, or in `hermes cron list`.
- `log.md` has the onboarding entry.
