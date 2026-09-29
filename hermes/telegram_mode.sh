#!/bin/zsh
# Configure how Jarvis appears in Telegram. Used by setup.sh and by the jarvis-telegram skill.
#
#   telegram_mode.sh dm             one normal DM conversation
#   telegram_mode.sh dm-topics      topics inside your DM: Inbox, Work, Life, Briefings, General
#   telegram_mode.sh group-topics   a supergroup with forum topics (answers only when mentioned)
#   telegram_mode.sh link-briefings send scheduled briefings into the Briefings topic (run after the
#                                   gateway has restarted once in dm-topics mode)
#   telegram_mode.sh status
#
# Needs the Telegram bot connected first (hermes gateway setup), so your user ID is known.
set -e
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
ENV="$HERMES_HOME/.env"
export PATH="$HOME/.local/bin:$PATH"

env_get() { [[ -f $ENV ]] && grep "^$1=" "$ENV" | tail -1 | cut -d= -f2- | tr -d '"'"'"; }
env_set() {
  touch "$ENV"; chmod 600 "$ENV"
  if grep -q "^$1=" "$ENV"; then sed -i '' "s|^$1=.*|$1=$2|" "$ENV"; else print "$1=$2" >> "$ENV"; fi
}
set_cfg() { hermes config set "$1" "$2" --force >/dev/null; }

user_id() {
  local id; id=$(env_get TELEGRAM_ALLOWED_USERS | cut -d, -f1 | tr -d ' ')
  if [[ -z $id ]]; then
    print "Telegram isn't connected yet (no TELEGRAM_ALLOWED_USERS). Run: hermes gateway setup" >&2
    exit 2
  fi
  print "$id"
}

case "$1" in
  dm)
    set_cfg platforms.telegram.extra.dm_topics "[]"
    set_cfg telegram.require_mention false
    print "Telegram mode: normal DM. Restart the gateway: hermes gateway restart"
    ;;

  dm-topics)
    id=$(user_id)
    set_cfg platforms.telegram.extra.dm_topics "[{'chat_id': $id, 'topics': [
      {'name': 'Inbox', 'skill': 'brain-ingest', 'icon_color': 7322096},
      {'name': 'Work', 'icon_color': 9367192},
      {'name': 'Life', 'icon_color': 16766590},
      {'name': 'Briefings', 'icon_color': 13338331},
      {'name': 'General', 'icon_color': 16749490}]}]"
    set_cfg platforms.telegram.extra.ignore_root_dm false
    cat <<'EOF'
Telegram mode: topics in your DM (Inbox, Work, Life, Briefings, General).
One step in Telegram first:
  1. Search "botfather" in Telegram and tap Open (the Mini App, not the /mybots text menu)
  2. My bots → your bot → Bot Settings → Threads Settings → turn on Threaded Mode
Then: hermes gateway restart     (Hermes creates the topics)
Then: telegram_mode.sh link-briefings   (so briefings arrive in the Briefings topic)
EOF
    ;;

  link-briefings)
    thread=$(python3 - "$HERMES_HOME/config.yaml" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
m = re.search(r"-\s*name:\s*['\"]?Briefings['\"]?\s*\n(?:\s+(?!-).*\n)*?\s+thread_id:\s*['\"]?(\d+)", text)
print(m.group(1) if m else "")
PY
)
    if [[ -z $thread ]]; then
      print "The Briefings topic hasn't been created yet. Turn on Threaded Mode, restart the gateway, then retry." >&2
      exit 3
    fi
    env_set TELEGRAM_HOME_CHANNEL "$(user_id)"
    env_set TELEGRAM_CRON_THREAD_ID "$thread"
    print "Briefings and scheduled messages will arrive in the Briefings topic (thread $thread)."
    print "Restart the gateway: hermes gateway restart"
    ;;

  group-topics)
    set_cfg telegram.require_mention true
    set_cfg telegram.exclusive_bot_mentions true
    cat <<'EOF'
Telegram mode: a group with topics. Jarvis answers only when @mentioned or replied to.
In Telegram:
  1. Create a group, then Group settings → Topics → on (it becomes a supergroup with topics)
  2. Add your bot to the group and make it an admin (so it can see messages)
  3. Only people in TELEGRAM_ALLOWED_USERS can trigger Jarvis. Add colleagues' IDs there if you want
     them to use it, and remember Jarvis never shares your private areas in groups.
Each topic is its own conversation automatically. Scheduled briefings stay in your private DM.
Then: hermes gateway restart
EOF
    ;;

  status)
    print "TELEGRAM_ALLOWED_USERS=$(env_get TELEGRAM_ALLOWED_USERS)"
    print "TELEGRAM_CRON_THREAD_ID=$(env_get TELEGRAM_CRON_THREAD_ID)"
    grep -n -A12 'dm_topics' "$HERMES_HOME/config.yaml" | head -14 || true
    grep -n 'require_mention' "$HERMES_HOME/config.yaml" || true
    ;;

  *)
    sed -n '2,11p' "$0"; exit 1 ;;
esac
