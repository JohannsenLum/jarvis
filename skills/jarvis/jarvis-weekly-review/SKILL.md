---
name: jarvis-weekly-review
description: Weekly review: what happened, progress against goals, relationships check, lessons, and the top 3 for next week. Runs on cron on the user's review day, or when asked for a weekly review.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, routine]
    category: jarvis
---

# Weekly review

## Procedure
1. Read this week's `journal/daily/` pages, `log.md` entries for the week, and `me/goals/<year>.md`.
2. Draft `journal/weekly/YYYY-Www.md` from `_templates/review.md`:
   - What happened (5–8 bullets, linked to pages)
   - Goals check table: each goal, what moved, on track yes/no
   - People: who they saw or talked to; who is overdue
   - Wins → offer to add to `wins.md` if an employee template is active
   - Suggested top 3 for next week
2b. If `frameworks/168/budget.md` exists, run the 168 weekly audit (`jarvis-frameworks`): budget vs
   this week's calendar, into `frameworks/168/weeks/YYYY-Www.md`, and put the two biggest gaps in the review.
   If `frameworks/declarations/declarations.md` exists and a review is due, note which declarations moved.
3. Send the user a short summary and ask two reflection questions with your question tool
   (open-ended): "What went well this week?" and "What would you change next week?"
   Add their answers under `## Reflection`. If they skip, leave the section empty.
4. Append to `log.md`.

## Pitfalls
- Grading the user. Report, suggest, and ask; don't lecture.
