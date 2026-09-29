# Connecting Telegram (for users without a bot token)

Send these steps as one short message. The token must never be pasted into this chat.

**Easiest: scan a QR code.** Open the Hermes dashboard (`hermes dashboard`) or the Hermes desktop app,
go to **Messaging → Telegram**, and press **Create with QR**. Scan it with your phone. Hermes creates
the bot, finds your user ID, saves the token and restarts the gateway. Done.

**Manual way** (if the QR option doesn't work):

1. In Telegram, open a chat with **@BotFather** (the one with the blue check).
2. Send `/newbot`.
3. Give it a display name, e.g. `Jarvis`.
4. Give it a username ending in `bot`, e.g. `alex_jarvis_bot`. It must be unique.
5. BotFather replies with a token like `123456789:AA...`. Copy it. Treat it like a password.
6. Find your own Telegram user ID: message **@userinfobot** and it replies with a number.
   This lets only you talk to Jarvis.
7. In a terminal, run:
   ```
   hermes gateway setup
   ```
   Choose Telegram, paste the token and your user ID when asked.
8. Restart the gateway (`hermes gateway restart`, or restart the Hermes app), then send your bot
   any message. Jarvis will answer there.

When Telegram is connected, multiple-choice questions show up as tap buttons, with an
"✏️ Other" button for typing your own answer.

If they get stuck: the full guide is at
https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram
