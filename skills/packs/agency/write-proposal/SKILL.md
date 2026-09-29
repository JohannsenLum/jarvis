---
name: write-proposal
description: Draft a client proposal or quote from a brief, using the client's page, services.md, pricing.md and past proposals. Agency and freelancer templates.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, agency]
    category: jarvis
---

# Write proposal

## Procedure
1. Find the client page (`work/*/clients/<slug>/overview.md`). If there's no page, create one from
   `_templates/client.md` (status: lead) after confirming the name.
2. Read `services.md`, `pricing.md`, and two similar past proposals in `pipeline/proposals/`.
3. Draft: problem → approach → deliverables → timeline → price → next step. One page.
4. Save to `pipeline/proposals/YYYY-MM-DD-<client>.md` (status: draft) and link it from the client page.
5. Send the user the headline (scope, price, timeline) and the file path. Ask what to change.

## Pitfalls
- Inventing prices. If `pricing.md` has nothing that fits, ask.
