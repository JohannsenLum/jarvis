---
name: client-onboarding
description: Set up a new client: page, folders, contacts, kickoff checklist from sops/. Agency and freelancer templates. Use when the user says they signed or won a new client.
version: 1.0.0
metadata:
  hermes:
    tags: [jarvis, agency]
    category: jarvis
---

# Client onboarding

## Procedure
1. Ask with your question tool (batch): client name, main contact (name + role), retainer or project, start date.
   Allow "Skip for now" on anything except the name.
2. Create `clients/<slug>/overview.md`, `projects/`, `meetings/`; a person page for each contact.
3. Copy the kickoff checklist from `sops/` (if present) into the client page as `- [ ]` items.
4. Move the lead out of `pipeline/leads/` if it was there. Update `index.md` and `log.md`.
