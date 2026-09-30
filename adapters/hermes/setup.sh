#!/bin/zsh
# Jarvis setup (macOS). Safe to re-run: every step checks before it changes anything.
#
#   jarvis setup hermes           full guided setup (Hermes as the always-on home)
#   jarvis setup hermes --voice   only the desk voice client
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"   # framework root (repo, or <folder>/.jarvis)
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
# Works both from the Jarvis repo and from inside a Jarvis folder (run it with: jarvis setup hermes).
KNOWLEDGE="$(python3 -c "import sys; sys.path.insert(0, '$ROOT/core'); from jarvis_core import config; print(config.vault())")"
USER_SKILLS="$(python3 -c "import sys; sys.path.insert(0, '$ROOT/core'); from jarvis_core import config; r = config.instance_root(); print(r / 'skills' if r else '$ROOT/skills/learned')")"

step()  { print -P "\n%F{yellow}▸ $1%f"; }
info()  { print -P "  $1"; }
ok()    { print -P "  %F{green}✓%f $1"; }
warn()  { print -P "  %F{red}!%f $1"; }
yes_no() {  # yes_no "Question" default(y|n)
  local def=${2:-y} ans; read "ans?  $1 [$([[ $def == y ]] && echo Y/n || echo y/N)] "
  ans=${ans:-$def}; [[ $ans == [yY]* ]]
}
menu() {    # menu "Question" "opt1" "opt2" ... → sets REPLY to the chosen number
  print "  $1"; local i=1; for o in "${@:2}"; do print "    $i) $o"; ((i++)); done
  read "REPLY?  Choose 1-$(( $# - 1 )): "
}
env_set() { # env_set FILE KEY VALUE (adds or replaces, keeps file private)
  local f=$1 k=$2 v=$3; touch "$f"; chmod 600 "$f"
  if grep -q "^$k=" "$f"; then sed -i '' "s|^$k=.*|$k=$v|" "$f"; else print "$k=$v" >> "$f"; fi
}
env_get() { [[ -f $1 ]] && grep "^$2=" "$1" | tail -1 | cut -d= -f2-; }

# Dependencies (deps.env): the desk voice client is its own repo, fetched next to this one.
source "$ROOT/deps.env"
VOICE_DIR="${JARVIS_VOICE_DIR:-$(dirname "$ROOT")/jarvis-voice}"
VOICE_HOME="${JARVIS_VOICE_HOME:-$HOME/.jarvis-voice}"

fetch_voice() {  # make sure the jarvis-voice repo is present; returns 1 to skip voice
  local folder url
  if [[ -f $VOICE_DIR/scripts/setup.sh ]]; then
    ok "Voice app found at $VOICE_DIR"
    if [[ -d $VOICE_DIR/.git ]] && git -C "$VOICE_DIR" remote get-url origin >/dev/null 2>&1 \
       && yes_no "Check for updates to the voice app?" n; then
      git -C "$VOICE_DIR" pull --ff-only origin "$JARVIS_VOICE_REF" || warn "Update failed; keeping the current version"
    fi
    return 0
  fi
  info "The voice app (jarvis-voice) isn't on this Mac yet."
  while true; do
    menu "How do you want to get it?" \
      "Download it from GitHub${JARVIS_VOICE_REPO:+ ($JARVIS_VOICE_REPO)}" \
      "I already have it on this Mac (choose the folder)" \
      "Skip voice for now (run: jarvis setup hermes --voice)"
    case $REPLY in
      1)
        url=$JARVIS_VOICE_REPO
        if [[ -z $url ]]; then
          read "url?  Repo URL (e.g. https://github.com/<you>/jarvis-voice.git): "
          [[ -z $url ]] && continue
        fi
        info "Downloading into $VOICE_DIR"
        if git clone --branch "$JARVIS_VOICE_REF" "$url" "$VOICE_DIR"; then
          ok "Voice app downloaded"
          if [[ $url != "$JARVIS_VOICE_REPO" ]] && yes_no "Remember this URL in deps.env?" y; then
            env_set "$ROOT/deps.env" JARVIS_VOICE_REPO "$url"; JARVIS_VOICE_REPO=$url
          fi
          return 0
        fi
        warn "Couldn't download from $url. Check the URL and your GitHub access, or pick another option." ;;
      2)
        read "folder?  Folder path: "
        folder=${~folder}                 # expand ~
        if [[ -f $folder/scripts/setup.sh && -d $folder/jarvis_voice ]]; then
          VOICE_DIR=${folder:A}
          env_set "$ROOT/deps.env" JARVIS_VOICE_DIR "$VOICE_DIR"
          ok "Using the voice app at $VOICE_DIR (saved in deps.env)"
          return 0
        fi
        warn "That folder doesn't look like jarvis-voice (no scripts/setup.sh and jarvis_voice/)." ;;
      3) info "Skipped. Run: jarvis setup hermes --voice whenever you're ready."; return 1 ;;
      *) warn "Choose 1, 2 or 3." ;;
    esac
  done
}

setup_voice() {
  step "Desk voice (wake word \"Jarvis\", hold Caps Lock, or open mic)"
  fetch_voice || return 0
  local venv="$VOICE_HOME/.env"
  mkdir -p "$VOICE_HOME" && chmod 700 "$VOICE_HOME"
  [[ -f $venv ]] || cp "$VOICE_DIR/.env.example" "$venv"
  chmod 600 "$venv"
  local api_key; api_key=$(env_get "$HERMES_HOME/.env" API_SERVER_KEY)
  [[ -n $api_key ]] && env_set "$venv" JARVIS_API_KEY "$api_key" && ok "Voice client linked to Jarvis"
  if [[ -z $(env_get "$venv" TYPESAFE_API_KEY) ]]; then
    info "Jev fast mode makes Mac commands instant and enables multi-step web tasks in Chrome."
    info "Get a key at https://console.typesafe.ai (limited early access). Leave blank for standard mode."
    local k; read -s "k?  TYPESAFE_API_KEY (hidden, Enter to skip): "; print
    if [[ -n $k ]]; then env_set "$venv" TYPESAFE_API_KEY "$k"; ok "Jev fast mode on"
    else info "Standard mode: every request goes to Jarvis. Add the key to $venv any time."; fi
  fi
  if ! command -v brew >/dev/null; then
    warn "Homebrew is needed for whisper.cpp. Install it from https://brew.sh, then run: jarvis setup hermes --voice"
    return
  fi
  if yes_no "Run the voice installer now? (whisper.cpp, Caps Lock → F18, Mic/Accessibility permissions, Chrome link)" y; then
    "$VOICE_DIR/scripts/setup.sh"
  fi
  # The voice client owns the desk mic; keep Hermes' own wake word off so they don't fight.
  command -v hermes >/dev/null && hermes config set wake_word.enabled false >/dev/null && ok "Hermes wake word off (voice client listens instead)"
}

if [[ $1 == --voice ]]; then setup_voice; exit 0; fi

print -P "%F{yellow}%BJarvis setup%b%f  ·  $ROOT"

# ---------------------------------------------------------------- 1. Hermes
step "Hermes Agent (Jarvis's engine)"
if command -v hermes >/dev/null; then
  ok "Hermes found: $(hermes --version 2>/dev/null | head -1)"
else
  info "Hermes isn't installed. Options: the Hermes desktop app (https://hermes-agent.nousresearch.com/desktop)"
  info "or the official command-line installer."
  if yes_no "Run the official installer now? (curl https://hermes-agent.nousresearch.com/install.sh | bash)" y; then
    curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
    export PATH="$HOME/.local/bin:$PATH"
    command -v hermes >/dev/null || { warn "Open a new terminal so 'hermes' is on your PATH, then re-run: jarvis setup hermes"; exit 1; }
  else
    warn "Install Hermes, then re-run: jarvis setup hermes"; exit 1
  fi
fi
mkdir -p "$HERMES_HOME"

# ---------------------------------------------------------------- 2. Models
# Jarvis model policy: normal conversations on the strong model, scheduled jobs on the lighter one.
#   Claude subscription: chats Opus 5.5 (claude-opus-5-5), scheduled jobs Sonnet 5 (claude-sonnet-5)
#   ChatGPT/Codex:       chats GPT-6 Sol (gpt-6-sol),     scheduled jobs GPT-6 Luna (gpt-6-luna)
# With both connected, the one you pick leads and the other becomes the automatic backup.
CLAUDE_PROVIDER=claude-subscription-directsdk-experimental
CODEX_PROVIDER=openai-codex

connect_claude() {
  command -v claude >/dev/null || { info "Installing Claude Code CLI"; npm install -g @anthropic-ai/claude-code; }
  info "Log in with your Claude account if you haven't (a browser opens):"
  claude auth status >/dev/null 2>&1 || claude auth login
  # Install the Claude subscription plugin unless it's already there. (The plugin list shortens long
  # names, so ask for the install and treat "already exists" as success.)
  local out
  out=$(hermes plugins install claude-subscription-directsdk 2>&1 </dev/null) || true
  if print -r -- "$out" | grep -qi "already exists"; then
    ok "Claude subscription plugin already installed"
  elif print -r -- "$out" | grep -qiE "error|failed"; then
    print -r -- "$out" | tail -3
    warn "Couldn't install the Claude subscription plugin. Try: hermes plugins install claude-subscription-directsdk --force"
  else
    ok "Claude subscription plugin installed"
  fi
  warn "Each Claude turn uses your subscription's Agent SDK allowance (about 1.7x interactive Claude Code)."
  warn "Turn off 'extra usage' in your Claude account settings if you don't want overage charges."
}
connect_codex() {
  info "Log in with your ChatGPT account (open the link shown and enter the code):"
  if hermes auth status openai-codex 2>/dev/null | grep -qi "logged out\|no codex credentials"; then
    hermes auth add openai-codex --type oauth
  else
    ok "Already logged in to ChatGPT/Codex"
  fi
}
use_models() {  # use_models PROVIDER CHAT_MODEL CRON_MODEL
  hermes config set model.provider "$1" --force >/dev/null
  hermes config set model.default "$2" --force >/dev/null
  hermes config set cron.model_provider "$1" --force >/dev/null
  hermes config set cron.model "$3" --force >/dev/null
}

detect_subscriptions() {  # sets HAS_CLAUDE / HAS_CODEX / CODEX_CLI / HAS_NOUS / API_KEYS
  HAS_CLAUDE=""; HAS_CODEX=""; CODEX_CLI=""; HAS_NOUS=""; API_KEYS=""
  if command -v claude >/dev/null && claude auth status --json 2>/dev/null \
       | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("loggedIn") and d.get("authMethod")=="claude.ai" else 1)' 2>/dev/null; then
    HAS_CLAUDE=1
  fi
  hermes auth status openai-codex 2>/dev/null | grep -qi "logged out" || HAS_CODEX=1
  [[ -z $HAS_CODEX && -f $HOME/.codex/auth.json ]] && CODEX_CLI=1   # Hermes can import this login
  hermes auth status nous 2>/dev/null | grep -qi "logged out" || HAS_NOUS=1
  local k
  for k in ANTHROPIC_API_KEY OPENAI_API_KEY OPENROUTER_API_KEY DEEPSEEK_API_KEY; do
    [[ -n ${(P)k} || -n $(env_get "$HERMES_HOME/.env" $k) ]] && API_KEYS+="${k%_API_KEY} "
  done
}

use_claude_lead() {
  use_models $CLAUDE_PROVIDER claude-opus-5-5 claude-sonnet-5
  [[ -n $1 ]] && hermes config set fallback_providers "[{'provider': '$CODEX_PROVIDER', 'model': 'gpt-6-sol'}]" --force >/dev/null
  ok "Chats: Opus 5.5 · scheduled jobs: Sonnet 5${1:+ · backup: Codex GPT-6 Sol}"
}
use_codex_lead() {
  use_models $CODEX_PROVIDER gpt-6-sol gpt-6-luna
  [[ -n $1 ]] && hermes config set fallback_providers "[{'provider': '$CLAUDE_PROVIDER', 'model': 'claude-opus-5-5'}]" --force >/dev/null
  ok "Chats: GPT-6 Sol · scheduled jobs: GPT-6 Luna${1:+ · backup: Claude Opus 5.5}"
}
choose_manually() {
  menu "Which subscriptions do you want to use?" \
    "Claude (Pro/Max)" \
    "ChatGPT / Codex" \
    "Both Claude and ChatGPT/Codex" \
    "Nous Portal (one login, 300+ models)" \
    "An API key (OpenRouter, Anthropic, OpenAI, DeepSeek, local...)" \
    "Skip (already set up)"
  case $REPLY in
    1) connect_claude; use_claude_lead ;;
    2) connect_codex; use_codex_lead ;;
    3) connect_claude; connect_codex; pick_lead ;;
    4) hermes setup --portal; info "Set a lighter model for scheduled jobs: hermes config set cron.model <model>" ;;
    5) hermes model; info "Set a lighter model for scheduled jobs: hermes config set cron.model <model>" ;;
    *) info "Keeping the current model setup." ;;
  esac
}
pick_lead() {
  menu "Which should lead normal conversations? The other takes over automatically if it's down or rate-limited." \
    "Claude: Opus 5.5 for chats, Sonnet 5 for scheduled jobs (recommended)" \
    "ChatGPT/Codex: GPT-6 Sol for chats, GPT-6 Luna for scheduled jobs"
  if [[ $REPLY == 2 ]]; then use_codex_lead backup; else use_claude_lead backup; fi
  info "Use either model for a specific job any time: \"use GPT Astra for ...\" or \"use Opus for ...\""
}

step "Which AI should power Jarvis?"
info "Checking what's already signed in on this Mac..."
detect_subscriptions
[[ -n $HAS_CLAUDE ]] && ok "Claude subscription (signed in to Claude Code)"
[[ -n $HAS_CODEX ]]  && ok "ChatGPT/Codex subscription (signed in to Hermes)"
[[ -n $CODEX_CLI ]]  && ok "ChatGPT/Codex login found in the Codex CLI (Hermes can reuse it)"
[[ -n $HAS_NOUS ]]   && ok "Nous Portal"
[[ -n $API_KEYS ]]   && ok "API keys: $API_KEYS"
CODEX_READY=${HAS_CODEX:-$CODEX_CLI}

if [[ -n $HAS_CLAUDE && -n $CODEX_READY ]]; then
  menu "Found both Claude and ChatGPT/Codex. How should Jarvis use them?" \
    "Both, Claude leads: Opus 5.5 chats, Sonnet 5 scheduled, Codex as backup (recommended)" \
    "Both, Codex leads: GPT-6 Sol chats, GPT-6 Luna scheduled, Claude as backup" \
    "Only Claude" \
    "Only ChatGPT/Codex" \
    "Choose something else"
  case $REPLY in
    1) connect_claude; connect_codex; use_claude_lead backup ;;
    2) connect_claude; connect_codex; use_codex_lead backup ;;
    3) connect_claude; use_claude_lead ;;
    4) connect_codex; use_codex_lead ;;
    *) choose_manually ;;
  esac
elif [[ -n $HAS_CLAUDE ]]; then
  menu "Found your Claude subscription. Use it?" \
    "Yes: Opus 5.5 for chats, Sonnet 5 for scheduled jobs (recommended)" \
    "Yes, and also connect ChatGPT/Codex as a backup" \
    "Choose something else"
  case $REPLY in
    1) connect_claude; use_claude_lead ;;
    2) connect_claude; connect_codex; pick_lead ;;
    *) choose_manually ;;
  esac
elif [[ -n $CODEX_READY ]]; then
  menu "Found your ChatGPT/Codex subscription. Use it?" \
    "Yes: GPT-6 Sol for chats, GPT-6 Luna for scheduled jobs (recommended)" \
    "Yes, and also connect Claude as a backup" \
    "Choose something else"
  case $REPLY in
    1) connect_codex; use_codex_lead ;;
    2) connect_codex; connect_claude; pick_lead ;;
    *) choose_manually ;;
  esac
else
  info "No subscriptions found yet."
  choose_manually
fi

# ---------------------------------------------------------------- 3. Identity + skills
step "Jarvis identity and skills"
# Local vault files (never committed: the repo is public).
[[ -f $KNOWLEDGE/index.md ]] || printf '# Index\n\nCatalog of every page in the vault, grouped by folder. Jarvis updates this on every change.\n\n## me\n\n## life\n\n## relationships\n\n## work\n\n## journal\n' > "$KNOWLEDGE/index.md"
[[ -f $KNOWLEDGE/log.md ]] || printf '# Log\n\nAppend-only. One line per change: `## [YYYY-MM-DD] <kind> | <what>`\n\n' > "$KNOWLEDGE/log.md"
# The `jarvis` command: plugs Jarvis into Hermes now, and into other tools in the step after this.
mkdir -p "$HOME/.local/bin" && ln -sfn "$ROOT/bin/jarvis" "$HOME/.local/bin/jarvis"
"$ROOT/bin/jarvis" install hermes       # identity (from your settings), Jarvis MCP tools, recall plugin
ok "Jarvis identity installed in Hermes (vault: $KNOWLEDGE)"
mkdir -p "$ROOT/skills/learned"
if [[ $(basename "$ROOT") == ".jarvis" ]]; then      # a Jarvis folder: your skills/ first, then Jarvis's
  mkdir -p "$USER_SKILLS/learned"
  hermes config set skills.external_dirs "['$USER_SKILLS', '$ROOT/skills']" >/dev/null
  hermes config set skills.create_dir "$USER_SKILLS/learned" >/dev/null
else
  hermes config set skills.external_dirs "['$ROOT/skills']" >/dev/null
  hermes config set skills.create_dir "$ROOT/skills/learned" >/dev/null
fi
ok "Skills loaded from $ROOT/skills (new skills Jarvis writes go to skills/learned, tracked in git)"
# One brain: Hermes' own llm-wiki skill would start a separate wiki in ~/wiki, so turn it off, and
# point the bundled Obsidian skill at the Jarvis vault.
hermes config set skills.disabled "['llm-wiki']" --force >/dev/null 2>&1 || hermes config set skills.disabled "['llm-wiki']" >/dev/null 2>&1
env_set "$HERMES_HOME/.env" OBSIDIAN_VAULT_PATH "$KNOWLEDGE"
ok "Obsidian skill points at your vault; built-in llm-wiki off (the vault is the one brain)"
# Task board tools, so "use GPT Astra / Opus for ..." can hand a job to a task pinned to that model.
for p in cli telegram api_server; do hermes tools enable kanban --platform $p >/dev/null 2>&1; done
hermes config set kanban.default_assignee default --force >/dev/null 2>&1   # tasks run as Jarvis itself
ok "Task board on (lets Jarvis run a job on a specific model)"
# Diagram skill extras: puppeteer-core outside the repo, so diagrams export to PNG via Hermes' Chromium.
if [[ ! -d $HOME/.jarvis-tools/fireworks/node_modules/puppeteer-core ]]; then
  node_bin=$(ls -d "$HERMES_HOME"/tools/node-*/bin 2>/dev/null | tail -1)
  mkdir -p "$HOME/.jarvis-tools/fireworks"
  [[ -f $HOME/.jarvis-tools/fireworks/package.json ]] || print '{"name":"jarvis-fireworks-runtime","private":true}' > "$HOME/.jarvis-tools/fireworks/package.json"
  (cd "$HOME/.jarvis-tools/fireworks" && PATH="$node_bin:$PATH" npm install --no-audit --no-fund -s puppeteer-core@25.3.0) \
    && ok "Diagram PNG export ready" || warn "Diagram PNG export not set up (diagrams still work as SVG/HTML)"
fi

# ---------------------------------------------------------------- 3b. Other tools
step "Use Jarvis in your other AI tools too"
info "Same Jarvis (identity, vault, skills, memory) inside Claude Code, Codex, DeepSeek Harness, OpenClaw,"
info "Cursor, Gemini CLI and the Claude desktop app. Found on this Mac:"
found=()
for h in claude-code codex deepseek openclaw cursor gemini claude-desktop; do
  if python3 -c "import sys; sys.path.insert(0, '$ROOT/bin'); import jarvis_cli as j; sys.exit(0 if j.DETECT['$h']() else 1)" 2>/dev/null; then
    found+=($h); ok "$h"
  fi
done
if (( ${#found} )); then
  menu "Plug Jarvis into these?" \
    "All of them (${found[*]})" \
    "Let me pick" \
    "Not now (run: jarvis install <tool> any time)"
  case $REPLY in
    1) "$ROOT/bin/jarvis" install "${found[@]}" ;;
    2) for h in "${found[@]}"; do yes_no "  Plug into $h?" y && "$ROOT/bin/jarvis" install "$h"; done ;;
    *) info "Skipped." ;;
  esac
  [[ " ${found[*]} " == *" claude-code "* ]] && info "Claude Code can also use the plugin instead: claude plugin marketplace add $ROOT && claude plugin install jarvis@jarvis"
else
  info "None found. Later: jarvis install claude-code | codex | deepseek | openclaw | cursor | gemini | claude-desktop"
fi

# ---------------------------------------------------------------- 4. API server (voice + future dashboard)
step "Local API for the voice client"
if [[ -z $(env_get "$HERMES_HOME/.env" API_SERVER_KEY) ]]; then
  env_set "$HERMES_HOME/.env" API_SERVER_ENABLED true
  env_set "$HERMES_HOME/.env" API_SERVER_KEY "$(openssl rand -hex 24)"
  ok "API server enabled on 127.0.0.1:8642 (localhost only)"
else
  ok "API server already configured"
fi

# ---------------------------------------------------------------- 5. Telegram
step "Telegram (talk to Jarvis from your phone)"
menu "How do you want to connect Telegram?" \
  "Create the bot with a QR code (easiest: opens the Hermes dashboard)" \
  "I already have a bot token" \
  "Walk me through creating one" \
  "Skip for now (Jarvis will remind you during onboarding)"
case $REPLY in
  1) info "In the dashboard: Messaging → Telegram → Create with QR. Close it with Ctrl+C when done."
     hermes dashboard ;;
  2) info "Choose Telegram and paste the token when asked. Never paste it into a chat."
     hermes gateway setup ;;
  3) sed -n '/^\*\*Manual way/,$p' "$ROOT/skills/jarvis/jarvis-onboarding/references/telegram.md"
     yes_no "Got your token? Open the gateway setup now?" y && hermes gateway setup ;;
  *) info "Skipped." ;;
esac

if [[ -n $(env_get "$HERMES_HOME/.env" TELEGRAM_ALLOWED_USERS) ]]; then
  menu "How should Jarvis look in Telegram?" \
    "Topics in my DM: Inbox, Work, Life, Briefings, General (recommended)" \
    "One normal DM conversation" \
    "A group with topics (answers only when @mentioned)" \
    "Skip for now (Jarvis can set it up later: say \"set up my Telegram topics\")"
  case $REPLY in
    1) "$ROOT/adapters/hermes/telegram_mode.sh" dm-topics ;;
    2) "$ROOT/adapters/hermes/telegram_mode.sh" dm ;;
    3) "$ROOT/adapters/hermes/telegram_mode.sh" group-topics ;;
    *) info "Skipped. Normal DM for now." ;;
  esac
fi

# ---------------------------------------------------------------- 6. Always on
step "Keep Jarvis running"
info "The gateway runs Telegram, the scheduled briefings, and the API the voice client talks to."
if yes_no "Install it as a background service that starts at login?" y; then
  hermes gateway install && ok "Gateway service installed"
else
  info "Start it yourself when needed: hermes gateway start"
fi
info "Scheduled routines (briefing, review, nightly consolidation, tidy-up) run on Hermes by default."
menu "Where should Jarvis's scheduled routines run?" \
  "Hermes (recommended: delivers to Telegram, uses Sonnet 5 / GPT-6 Luna)" \
  "Claude Code on this Mac (launchd runs claude -p; notifications on the Mac)" \
  "Codex on this Mac (launchd runs codex exec)" \
  "Decide later (onboarding sets them up on Hermes)"
case $REPLY in
  2) "$ROOT/bin/jarvis" schedule install --runner launchd-claude ;;
  3) "$ROOT/bin/jarvis" schedule install --runner launchd-codex ;;
  *) info "Onboarding will create the jobs on Hermes. Change later: jarvis schedule install --runner <runner>" ;;
esac

# ---------------------------------------------------------------- 7. Voice
step "Talk to Jarvis at your desk (optional)"
info "Say \"Jarvis, ...\" or hold Caps Lock to talk. Quick Mac commands, web tasks in Chrome, and"
info "everything else answered by Jarvis out loud. Needs Homebrew; downloads the voice app if needed."
yes_no "Set up desk voice now?" y && setup_voice

# ---------------------------------------------------------------- 8. Existing files
step "Existing files (optional)"
info "Jarvis can look through Documents, Desktop, Downloads, iCloud Drive and cloud-drive folders for"
info "client, project and work folders, then offer to bring them in during onboarding."
info "Only folder and file names, sizes and dates are read. Your files aren't opened, moved or changed."
if yes_no "Look for existing folders now?" y; then
  python3 "$ROOT/bin/scan_folders.py" --out "$KNOWLEDGE/inbox/.import-scan.json" \
    && info "Jarvis will go through these with you during onboarding (or say \"import my files\" any time)." \
    || warn "The scan didn't finish. Jarvis can run it later: say \"scan my documents\"."
else
  info "Skipped. Say \"import my files\" to Jarvis whenever you like."
fi

# ---------------------------------------------------------------- 9. Done
step "Done"
info "Open your second brain in Obsidian: File → Open folder as vault → $KNOWLEDGE"
command -v open >/dev/null && [[ -d /Applications/Obsidian.app ]] && yes_no "Open it in Obsidian now?" y && open -a Obsidian "$KNOWLEDGE"
print
print -P "  Now say hi:  %F{yellow}hermes --tui%f   (or the Hermes app, or your Telegram bot)"
print -P "  Jarvis starts onboarding on its own. Skip anything; say %F{yellow}finish onboarding%f later."
[[ -x $HOME/.local/bin/jarvis-voice ]] && print -P "  Desk voice:  %F{yellow}jarvis-voice%f   then say \"Jarvis, what's on today?\""
