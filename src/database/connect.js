const mongoose = require("mongoose");
const { logger } = require("../logger");

let isConnected = false;
let connectingPromise = null;

async function connectToMongo(uri) {
  if (!uri) {
    logger.warn({}, "MongoDB URI não fornecida. Usando armazenamento local JSON.");
    return false;
  }

  if (isConnected) return true;

  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    try {
      await mongoose.connect(uri, {
        dbName: "discord_bot_db"
      });
      isConnected = true;
      logger.info({}, "MongoDB conectado com sucesso.");
      return true;
    } catch (error) {
      logger.error({ err: error }, "Falha ao conectar ao MongoDB.");
      return false;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

function isMongoConnected() {
  return isConnected;
}

module.exports = { connectToMongo, isMongoConnected };
