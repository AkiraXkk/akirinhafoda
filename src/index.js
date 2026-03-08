// ============================================================
//  index.js  —  Refatorado
//  Novidades:
//   • Passa vipBaseRoleId, vipRoleSeparatorId, familyRoleSeparatorId
//     e cargoFantasmaId para o vipService via setGuildConfig
//   • vipRole agora expõe assignTierRole / removeTierRole
//   • Registra handler de vipConfig.removeTier e updateTier
//     para suporte a Cotas Avançadas (cotasConfig)
// ============================================================

const { Client, GatewayIntentBits } = require("discord.js");
const { config }          = require("./config");
const { logger }          = require("./logger");
const { loadCommands }    = require("./loadCommands");
const { loadEvents }      = require("./loadEvents");

const { createVipStore }          = require("./vip/vipStore");
const { createVipService }        = require("./vip/vipService");
const { createVipRoleManager }    = require("./vip/vipRoleManager");
const { createVipChannelManager } = require("./vip/vipChannelManager");
const { createVipConfigManager }  = require("./vip/vipConfigManager");
const { createVipExpiryManager }  = require("./vip/vipExpiryManager");

const { connectToMongo }          = require("./database/connect");

const { createLogService }        = require("./services/logService");
const { createEconomyService }    = require("./services/economyService");
const { createFamilyService }     = require("./services/familyService");
const { createPresenceService }   = require("./services/presenceService");
const { createTagRoleService }    = require("./services/tagRoleService");
const { createTagRoleManager }    = require("./services/tagRoleManager");
const { createShopService }       = require("./services/shopService");
const { createShopExpiryManager } = require("./services/shopExpiryManager");

function createClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMembers,
    ],
  });
}

async function main() {
  const client = createClient();
  await connectToMongo(config.mongo.uri);

  const { commands } = loadCommands({ logger });
  client.commands  = commands;
  client.services  = {};

  // ── Serviços gerais ──────────────────────────────────────────────────────────
  client.services.log      = createLogService({ client });
  client.services.economy  = createEconomyService();
  client.services.family   = createFamilyService();
  client.services.presence = createPresenceService();

  client.services.tagRole  = createTagRoleService({ logger });
  client.services.tagRoleManager = createTagRoleManager({
    client,
    tagRoleService: client.services.tagRole,
    targetGuildId:  config.discord.guildId,
    logger,
  });

  client.services.shop       = createShopService({ logger });
  client.services.shopExpiry = createShopExpiryManager({
    client,
    shopService: client.services.shop,
    logger,
  });

  // ── Sistema VIP ──────────────────────────────────────────────────────────────
  const vipStore = createVipStore({ filePath: config.vip.storePath });

  client.services.vipConfig = createVipConfigManager();

  client.services.vip = createVipService({
    store:         vipStore,
    logger,
    configManager: client.services.vipConfig,
    client,
  });
  await client.services.vip.init();

  client.services.vipRole = createVipRoleManager({
    client,
    vipService: client.services.vip,
    logger,
  });

  client.services.vipChannel = createVipChannelManager({
    client,
    vipService: client.services.vip,
    logger,
  });

  client.services.vipExpiry = createVipExpiryManager({
    client,
    vipService:      client.services.vip,
    vipRoleManager:  client.services.vipRole,
    vipChannelManager: client.services.vipChannel,
    familyService:   client.services.family,
    logger,
  });
  client.services.vipExpiry.start();

  // ── Eventos e inicialização ───────────────────────────────────────────────────
  loadEvents(client, { logger });

  await client.services.tagRoleManager.start().catch((err) => {
    logger.warn({ err }, "TagRole manager falhou ao iniciar");
  });
  client.services.shopExpiry?.start?.();

  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "UnhandledRejection");
  });

  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "UncaughtException");
    process.exitCode = 1;
  });

  await client.login(config.discord.token);
}

main().catch((error) => {
  logger.fatal({ err: error }, "Falha ao iniciar");
  process.exitCode = 1;
});
