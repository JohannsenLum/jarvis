# Vault templates

Paths are relative to the knowledge vault. `<slug>` = lowercase, hyphenated name ("Kopi Co" → `kopi-co`).
This is a map of **where things go**, not a list to create up front. Create a page only when there is
something to put in it (an answer from onboarding, an imported file, a fact from a conversation), and
create its folder at that moment. Never create empty placeholder folders. Pages use the matching file
in `_templates/`.

## Always

```
me/profile.md              (_templates/profile.md)
me/values.md
me/principles.md
me/goals/<year>.md         (_templates/goal.md)
me/frameworks/<slug>.md    one per chosen framework (_templates/framework.md)
me/onboarding.json
relationships/circles.md   circles and check-in cadence (below)
relationships/events.md    birthdays, anniversaries
relationships/people/<slug>.md   one per person (_templates/person.md)
journal/daily/  journal/weekly/  journal/quarterly/
```

Circle cadence for `circles.md`: partner daily · family weekly · close friends every 2 weeks ·
mentors monthly · network quarterly.

## Work templates

Each company folder and each client folder is a **space** (see SCHEMA.md → Spaces): create it with
`jarvis_space` (action `create`, kind `company` or `client`, name) before writing its pages. That adds
`SPACE.md`, `overview.md`, `raw/` and `log.md`; the index keeps itself up to date. Client pages,
contacts, meetings and that client's sources all go inside its space.

### agency → `work/<agency-slug>/`
```
clients/<client-slug>/overview.md     (_templates/client.md)  one per client
clients/<client-slug>/projects/
clients/<client-slug>/meetings/
pipeline/leads/  pipeline/proposals/
sops/  team/
services.md  pricing.md
```
Skills: `write-proposal`, `weekly-client-report`, `client-onboarding`.

### employee → `work/<company-slug>/`
```
role.md          responsibilities, manager ([[person]]), OKRs
projects/  meetings/  one-on-ones/  docs/
wins.md          brag doc (_templates/wins.md)
career.md        growth goals, feedback received
```
Skills: `update-brag-doc`, `prep-1on1`.

### ceo → `work/<company-slug>/`
```
strategy/vision.md  strategy/annual-plan.md  strategy/okrs/
metrics/                 weekly numbers
decisions/               one page per decision (_templates/decision.md)
board-investors/meetings/  board-investors/updates/  board-investors/fundraising/
team/org.md  team/hiring/  team/one-on-ones/
customers/  product/  ops/  finance/
```
Skills: `investor-update`, `log-decision`.

### freelancer → `work/freelance/`
```
clients/<client-slug>/overview.md    (_templates/client.md)
invoices.md  rates.md  portfolio.md
```
Skills: `write-proposal`, `send-invoice-reminder`.

### student → `work/<school-slug>/`
```
courses/  assignments/  exams.md  notes/
```

## Life templates → `life/<area>/`

| Area (answer) | Folder | Pages |
|---|---|---|
| Health | `life/health/` | `metrics.md`, `routines.md`, `conditions/`, `log/` |
| Fitness | `life/fitness/` | `program.md`, `prs.md`, `log/` |
| Money | `life/finance/` | `overview.md`, `budget.md`, `investments.md` (never account numbers or passwords) |
| Home & admin | `life/home/` | `subscriptions.md`, `warranties.md`, `admin.md` |
| Learning | `life/learning/` | `books/`, `courses/`, `skills.md` |
| Creative work | `life/creative/` | `projects/`, `ideas.md` |
| Travel | `life/travel/` | `trips/`, `wishlist.md` |
| Faith & reflection | `life/reflection/` | `practice.md`, `gratitude.md` |

Skills: Health/Fitness → `health-log`. People → `relationship-checkin`. Frameworks or principles → `decision-coach`.

## Framework pages

| Choice | Slug | One-line summary for the page |
|---|---|---|
| Eisenhower matrix | `eisenhower` | Sort by urgent × important. Do, schedule, delegate, drop. |
| Dichotomy of control | `dichotomy-of-control` | Act on what you control; accept what you don't. |
| Regret minimization | `regret-minimization` | Pick what your 80-year-old self would be glad you did. |
| 80/20 rule | `pareto` | Find the 20% of effort that drives 80% of the result. |
| First principles | `first-principles` | Break it down to what's actually true, then rebuild. |
| Pre-mortem | `pre-mortem` | Imagine it failed; list why; fix those first. |
| Deep work | `deep-work` | Protect long, uninterrupted blocks for hard things. |
| 1% better | `one-percent` | Small habits compound; make the next step tiny. |

Each framework page: summary, when to use it, the questions to ask, a worked example relevant to the
user's own work.
