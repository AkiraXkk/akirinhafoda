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
const { createLogManager }        = require("./services/logManager");
const { createEconomyService }    = require("./services/economyService");
const { createFamilyService }     = require("./services/familyService");
const { createPresenceService }   = require("./services/presenceService");
const { createTagRoleService }    = require("./services/tagRoleService");
const { createTagRoleManager }    = require("./services/tagRoleManager");
const { createShopService }       = require("./services/shopService");
const { createShopExpiryManager } = require("./services/shopExpiryManager");

// 👇 Opcional: Se você ativou o AutoBump das parcerias, descomente a linha abaixo 👇
// const { createPartnershipNotifier } = require("./services/partnershipNotifier");

function createClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences, 
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
  client.services.log        = createLogService({ client });
  client.services.logManager = createLogManager({ client });
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

  // =====================================================================
  // 🌟 SISTEMA ANTI-CRASH DE EVENTOS/SORTEIOS
  // =====================================================================
  client.once("ready", () => {
    logger.info("Verificador Anti-Crash de Sorteios iniciado!");

    setInterval(() => {
      try {
        const eventoCmd = client.commands.get("evento"); 
        if (eventoCmd && typeof eventoCmd.checkSorteios === "function") {
          eventoCmd.checkSorteios(client);
        }
      } catch (err) {
        logger.error({ err }, "Falha ao executar o verificador de Sorteios");
      }
    }, 60000);
  });
  // =====================================================================

  // =====================================================================
  // 💬 TERMINAL GOD MODE (CHAT & EXECUTE CLI)
  // =====================================================================
  client.once("ready", () => {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    let canalAtualId = null;

    logger.info("Terminal God Mode Online! Comandos: 'chat ID', 'executar NOME', ou digite para falar.");

    rl.on('line', async (input) => {
        if (!input || input.trim() === '') return;
        
        const args = input.trim().split(' ');
        const comando = args[0].toLowerCase();

        // --- LÓGICA: SELECIONAR CANAL ---
        if (comando === 'chat') {
            const id = args[1];
            if (!id) {
                console.log("\x1b[33m[AVISO] Use: chat ID_DO_CANAL\x1b[0m");
                return;
            }
            try {
                const canal = await client.channels.fetch(id);
                if (canal && canal.isTextBased()) {
                    canalAtualId = id;
                    console.log(`\x1b[32m[SISTEMA] Conectado a: #${canal.name} (${canal.guild.name})\x1b[0m`);
                } else {
                    console.log("\x1b[31m[ERRO] Canal inválido ou sem permissão.\x1b[0m");
                }
            } catch (e) {
                console.log("\x1b[31m[ERRO] Não encontrei o canal. Verifique o ID.\x1b[0m");
            }
            return;
        }

        // --- LÓGICA: EXECUTAR COMANDO COM SUPORTE A SUBCOMANDOS ---
        if (comando === 'executar') {
            const nomeCmd = args[1];
            const subCmd  = args[2] || null; // Pega o "ver", "coins", etc.
            const cmd = client.commands.get(nomeCmd);

            if (!cmd) {
                console.log(`\x1b[31m[ERRO] Comando "/${nomeCmd}" não encontrado.\x1b[0m`);
                return;
            }

            if (!canalAtualId) {
                console.log("\x1b[33m[AVISO] Conecte-se a um chat primeiro! Use: chat ID\x1b[0m");
                return;
            }

            try {
                const canal = await client.channels.fetch(canalAtualId);
                console.log(`\x1b[35m[TERMINAL] Executando /${nomeCmd} ${subCmd || ''} em #${canal.name}...\x1b[0m`);

                let mensagemResposta = null;

                const fakeInteraction = {
                    guild: canal.guild,
                    channel: canal,
                    user: client.user,
                    member: canal.guild.members.me,
                    commandName: nomeCmd,
                    isCommand: () => true,
                    isChatInputCommand: () => true,
                    
                    // 🛡️ NOVO: Simulador de Opções e Subcomandos
                    options: {
                        getSubcommand: () => subCmd, // Retorna o que você digitou depois do nome do comando
                        getString: () => null,
                        getInteger: () => null,
                        getUser: () => null,
                        getMember: () => null,
                        getBoolean: () => null,
                    },

                    deferReply: async () => {
                        mensagemResposta = await canal.send("⏳ *Processando comando solicitado via terminal...*");
                    },
                    editReply: async (content) => {
                        if (mensagemResposta) await mensagemResposta.edit(content);
                        else mensagemResposta = await canal.send(content);
                    },
                    reply: async (content) => {
                        mensagemResposta = await canal.send(content);
                    },
                    followUp: async (content) => {
                        await canal.send(content);
                    }
                };

                await cmd.execute(fakeInteraction);
                console.log(`\x1b[32m[SUCESSO] Comando /${nomeCmd} enviado!\x1b[0m`);

            } catch (err) {
                console.log(`\x1b[31m[ERRO NA EXECUÇÃO]: ${err.message}\x1b[0m`);
                console.error(err); // Isso ajuda a ver se falta mais alguma opção
            }
            return;
        }


        // --- LÓGICA: ENVIAR MENSAGEM SIMPLES ---
        if (canalAtualId) {
            try {
                const canal = await client.channels.fetch(canalAtualId);
                await canal.send(input);
                console.log(`\x1b[34m[VOCÊ -> #${canal.name}]:\x1b[0m ${input}`);
            } catch (err) {
                console.log(`\x1b[31m[ERRO] Falha ao enviar: ${err.message}\x1b[0m`);
            }
        } else {
            console.log("\x1b[33m[AVISO] Digite 'chat ID' para começar a falar.\x1b[0m");
        }
    });
  });
  // =====================================================================

  await client.login(config.discord.token);
}

main().catch((error) => {
  logger.fatal({ err: error }, "Falha ao iniciar");
  process.exitCode = 1;
});