# Connection setup, step by step

Each section: what to tell the user, what to run, and how to check it worked.

**Which tool gets the connection.** Connect services on the **home runtime** (Hermes by default) so
scheduled jobs can use them. MCP-based ones (Vercel, Cloudflare, Higgsfield) can also be added to any
other tool the user works in, with that tool's own command:
| Tool | Add a remote MCP server |
|---|---|
| Hermes | `hermes mcp add <name> --url <url> --auth oauth`, then `hermes mcp login <name>` |
| Claude Code | `claude mcp add --scope user --transport http <name> <url>` (sign in via `/mcp`) |
| Codex | `codex mcp add <name> --url <url>` (then follow its login prompt) |
| Claude desktop app | Settings → Connectors → Add custom connector (URL) |
| DeepSeek Harness, OpenClaw, Cursor, Gemini | their MCP config file; `jarvis doctor` lists what's installed |
Commands marked **(user terminal)** need the user to type them, because they open an interactive
login. Everything else you can run with the terminal tool, with approval.

## google: Gmail, Calendar, Drive, Docs, Sheets, Contacts
Tell them: this is a one-time setup of about 10 minutes, because Google requires their own OAuth
client. After that it stays connected.
1. Load the bundled `google-workspace` skill and follow its **First-Time Setup** exactly. It walks
   through creating a Google Cloud OAuth client (Desktop app), downloading the client file, and
   authorizing in the browser. Do not improvise the steps.
2. Scope: start with read access for Gmail and read/write for Calendar. Add send permission only if
   the user asks for Jarvis to send mail.
Check: list today's calendar events and the 3 latest email subjects. Show them to the user.

## apple: Reminders, Notes, iMessage, Find My
Tell them: these use small open-source command-line tools and macOS permissions. Ask which of the
four they want (clarify, multi_select): Reminders, Notes, iMessage, Find My.
- Reminders: `brew install steipete/tap/remindctl`. macOS asks for Reminders access on first use.
  Check: `remindctl` lists their lists.
- Notes: `brew tap antoniorodr/memo && brew install antoniorodr/memo/memo`. macOS asks for
  Automation access to Notes. Check: search notes for a word they choose.
- iMessage: `brew install steipete/tap/imsg`. Needs **Full Disk Access** for the terminal/Hermes app
  (System Settings → Privacy & Security → Full Disk Access) and Automation for Messages. Reading is
  fine without asking each time; **sending always asks**. Check: show the latest chat names only.
- Find My: uses the Find My app. Load the `findmy` skill for its steps. Check: list device names.
If Homebrew is missing, tell them to install it from brew.sh first and mark `apple` pending.

## obsidian: the second brain
Tell them: their knowledge vault is already a folder of markdown; Obsidian just opens it.
1. In Hermes, the bundled `obsidian` skill uses `OBSIDIAN_VAULT_PATH` from `~/.hermes/.env` (setup sets it).
   Other tools reach the vault through the Jarvis MCP tools, so nothing to set there.
2. If Obsidian isn't installed: https://obsidian.md (free). Then File → Open folder as vault → the
   knowledge folder.
Check: `OBSIDIAN_VAULT_PATH` equals the vault path and `SCHEMA.md` is found there.

## work: Word, Excel, PowerPoint, PDF
Tell them: no login needed. Jarvis can read, create and edit .docx, .xlsx/.csv, .pptx and PDFs using
the bundled `docx`, `xlsx`, `powerpoint` and `pdf` skills.
Check: create a one-line test document in the vault's `inbox/`, read it back, delete it (ask first).
If a Python library is missing, the skill says how to add it with Hermes' own environment.

## github: repos, issues, pull requests
Tell them: this uses GitHub's official `gh` command-line tool.
1. `brew install gh` (if `gh` is missing).
2. **(user terminal)** `gh auth login` → GitHub.com → HTTPS → log in with a web browser.
Check: `gh auth status` succeeds; `gh repo list --limit 5` shows their repos.
Safety: creating PRs, merging, pushing, closing issues or changing repo settings always ask first.

## vercel: deployments, logs, projects
Tell them: this is Vercel's official hosted connector; they approve access in the browser.
1. Install from the catalog. In chat, ask to add the Vercel MCP (a setup card appears), or
   **(user terminal)** `hermes mcp install vercel`.
2. Approve in the browser. Then start a new conversation so the tools load (`/new` on Telegram).
Check: list their Vercel projects.
Safety: deploying, promoting, rolling back, changing env vars or domains always ask first.

## cloudflare: DNS, Workers, domains
Tell them: this is Cloudflare's official hosted connector; they approve access in the browser.
Cloudflare controls live websites and DNS, so Jarvis will only look unless they approve a change.
1. Install from the catalog. In chat, ask to add the Cloudflare MCP, or
   **(user terminal)** `hermes mcp install cloudflare`.
2. Approve in the browser (pick the account). Start a new conversation so tools load.
Check: list their zones (domains).
Safety: any DNS, Worker, firewall or domain change always asks first and names exactly what changes.

## higgsfield: AI images and video
Tell them: this is Higgsfield's official connector. They sign in with their Higgsfield account; no
API key. Generations use their Higgsfield credits at standard rates (plan "unlimited" perks apply only
on the website), so Jarvis always confirms before generating.
1. Add it (not in the Hermes catalog yet, so by URL):
   `hermes mcp add higgsfield --url https://mcp.higgsfield.ai/mcp --auth oauth`
2. **(user terminal)** `hermes mcp login higgsfield` and approve in the browser. Run it in a fresh
   terminal, not from inside a running chat (the in-chat reload times out before OAuth finishes).
   If the browser flow fails: `hermes mcp login higgsfield --flow device` and enter the code shown.
3. The server exposes many tools. Keep the essentials on with `hermes mcp configure higgsfield`:
   image and video generation, upscale, remove background, presets, models, jobs, media upload,
   balance. Turn off publishing tools (e.g. TikTok) unless they want them.
4. Start a new conversation (`/new` on Telegram) so the tools load.
Check: ask Higgsfield for the credit balance and show it. Don't generate anything as a test.
Safety: publishing anywhere (TikTok, websites) always asks first; generations ask first unless the
user sets a standing budget ("up to 50 credits a day without asking"), recorded in `me/profile.md`.
