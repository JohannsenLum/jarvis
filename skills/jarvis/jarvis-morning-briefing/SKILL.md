---
name: jarvis-morning-briefing
description: Daily morning briefing: today's calendar, top 3 priorities checked against the user's goals, follow-ups due, people to reach out to, and anything Jarvis flagged overnight. Runs on cron at the user's briefing time, or when asked 'what's on today'.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, routine]
    category: jarvis
---

# Morning briefing

## Procedure
1. Read `now.md`, `me/goals/<year>.md`, `me/profile.md`, yesterday's `journal/daily/` page if any, and
   last night's `consolidate` line in `log.md`.
2. Gather today: calendar (if a calendar tool is connected), tasks and due dates across `work/**`
   (`due:` and unchecked `- [ ]` items), `relationships/events.md` (birthdays in the next 7 days),
   people overdue per `relationships/circles.md`, and last night's lint notes.
3. Pick **three priorities** for today. Prefer items tied to a goal; say which goal.
4. Write `journal/daily/YYYY-MM-DD.md` (type: review, status: draft) with the full briefing.
5. Send a short message in your configured tone and role (a Chief of Staff leads with priorities and
   conflicts, an Executive Assistant with schedule and logistics, a Coach with one habit or goal nudge):
   - Greeting + one-line shape of the day
   - Top 3 (one line each)
   - Heads-ups: birthdays, deadlines, someone to message
   - One line on overnight consolidation, and how many suggestions wait in `me/_proposals.md` (if any)
   - "Full briefing: journal/daily/YYYY-MM-DD.md"
   Keep it under 120 words.

## Pitfalls
- Listing everything. Three priorities, max five heads-ups.
- Reading private areas into a channel the privacy rules don't allow.
