const { REST, Routes } = require("discord.js");
const { config } = require("../src/config");
const { logger } = require("../src/logger");
const { loadCommands } = require("../src/loadCommands");

async function deploy() {
  const { commandsJson } = loadCommands({ logger });

  const rest = new REST({ version: "10" }).setToken(config.discord.token);

  const route = config.discord.guildId
    ? Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId)
    : Routes.applicationCommands(config.discord.clientId);

  if (!config.discord.guildId) {
    logger.warn("Registrando comandos GLOBALMENTE. Isso pode levar até 1 hora para atualizar no Discord.");
  }

  const scope = config.discord.guildId ? { guildId: config.discord.guildId } : { global: true };
  logger.info({ ...scope, count: commandsJson.length }, "Registrando comandos");

  await rest.put(route, { body: commandsJson });

  logger.info({ ...scope, count: commandsJson.length }, "Comandos registrados");
}

deploy().catch((error) => {
  logger.fatal({ err: error }, "Falha ao registrar comandos");
  process.exitCode = 1;
});
