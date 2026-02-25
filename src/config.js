const dotenv = require("dotenv");

dotenv.config();

function parseBool(value, defaultValue = false) {
  if (typeof value !== "string") return defaultValue;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return defaultValue;
}

function parseIntEnv(value, defaultValue) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function getEnv(name, { required = false, defaultValue } = {}) {
  const raw = process.env[name];
  const value = typeof raw === "string" ? raw.trim() : undefined;

  if (!value && required) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }

  return value || defaultValue;
}

const config = Object.freeze({
  discord: {
    token: getEnv("DISCORD_TOKEN", { required: true }),
    clientId: getEnv("CLIENT_ID", { required: true }),
    guildId: getEnv("GUILD_ID"),
  },
  vip: {
    storePath: getEnv("VIP_STORE_PATH", { defaultValue: "data/vips.json" }),
  },
  mongo: {
    uri: getEnv("MONGO_URI"),
  },
  logLevel: getEnv("LOG_LEVEL", { defaultValue: "info" }),
});

module.exports = { config };
