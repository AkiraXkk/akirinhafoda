const fs = require("node:fs");
const path = require("node:path");

function loadCommands({ logger } = {}) {
  const commandsPath = path.join(__dirname, "commands");
  const commandFiles = fs
    .readdirSync(commandsPath, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".js"))
    .map((d) => d.name);

  const commands = new Map();
  const commandsJson = [];

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
      const command = require(filePath);

      if (!command?.data?.name || typeof command.execute !== "function") {
        logger?.warn?.({ file }, "Comando inválido ignorado (sem data.name ou execute)");
        continue;
      }

      commands.set(command.data.name, command);
      commandsJson.push(command.data.toJSON());
    } catch (err) {
      logger?.error?.({ err, file }, "Erro ao carregar comando");
    }
  }

  logger?.info?.({ count: commands.size }, "Comandos carregados");
  return { commands, commandsJson };
}

module.exports = { loadCommands };
