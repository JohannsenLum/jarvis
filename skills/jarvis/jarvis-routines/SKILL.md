---
name: jarvis-routines
description: Change Jarvis's routines after onboarding: turn the morning briefing, weekly review, nightly memory refresh or nightly tidy-up on or off, change their time or days, or change what the briefing covers. Use when the user says "move my briefing to 8", "no briefing at weekends", "stop the weekly review", "add email highlights to my briefing", "what routines do I have?", or "did my briefing run?".
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, routines, schedule]
    category: jarvis
---

# Jarvis routines

`me/routines.md` in the vault is the source of truth. One section per routine:

```
## Morning briefing: on, 07:30, weekdays
Include: calendar and top 3, open loops, people to reach out to
Skip: news
Deliver: notification
## Weekly review: on, Sunday 18:00
## Nightly memory refresh: on, 01:30
## Nightly tidy-up: off
```

Times like `07:30`, `7:30am`, `6pm`. Days: `every day`, `weekdays`, `weekends`, `Sunday`, `Mon, Wed, Fri`.
The four routines are morning briefing, weekly review, nightly memory refresh and nightly tidy-up.

## Procedure
1. Read `me/routines.md` with `jarvis_read`. If it doesn't exist, start from the example above, using
   `me/onboarding.json` → `rhythm` for anything the user already chose.
2. Make the change the user asked for, and only that. Save with `jarvis_write` (`mode: replace`).
   Confirm in one line ("Briefing moves to 08:00 on weekdays.").
3. Apply it where the routines actually run (`jarvis_status` → `home_runtime`, `me/onboarding.json` →
   `rhythm.scheduled_on`):
   - **Claude desktop app** (you have `update_scheduled_task`): `list_scheduled_tasks`, then update the
     `jarvis-…` task's `cronExpression` (local time) or set `enabled: false` / `true`.
   - **launchd** (Claude Code in the terminal, or Codex): ask the user to run `jarvis schedule sync`
     in a terminal. It installs what's on and removes what's off. You can't run it yourself.
   - **Hermes**: use the cron tool to edit the `jarvis-…` job.
   Content changes (Include / Skip) need no rescheduling: the routine reads `me/routines.md` each run.
4. "Did it run?": `jarvis schedule status` (terminal) shows each routine's last run and whether it failed;
   the office dashboard's Ops view shows it too.

## Pitfalls
- Don't add routines that don't exist yet (a "monthly money check" isn't schedulable yet): say so and
  offer to add it to the weekly review instead.
- A routine only runs while the Mac is awake (and, for desktop Local routines, while the Claude app is
  open). A missed run happens once when it wakes.
