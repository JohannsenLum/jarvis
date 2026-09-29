---
name: decision-coach
description: Help the user make a decision using their own principles (me/principles.md) and chosen frameworks (me/frameworks/), then log it. Use when the user asks 'should I…', 'help me decide', 'what do you think about taking…', or weighs options.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, life]
    category: jarvis
---

# Decision coach

## Procedure
1. Restate the decision in one line and confirm the options (ask with your question tool if unclear).
2. Load `me/principles.md` and the frameworks in `me/frameworks/`. Pick the one to three that fit
   (e.g. Eisenhower for priorities, pre-mortem for risky bets, regret minimization for life choices).
3. Walk through them briefly, using facts from the vault (goals, clients, calendar, money pages if allowed).
4. Give a recommendation, the main risk, and what would change your mind. Say which principles and
   frameworks you used.
5. Offer to log it: create `work/<co>/decisions/<slug>.md` or `me/decisions/<slug>.md` (proposed) from
   `_templates/decision.md` with a `review_on` date, and schedule a cron reminder for that date.

## Pitfalls
- Deciding for the user on personal matters. Recommend; they choose.
