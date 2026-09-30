---
name: jarvis-frameworks
description: Run one of Jarvis's frameworks with the user (the 168-hour week budget, AIOO, declarations, deal cards) and file the results in their vault. Use when the user says "let's do the 168", "budget my week", "run AIOO on this", "write my declarations", "make a deal card", "is this a good deal", asks what frameworks exist, or when onboarding or a review picks a framework.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, frameworks, planning, goals]
    category: jarvis
---

# Jarvis frameworks

The frameworks are Jarvis's (`<Jarvis>/frameworks/`, replaced on update, never edited). The results are
the user's, in the vault at `frameworks/<id>/`. Updates never touch results.

## When to Use
- The user names a framework or asks what's available.
- A situation clearly fits one (see each framework's "When to apply"): offer it in one line, don't start
  it uninvited. Examples: a new yearly goal → declarations or AIOO; "I'm always busy but nothing moves"
  → AIOO; "I never see my family" → 168; a meeting with a potential client → deal card.
- The weekly review, if `frameworks/168/budget.md` exists (run the weekly audit).

## Procedure
1. **List or load.** `jarvis_frameworks` with no name lists them (and whether the user has started each).
   With a name it returns the full framework, the result files it writes and what already exists.
   No MCP? Read `<Jarvis>/frameworks/<id>.md` and `catalog.json` directly.
2. **Read what exists first.** If results exist, read them (`jarvis_read`) and continue from there.
   Don't start over unless the user asks.
3. **Follow the framework's "How your AI uses this" section.** It is the method. Ask one thing at a time
   with your tool's question feature; allow "Skip for now" and note skipped parts in `pending`
   (`jarvis_onboarding` patch) so they can be finished later.
4. **File the results** with `jarvis_write` at the paths `jarvis_frameworks` gave, following the user's
   autonomy setting. Frontmatter on every result page:
   ```yaml
   type: framework-result
   framework: 168
   framework_version: 2026-09-30
   updated: 2026-09-30
   ```
   Link results to the pages they're about (`[[relationships/people/sam]]`, `[[me/goals/2026]]`).
5. **Tell the user in one line** what you saved and when you'll come back to it (the cadence). If it
   has a cadence the routines don't cover yet, offer to add it to the weekly review or a reminder.

## Per framework
- **168:** Start with `map.md` (about three weeks of actuals) unless the user already knows their week.
  Then `budget.md`: fund sleep, health, faith, partner, family and key people before work; split work
  into its lines. Record the current season in `budget.md`. Weekly audits go in `weeks/YYYY-Www.md`.
- **AIOO:** One page per outcome (`frameworks/aioo/<outcome-slug>.md`) with the backwards chain.
  Missing inputs become open loops in `now.md`. Stalls: check purpose first, then inputs, then actions.
- **Declarations:** The user's own words. Draft together, then write `declarations.md` only after they
  approve the wording. Private: never quote it in group chats or paste it into other tools. Goals in
  `me/goals/` stay as they are; link each declaration to the goal it anchors if there is one.
- **Deal cards:** The person's page in `relationships/people/<name>.md` stays the one page about them.
  The card (`cards/<person>--<deal>.md`) holds the opportunity and links to the person; add a
  `## Deals` line on the person page linking back. Write `filter.md` with the user before judging deals;
  until it exists, use the framework's example filter and say so.

## Pitfalls
- Never edit files in `<Jarvis>/frameworks/`. Adaptations go in the result pages or in `me/` (by proposal).
- Don't turn every conversation into a framework. Offer once; respect "no".
- Results can contain private material (family time, money, deals). Follow the privacy rules.

## Verification
- `jarvis_frameworks` shows the framework as `started: true`.
- Each result page has `framework` and `framework_version` in its frontmatter, and there is a line in `log.md`.
