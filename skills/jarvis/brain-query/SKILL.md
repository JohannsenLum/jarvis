---
name: brain-query
description: Answer a question from the user's knowledge vault with links to the pages used, and save valuable answers back as pages. Use for questions about the user's own people, clients, projects, goals, notes, history or decisions.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, brain]
    category: jarvis
---

# Brain query

## When to Use
Questions about the user's own world: "what did Sam say about…", "where are we with Brightlabs",
"what have I read about pricing", "when is Mum's birthday".

## Procedure
1. Read `index.md` and pick the likely pages. Use file search for names and keywords too.
2. Open those pages and follow `[[links]]` one hop where useful.
3. Answer first, briefly, then list the pages you used as `[[links]]`.
4. If the answer needed several pages stitched together and is likely to be asked again, offer to
   save it as a page (`type: note`) and link it from the relevant pages.
5. If the vault doesn't know, say so plainly and suggest how to fill the gap (ask the user, or ingest a source).

## Pitfalls
- Answering from general knowledge when the question is about the user's world. Say what the vault
  does and doesn't contain.
- Treating a `status: draft` page in `me/` as confirmed.

## Verification
Every factual claim in the answer can be traced to a linked page.
