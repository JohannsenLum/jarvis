---
name: brain-lint
description: Health-check the knowledge vault: contradictions, stale pages, orphan pages, missing links, uncited claims, broken frontmatter, unfiled inbox items. Runs nightly on cron and on request ('check my vault').
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, brain]
    category: jarvis
---

# Brain lint

## When to Use
- Nightly cron job (stay silent if nothing needs the user).
- The user asks to check, tidy or clean up the vault.

## Procedure
1. **Inbox:** anything in `inbox/` → run `brain-ingest` on it.
2. **Frontmatter:** every page has `type`, `status`, `updated`. Fix missing fields you can infer; list the rest.
3. **Orphans:** pages with no inbound links and not in `index.md` → add to index and link from the obvious parent.
4. **Duplicates:** two pages for the same person/client/project → propose a merge (do not merge silently).
5. **Contradictions:** the same fact with different values on different pages → list with both sources.
6. **Uncited claims:** facts on wiki pages with no `sources` and no conversation date → list them.
7. **Stale:** `status: active` pages not updated in 90 days → list; projects past `due` → list.
8. **Relationships:** people overdue for a check-in per `relationships/circles.md` → hand to `relationship-checkin`.
9. **Spaces:** `jarvis_space` list; for each, `jarvis_space` check. Fix links out of a space by copying
   the fact in (with its source); move personal notes out to the right personal page; list what you
   couldn't fix. Client or company folders that aren't spaces yet: make them spaces (safe, adds files only).
10. Append one line to `log.md`: `## [YYYY-MM-DD] lint | fixed N, needs you M`.
10. Message the user only if something needs them, as a short list with one suggested action each.

## Pitfalls
- Rewriting pages in `me/` or anything in `raw/`.
- Deleting anything. Lint proposes; the user decides.

## Verification
`log.md` has tonight's lint line; the inbox is empty or every remaining item is listed with a reason.
