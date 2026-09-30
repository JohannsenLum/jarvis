# Deal Cards — the universal opportunity record

> Every live opportunity gets a card: context + BANT + next step — attached to a person, filtered by your season's rules, farmed from every conversation.

## What it is

A deal card is the record you attach to a relationship whenever a live opportunity exists — a sale, a partnership, a hire, a joint venture. It is separate from the person card (the FORM+HD relationship profile): one relationship can carry many deal cards. The card holds the context of the opportunity plus the four classic qualifying factors (BANT), and it is deliberately universal — recruiting someone into your ecosystem is a deal card just as much as selling to them. Together, all your deal cards form a floating, live database of opportunities that appreciates whether or not any single deal closes.

## The framework

### 1. The card — BANT plus follow-up state

| Field | What it captures |
|---|---|
| **Context** | What the opportunity actually is, in plain words |
| **Budget** | What money is available or needed |
| **Authority** | Who can make the decision |
| **Needs** | What they need — the problem the deal solves |
| **Timeline** | When — the timing that makes it live |
| **Last follow-up** | When you last touched this opportunity |
| **Next step** | The concrete action that advances it |
| **Key dates** | Opportunity-specific dates only (e.g., a decision deadline or renewal date) |

Rules of the record:
- **One person, many cards.** Person cards and deal cards are separate, linked objects. The relationship persists; opportunities come and go on top of it.
- **Person data lives on the person card.** Birthdays, business anniversaries, and catch-up cadence belong to the relationship, not the opportunity — they live on the person card (see the card template in `relationships.md`, which carries an Important dates line). The deal card keeps only the dates the opportunity itself owns, such as a decision deadline or renewal date.
- **BANT is universal.** Hiring someone: what salary budget, who decides, what need, what timeline. Partnership, investment, sale — same four factors every time.

### 2. Farming — every conversation feeds the database

After every meaningful conversation, farm what you learned into the system: FORM+HD updates onto the person card, BANT updates onto the deal card. There is no special interface moment — logging the conversation *is* the data entry. The payoff: BANT captured for one opportunity is reusable for any other opportunity, so the database becomes a floating, live asset independent of whether this particular deal closes.

### 3. Deal hygiene — the mentor's example filter (from a liquidity-constrained season)

The real rule: your deal filter is a function of your current constraints, re-derived each season (see §4). The bullets below are not universal law — they are the mentor's own filter, derived for a liquidity-constrained season, kept here as a worked example of what a compiled filter looks like:

- **Cash-first commitment, then equity upside.** A deal should pay something now, with upside layered on top.
- **Never pure equity.** Equity alone is lottery tickets; cash is oxygen. Do not take deals that pay only in paper.
- **Prioritize cash-flowing opportunities** while liquidity is your constraint.
- **Productize recurring services into retainers** rather than reselling hours.

### 4. Constraints as explicit deal filters

Do not evaluate opportunities case-by-case with fresh emotion each time. Pre-compile your rules:

1. Name your current season's binding constraint (e.g., liquidity, time, track record).
2. Write the constraint as a one-to-three-sentence deal filter (Jeremy's own, from a liquidity-constrained season: cash-flowing opportunities; cash-first commitment with equity upside; never pure equity).
3. Run every incoming opportunity through the four-question gate:
   - **Should I take it or not?**
   - **If I take it, what is the structure?**
   - **What is the compensation?**
   - **Who should I do it with?** (answered from the Rolodex — the deal database and the relationship database are wired together)
4. Re-derive the filter whenever your season changes. The filter is a function of your current constraints, not a permanent creed.

A filter without real personal context is worthless — the rule works only because it was derived from the true situation ("otherwise you're just listening to a mad AI").

## When to apply

- Any conversation surfaces a live opportunity — sale, partnership, hire, collaboration, investment.
- You're about to invest serious hours in a "maybe" — qualify with BANT first.
- A new offer lands and you feel excitement — that's the trigger for the filter, not for a decision.
- Your circumstances shift (liquidity, time, season) — rewrite the deal filter before the next offer arrives.
- Reviewing your pipeline: stale cards (no next step, no timeline) need to be advanced or reclassified.

## How your AI uses this

1. **Create cards from conversation.** When the user recounts any interaction that contains an opportunity, propose a deal card: draft the context and fill in whatever Budget / Authority / Needs / Timeline is known; ask targeted questions for the missing factors rather than leaving them blank silently.
2. **Farm every log.** Whenever the user logs a meeting or conversation, extract FORM+HD updates to the person card and BANT updates to any related deal cards — treat every conversation as data entry into the living database.
3. **Enforce the deal filter before enthusiasm.** Hold the user's written filter (their current season's constraints as rules) and run every new opportunity through the four questions — take it? structure? compensation? with whom? — before discussing upside. Flag zero-cash deals against the user's own declared filter; only if the user has not yet written a filter, fall back to the example filter in §3 and prompt them to derive their own from their actual constraints.
4. **Qualify ruthlessly.** If a card has no identified authority or no timeline, tell the user it is currently a relationship, not a deal — keep nurturing the person, stop budgeting deal-hours to it.
5. **Answer "with whom" from the Rolodex.** When structuring a deal, search the user's relationship database for who could fill the gaps (capital, skills, distribution) and suggest candidates.
6. **Prompt filter reviews.** When the user reports a material change in their situation, ask whether the deal filter still matches the season, and help rewrite it.

## Source

**07/07 Lesson with Jeremy** — Part 1 ~L1643–1663 (deal cards and the four BANT factors, their universality), ~L2039–2095 (deal hygiene, the four-question opportunity gate, the context warning), Part 2 ~L2801–2805 (farming FORM+HD and BANT into a floating, live database).

> "I set up another called deal card。So for a relationship, you can have many deal card... Then what is the budget? Authority, who can make the decision? What's the needs? And then timeline。So these are the four key factors... So it is universal 的" (Part 1, ~L1643–1663)

> "I need to take cash flowing opportunities。And down the line, my next deal forward, I should have cash-first commitment, and then after that, equity upside。Should not take just pure equity deals" (Part 1, ~L2039–2043)
