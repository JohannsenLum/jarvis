---
name: health-log
description: Log health and fitness data the user mentions (sleep, weight, workouts, symptoms, meds, check-ups) into life/health or life/fitness, and summarise trends on request. Private area: follow privacy rules.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, life]
    category: jarvis
---

# Health log

## Procedure
1. Parse what was said into a dated entry. Ask one short clarifying question only if a number or unit is ambiguous.
2. Append to `life/health/log/YYYY-MM.md` or `life/fitness/log/YYYY-MM.md` as a table row:
   `| 2026-09-28 | sleep | 6.5 h | felt tired |`
3. Update `metrics.md` / `prs.md` if it's a new latest value or personal record.
4. On request, summarise trends over a period with plain numbers.

## Pitfalls
- Giving medical advice. Suggest seeing a professional for anything beyond tracking.
- Sending health data to web search or third-party tools. This area is private (see `me/onboarding.json`).
