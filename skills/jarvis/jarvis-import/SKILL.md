---
name: jarvis-import
description: Find existing folders on the Mac (Documents, Desktop, Downloads, iCloud Drive, Google Drive, Dropbox) with clients, projects and work data, ask the user which to bring into the vault, and import them in batches without moving or deleting originals. Use in onboarding, or when the user says "import my files", "bring in my client folders", "scan my documents".
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, import, onboarding, vault]
    category: jarvis
---

# Bring existing files into Jarvis

## When to Use
- Onboarding step "Existing files".
- The user asks to import, bring in, or scan folders.

## Rules
- **Originals are never moved, renamed, edited or deleted.** Import means copy or reference.
- Only folders the user picked are opened. Nothing else on the Mac is read.
- The scan reads names, sizes and dates only. Say so when offering it.
- Finance and health folders are listed separately, unticked by default, and go only to
  `life/finance/` or `life/health/` (private, local) if the user explicitly chooses them.
- Code repos and photo/video folders are not imported by default; offer "reference only".
- Big imports cost tokens. Give a rough size up front (number of documents) and import in batches.

## Procedure
1. **Scan.** Use a recent scan if one exists (`inbox/.import-scan.json` in the vault, from setup, less
   than 7 days old). Otherwise ask to scan, then run with the terminal tool:
   `python3 <Jarvis repo>/bin/scan_folders.py --out <vault>/inbox/.import-scan.json`
   (the Jarvis repo path: `jarvis_status`). macOS may ask for access to Desktop, Downloads or iCloud
   Drive; tell the user to allow it or skip that folder.
2. **Show what was found**, grouped, numbered, one line each: name, where, documents count, last
   modified. Groups: Work (client, project, work, other with documents), Private (finance, health),
   Skipped by default (code, media). Keep it to the 20 most relevant; offer "show the rest".
3. **Ask** with your question tool:
   - "Which should I bring in?" choices: `All work folders (recommended)`, `Let me pick by number`,
     `Include private ones too`, `Skip for now`. "Let me pick": ask for numbers (open-ended).
   - Then, one batch: "Copy documents into the vault, or just reference them where they are?"
     `Copy documents (recommended)`, `Reference only`, `Skip for now`.
4. **Map each chosen folder to a vault destination** using the work templates in onboarding
   `references/templates.md` (e.g. a client folder → `work/<company>/clients/<slug>/`, a project →
   `work/<company>/projects/<slug>/` or a life area). Show the mapping in one short list and confirm.
   Create a client/project page from `_templates/` if it doesn't exist.
5. **Record** in `me/onboarding.json` → `imports`: one entry per folder
   `{source, destination, mode: copy|reference, kind, documents, status: queued, done: 0}`.
6. **Import in batches** of up to 20 documents:
   - `copy`: copy supported documents (≤ 25 MB each) to `raw/imports/<slug>/…` keeping sub-paths,
     then run `brain-ingest` on them so the right pages get updated with sources.
   - `reference`: don't copy; read at most the 5 most useful-looking documents (briefs, contracts,
     proposals, READMEs) to write the destination page, and list the original folder path on it.
   - Update `done`/`status` after each batch; `log.md`: `## [date] import | <folder>: N documents`.
7. If more than one batch remains, ask whether to continue now or overnight. Overnight: create a
   cron job (02:30 daily) that loads this skill and continues queued imports, then removes itself
   when nothing is queued. Report progress in the morning briefing.
8. Finish with a one-line summary per folder and where it landed.

## Pitfalls
- Importing duplicates on a re-run: skip files already in `raw/imports/` with the same size and name.
- Treating file names as facts. Names only guide the mapping; facts come from reading documents.
- Copying a huge folder in one go. Always batch.

## Verification
Every `imports` entry is `done` or has a clear status; copied files exist under `raw/imports/`; the
destination pages list their sources; originals are untouched.
