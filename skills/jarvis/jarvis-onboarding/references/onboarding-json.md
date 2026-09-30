# me/onboarding.json

Single source of truth for onboarding. Everything else in the vault can be regenerated from it.
Write it after every step. Unknown or skipped values are `null`, never guessed.

```json
{
  "version": 1,
  "status": "in_progress",
  "current_step": "work_details",
  "started_at": "2026-09-28T19:02:00+08:00",
  "completed_at": null,

  "user": { "name": "Alex", "role": "chief-of-staff", "tone": "warm", "autonomy": "act-and-tell" },

  "work": [
    { "template": "agency", "name": "Northwind Studio", "folder": "work/northwind-studio",
      "clients": ["Brightlabs", "Nomi", "Kopi Co"] },
    { "template": "freelancer", "folder": "work/freelance", "clients": ["Harbor Coffee"] }
  ],

  "life_areas": ["health", "fitness", "finance", "learning"],

  "people": [
    { "name": "Sam", "circle": "partner", "page": "relationships/people/sam.md" }
  ],

  "goals": ["Grow Northwind to 10 retainer clients", "Run a half marathon under 2h"],

  "frameworks": ["eisenhower", "dichotomy-of-control"],
  "principles": ["Say no by default"],
  "framework_next": "168",

  "rhythm": { "morning_briefing": "07:30", "weekly_review": "Sunday",
              "routines": ["morning_briefing", "weekly_review", "consolidate"],
              "briefing_includes": ["calendar", "open_loops", "people"],
              "scheduled_on": "claude-desktop" },
  "channels": { "cli": "connected", "telegram": "setup_pending", "telegram_mode": "dm_topics", "voice": "standard" },

  "connections": { "google": "pending", "apple": "connected", "obsidian": "connected",
                   "work": "connected", "github": "connected", "vercel": "skipped", "cloudflare": "skipped",
                   "higgsfield": "pending" },

  "privacy": { "health": "local", "finance": "encrypted", "relationships": "encrypted", "journal": "local" },

  "imports": [
    { "source": "/Users/alex/Documents/Clients/Brightlabs", "destination": "work/northwind-studio/clients/brightlabs",
      "mode": "copy", "kind": "client", "documents": 34, "status": "queued", "done": 0 }
  ],

  "pending": [
    { "step": "goals", "question": "Top goals this year", "skipped_at": "2026-09-28T19:06:00+08:00", "reason": "skipped" },
    { "step": "rhythm", "question": "Connect Telegram", "skipped_at": "2026-09-28T19:08:00+08:00", "reason": "setup_pending" }
  ]
}
```

## Field notes
- `status`: `in_progress` → `complete`. It stays `complete` when `pending` is non-empty.
- `current_step`: one of `hello_role, work, work_details, life, people, goals, principles, rhythm, connections, privacy, voice, existing_files, build`.
- `role`: `chief-of-staff | executive-assistant | thinking-partner | coach | life-manager`.
- `tone`: `warm | formal | direct`. `autonomy`: `ask-first | act-and-tell | handle-quietly`.
  Skipped values use the defaults (chief-of-staff, warm, act-and-tell) and are listed in `pending`.
- `work[].template`: `agency | employee | ceo | freelancer | student`. `folder` is the slug path created.
- `frameworks`: decision frameworks chosen for `me/frameworks/`. `framework_next`: `168 | declarations | aioo | deal-cards | null`, a guided framework to offer after setup.
- `rhythm.routines`: any of `morning_briefing, weekly_review, consolidate, lint` (the details live in `me/routines.md`). `rhythm.scheduled_on`: `claude-desktop | hermes | launchd-claude | launchd-codex | openclaw | null`.
- `privacy` values: `local | encrypted | cloud`. A skipped area is stored as `local` and listed in `pending`.
- `channels.voice`: `jev | standard | off | null`.
- `channels.telegram_mode`: `dm | dm_topics | group_topics | pending`.
- `connections.<id>` for `google, apple, obsidian, work, github, vercel, cloudflare, higgsfield`:
  `connected | pending | skipped` (skipped = not wanted; pending = wanted but not finished, also listed in `pending`).
- `imports[].mode`: `copy | reference`; `status`: `queued | importing | done | skipped`.
- `pending[].reason`: `skipped | timed_out | setup_pending`.

## Resuming
- Remove an item from `pending` once it is answered.
- When the user says "finish onboarding", ask only the `pending` items, oldest step first.
- Offer to resume at most once per day, at a natural moment ("By the way, we never set your goals.
  Want to do that now? It takes a minute.").
