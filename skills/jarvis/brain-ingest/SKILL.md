---
name: brain-ingest
description: Add a source (link, PDF, note, voice memo, pasted text) to the knowledge vault: file it in raw/, update or create the wiki pages it touches, then update index.md and log.md. Use when the user shares something with 'save this', 'read this', 'remember this', or drops files in inbox/.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, brain]
    category: jarvis
---

# Brain ingest

## When to Use
- The user sends a link, file or text and wants it kept ("save this", "read this for later").
- Files are sitting in `inbox/` (check during the nightly lint run too).
- A conversation produced a fact worth keeping ("Brightlabs wants a Q1 rebrand"). For a single fact,
  skip step 1 and cite the conversation date instead.

## Procedure
1. **File the source.** Save the original under `raw/YYYY/MM/<slug>.<ext>` (web pages as markdown with
   the URL and fetch date at the top). Never edit a file in `raw/` after this.
2. **Read it and list what it touches.** People, clients, projects, decisions, goals, life areas.
3. **Update existing pages first.** Search `index.md` and the vault before creating anything. Add the
   new facts under the right heading, add the source to `sources:` in frontmatter, bump `updated:`.
4. **Create pages only for genuinely new things**, from `_templates/`. Link them both ways.
5. **Flag contradictions.** If the source disagrees with a page, keep both, mark the line
   `⚠️ conflicts with [[other]] (source A vs source B)` and tell the user.
6. Update `index.md` (one line per new page) and append to `log.md`:
   `## [YYYY-MM-DD] ingest | <source title> → <pages touched>`
7. Reply in one or two lines: what you filed and which pages changed.

## Pitfalls
- Duplicating a person or client that already has a page under a slightly different name. Search first.
- Writing to `me/`. Propose instead.
- Ingesting into a private area (`life/health`, `life/finance`, `relationships`, `journal`) from a
  source that came from a third-party tool without the user's say-so.

## Verification
- The source exists in `raw/`; every touched page lists it in `sources:`; `log.md` has the entry.
