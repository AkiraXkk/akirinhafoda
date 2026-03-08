# Copilot Instructions

## Project Overview

This is a Discord bot built with [discord.js v14](https://discord.js.org/) and Node.js 18+. It provides slash commands for VIP management, economy, moderation, games, and server utilities. Data is persisted via MongoDB (Mongoose) and the bot uses Pino for structured logging.

## Tech Stack

- **Runtime:** Node.js ≥ 18
- **Discord library:** discord.js v14 (slash commands, `Interaction`-based)
- **Database:** MongoDB via Mongoose
- **Logging:** Pino / pino-pretty
- **Canvas:** `canvas` + `canvacord` for image generation
- **HTTP:** Express (lightweight internal endpoints)

## Repository Structure

```
src/
  commands/       # One file per slash command, exports { data, execute }
  events/         # One file per Discord event, exports { name, execute }
  config/         # Configuration helpers and constants
  database/       # Mongoose models and DB connection logic
  services/       # Business logic shared between commands
  store/          # File-backed stores (e.g. data/vips.json)
  utils/          # Generic utility helpers
  vip/            # VIP-specific helpers
  embeds.js       # Shared embed factory (createEmbed)
  loadCommands.js # Registers commands into client.commands
  loadEvents.js   # Registers event listeners
  index.js        # Bot entry point
scripts/
  deploy-commands.js  # Pushes slash commands to Discord
data/             # JSON flat-file data (gitignored secrets stay in .env)
```

## Development Setup

1. `npm install`
2. Copy `.env.example` → `.env` and fill in:
   - `DISCORD_TOKEN` – bot token (never commit this)
   - `CLIENT_ID` – application/client ID
   - `GUILD_ID` – guild ID for dev guild command registration (optional)
   - `LOG_LEVEL` – pino log level (default `info`)
   - `VIP_STORE_PATH` – path to VIP JSON store (default `data/vips.json`)
3. Register slash commands: `npm run deploy-commands`
4. Start the bot: `npm start` (or `npm run dev` for watch mode)

## Coding Conventions

- **CommonJS (`require`/`module.exports`)** — do not use ESM (`import`/`export`).
- **Async/await** everywhere; avoid raw `.then()` chains.
- **Slash commands** follow the pattern:
  ```js
  module.exports = {
    data: new SlashCommandBuilder().setName("...").setDescription("..."),
    async execute(interaction) { ... },
  };
  ```
- **Embeds** use the shared `createEmbed()` factory from `src/embeds.js` — do not construct `EmbedBuilder` manually in commands.
- **Logging** uses the Pino logger from `src/logger.js` — do not use `console.log` for runtime output.
- **Error handling** — always `try/catch` inside `execute()` and reply with an ephemeral error message so the interaction is never left unanswered.
- **Permissions** — admin-only commands check `interaction.member.permissions.has("ManageGuild")` (or the specific required permission) before acting.
- **Environment variables** — access via `process.env`; validate at startup in `src/config.js`, never inline string literals for tokens or IDs.

## Adding a New Command

1. Create `src/commands/<name>.js` following the slash command pattern above.
2. Re-run `npm run deploy-commands` to register it with Discord.
3. No manual registration is needed — `loadCommands.js` auto-discovers all files in `src/commands/`.

## Adding a New Event

1. Create `src/events/<EventName>.js` exporting `{ name, execute }`.
2. `loadEvents.js` auto-discovers all files in `src/events/`.

## Security Notes

- **Never commit `.env`** or any file containing secrets. `.env` is already in `.gitignore`.
- If a token is leaked, regenerate it immediately on the Discord Developer Portal.
- Validate and sanitize all user-supplied input (command options) before using it in database queries or shell calls.
