---
name: log-decision
description: Record a company decision with context, options, the choice and a review date, in work/<company>/decisions/. CEO template; also used by decision-coach.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, ceo]
    category: jarvis
---

# Log decision

## Procedure
1. Create `decisions/YYYY-MM-DD-<slug>.md` from `_templates/decision.md`.
2. Fill context, options considered, the decision and why, owner, `review_on` (default +90 days).
3. Schedule a cron reminder on `review_on` to revisit it. Log it.
