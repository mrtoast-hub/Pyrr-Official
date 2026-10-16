PYRR OFFICIAL — REBUILT PREFIX BOT
==================================

Requirements:
- Node.js 22+
- discord.js v14 (installed with npm install)
- Message Content Intent and Server Members Intent enabled in Discord Developer Portal

Files:
- index.js: single-file bot source
- package.json: dependencies and start/check commands
- .env.example: environment variable names only

FadeHost setup:
1. Upload/extract this ZIP into the bot project directory.
2. Set DISCORD_TOKEN in the hosting panel's environment variables.
3. Set BOT_OWNER_ID to your Discord user ID (optional but recommended).
4. Enable Server Members Intent and Message Content Intent in the Discord Developer Portal.
5. Install dependencies with npm install, then start with npm start.

Prefix:
,help
,ping
,antinuke on|off
,antiraid on|off
,automod on|off
,welcome #channel
,leave #channel
,setlog #channel
,ticketpanel
,ticketclose

Important:
- This build uses comma-prefix commands only. It does not register slash commands.
- AntiNuke and AntiRaid features are alert/logging tools; they do not automatically punish users.
- Auto-reaction is opt-in and can be enabled by an administrator with ,autoreact on ✨ [#channel].
- Giveaways/reminders use in-memory timers and may not survive a process restart.
- Keep your bot token private. Never commit a token into a public repository.
- Static syntax can be checked with npm run check.
