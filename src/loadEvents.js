const fs = require("node:fs");
const path = require("node:path");

function loadEvents(client, { logger } = {}) {
  const eventsPath = path.join(__dirname, "events");
  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    try {
      const event = require(filePath);
      if (!event?.name || typeof event.execute !== "function") {
        logger?.warn?.({ file }, "Evento inválido ignorado (sem name ou execute)");
        continue;
      }
      const handler = async (...args) => {
        try {
          await event.execute(...args, client);
        } catch (err) {
          logger?.error?.({ err, event: event.name }, "Erro não capturado em evento");
        }
      };
      if (event.once) {
        client.once(event.name, handler);
      } else {
        client.on(event.name, handler);
      }
    } catch (err) {
      logger?.error?.({ err, file }, "Erro ao carregar evento");
    }
  }
}

module.exports = { loadEvents };
