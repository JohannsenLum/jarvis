---
name: weekly-client-report
description: Draft a weekly status report per active client from project pages, meetings and log entries. Agency template.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, agency]
    category: jarvis
---

# Weekly client report

## Procedure
1. For each client with `status: active`, read its projects, meetings and this week's `log.md` lines.
2. Draft `clients/<slug>/reports/YYYY-Www.md`: done this week, next week, blockers, decisions needed.
3. Send the user a one-line summary per client with the file paths. Never email the client without a yes.
