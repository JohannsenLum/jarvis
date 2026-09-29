---
name: relationship-checkin
description: Keep the user close to the people who matter: find who is overdue for contact per their circle cadence, upcoming birthdays and events, and suggest a specific, personal message or plan. Use when asked 'who should I reach out to', from the weekly review, or from lint.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, life]
    category: jarvis
---

# Relationship check-in

## Procedure
1. Read `relationships/circles.md` for cadence and every page in `relationships/people/`.
2. Overdue = today − `last_contact` > circle cadence. Upcoming = birthdays/events in the next 14 days.
3. For each (max 3), suggest one concrete action drawn from their page ("Ask Wei Ling how the new
   job's going; she started 2026-09-01").
4. Offer to draft the message. **Never send it without a yes.**
5. When the user says they've been in touch, update `last_contact` and add a line under
   `## Recent conversations`.

## Pitfalls
- Generic suggestions. Use something specific from their page, or ask the user for one detail to remember.
