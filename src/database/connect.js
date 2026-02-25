const mongoose = require("mongoose");
const { logger } = require("../logger");

let isConnected = false;

async function connectToMongo(uri) {
  if (!uri) {
    logger.warn({}, "MongoDB URI não fornecida. Usando armazenamento local JSON.");
    return false;
  }

  if (isConnected) return true;

  try {
    await mongoose.connect(uri, {
      dbName: "discord_bot_db" // Nome do banco
    });
    isConnected = true;
    logger.info({}, "MongoDB conectado com sucesso.");
    return true;
  } catch (error) {
    logger.error({ err: error }, "Falha ao conectar ao MongoDB.");
    return false;
  }
}

function isMongoConnected() {
  return isConnected;
}

module.exports = { connectToMongo, isMongoConnected };
