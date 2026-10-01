# Vault schema

This folder is the user's second brain. Jarvis maintains most of it; the user reads and edits it in
Obsidian. Based on Andrej Karpathy's "LLM wiki" pattern: sources go in, the wiki compounds, bookkeeping
is Jarvis's job.

## Layers

| Folder | Holds | Who writes |
|---|---|---|
| `inbox/` | Anything dropped in, unsorted | Anyone. Jarvis files it during ingest. |
| `raw/` | Original sources (articles, PDFs, transcripts), filed as `raw/YYYY/MM/<slug>.<ext>` | Jarvis on ingest. **Never edited afterwards.** |
| `me/` | Profile, values, principles, goals, frameworks, `onboarding.json` | **The user.** Jarvis proposes changes in `me/_proposals.md` and writes only after a yes. `onboarding.json` is maintained by the onboarding skill. |
| `life/` | Health, money, home, learning… one folder per active area | Jarvis |
| `relationships/` | `people/` (one page per person), `circles.md`, `events.md` | Jarvis |
| `work/` | One folder per job or company, laid out by its template | Jarvis |
| `frameworks/` | Results of Jarvis's frameworks, one folder each: `168/`, `aioo/`, `declarations/`, `deal-cards/`. The frameworks themselves live in Jarvis and are never copied here | Jarvis, with the user. `declarations/` is written only in the user's words, after a yes |
| `journal/` | `daily/`, `weekly/`, `quarterly/` reviews | Jarvis drafts, the user reflects |
| `_templates/` | Page templates | The user |
| `now.md` | Short-term memory: focus this week, open loops, next 7 days. Shown to Jarvis at the start of every conversation | Jarvis, rewritten nightly by `brain-consolidate` |
| `index.md` | Catalog of every page, grouped by folder, one line each | Jarvis, on every change |
| `log.md` | Append-only history of changes | Jarvis, on every change |

## Page rules
0. **Folders appear when needed.** Templates describe where things go; a folder is created the first
   time something goes in it. No empty placeholder folders.
1. **One page per thing.** A person, client, project, decision or goal has exactly one page.
   Everything else links to it with `[[wikilinks]]`. Never copy a person's details into a client page.
2. **Frontmatter on every page** (see `_templates/`). Minimum:
   ```yaml
   type: person | client | project | decision | goal | note | area | review | framework | framework-result
   status: active | draft | done | archived
   updated: YYYY-MM-DD
   sources: [raw/2026/09/brightlabs-brief.pdf]   # where the facts came from, if anywhere
   ```
3. **Cite sources.** A claim that came from a document names it in `sources` or inline `(see [[...]])`.
   Claims with no source and no user statement behind them get flagged by lint.
4. **Dates are absolute** (`2026-09-28`), never "last week".
5. **Filenames** are lowercase slugs: `relationships/people/wei-ling.md`.
6. **No secrets.** No passwords, API keys, card or account numbers anywhere in the vault.

## Spaces: one knowledge base per company and client
Every company folder (`work/<company>/`) and every client folder (`work/<company>/clients/<client>/`,
`work/freelance/clients/<client>/`) is a **space**: a self-contained knowledge base with its own
- `SPACE.md`: what it is (kind, name, sharing), plus its rules;
- `overview.md` and pages in `contacts/`, `projects/`, `meetings/`, `decisions/`, `deliverables/`…;
- `raw/`: this client's original sources (briefs, contracts, transcripts), write-once;
- `log.md`: every change inside it (append-only, written by Jarvis);
- `index.md`: generated from its pages on every change (don't edit).

Rules, so a client's folder can be shared on its own later without leaking anything else:
1. Everything about a client lives in its space, including the sources it came from.
2. Pages in a space link only to pages inside it. Need a fact from elsewhere? Copy the fact in, with
   its source, rather than linking out. Jarvis warns when a page links out.
3. Nothing personal in a space: no notes about the user's own life, health, money or private
   relationships. Work contacts get a page in the space's `contacts/`, not in `relationships/`.
4. A company space contains its client spaces; sharing a client shares only that client.
5. Code goes in the client's `dev/`: each project is its own git repo (`jarvis_space` action dev makes
   one, or `git clone` inside dev/). dev/ is not part of the knowledge base: it's never indexed, searched,
   synced or shared, the Jarvis folder's git ignores it, and Obsidian hides it.
Make a folder a space with `jarvis_space` (action create; safe on an existing folder). `jarvis_space`
action check lists what would leak if it were shared.

## Sharing
This vault is **private**. No folder, including `work/` and `life/`, is shared with anyone or synced
to a shared service. Do not set up sharing, shared folders or collaborator access unless the user
explicitly asks for it.

## Privacy
Storage rules per area live in `me/onboarding.json` → `privacy` (`local | encrypted | cloud`).
- `local`: never synced, never sent to third-party tools, never included in cloud backups.
- `encrypted`: may be backed up only through an encrypted backup.
- `cloud`: may sync with the user's cloud storage (for example iCloud Drive).
Private areas: `life/health/`, `life/finance/`, `relationships/`, `journal/`, `frameworks/declarations/` and `frameworks/deal-cards/`. Jarvis's search and recall show only their page names; opening one needs the
user's OK every time. Default storage for them is `local`.

## Operations
- **Ingest** (`brain-ingest` skill): new source → `raw/` → update or create wiki pages → `index.md` → `log.md`.
- **Query** (`brain-query` skill): read `index.md`, open relevant pages, answer with links; save
  valuable answers back as pages.
- **Consolidate** (`brain-consolidate` skill, nightly 01:30): the day's conversations → facts on pages,
  commitments, `me/_proposals.md`, and a fresh `now.md`.
- **Lint** (`brain-lint` skill, nightly): contradictions, stale pages, orphans, missing links,
  uncited claims, broken frontmatter.

## log.md format
One line per change, newest at the bottom:
```
## [2026-09-28] ingest | Brightlabs Q1 brief → work/northwind-studio/clients/brightlabs/overview.md (+2 pages)
## [2026-09-28] update | relationships/people/sam.md: anniversary 2026-11-02
```

## Active templates
<!-- The onboarding skill fills this in. -->
- Work: _none yet_
- Life: _none yet_
