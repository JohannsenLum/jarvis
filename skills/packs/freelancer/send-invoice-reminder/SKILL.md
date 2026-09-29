---
name: send-invoice-reminder
description: Track freelance invoices in work/freelance/invoices.md and draft polite payment reminders for overdue ones. Freelancer template.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, freelancer]
    category: jarvis
---

# Invoice reminders

## Procedure
1. Read `invoices.md` (table: number, client, amount, sent, due, paid).
2. For each unpaid invoice past due, draft a short, friendly reminder in the user's voice.
3. Show the drafts; send only after a yes. Mark `reminded: YYYY-MM-DD` in the table.
