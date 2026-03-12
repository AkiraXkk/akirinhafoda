const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { logger } = require("../logger");
const { createVipExpiryManager } = require("../vip/vipExpiryManager");
const { createDataStore } = require("../store/dataStore");
const { createEmbed } = require("../embeds");
const { enviarAvaliacaoDM } = require("../utils/avaliacaoDM");
const { cacheAllGuilds } = require("../services/inviteTracker");

// Inicializa o store de manutenção para checagem no login
const maintenanceStore = createDataStore("maintenance.json");

// Stores dos tickets para o Monitor de SLA
const slaTicketStore = createDataStore("tickets.json");
const slaChatStore = createDataStore("sejawda_chats.json");
const slaSetupStore = createDataStore("ticket_setup.json");

// IDs Fixos da WDA (Sincronizado com ticket.js / sejawda.js)
const CATEGORIA_FECHADOS_ID = "1097361304756433019";

// Constantes de SLA
const SLA_PING_STAFF_MS = 30 * 60 * 1000;     // 30 minutos
const SLA_PING_EVERYONE_MS = 90 * 60 * 1000;  // 1h30m
const SLA_AUTO_CLOSE_MS = 2 * 60 * 60 * 1000; // 2 horas
const SLA_CHECK_INTERVAL_MS = 5 * 60 * 1000;  // Verifica a cada 5 minutos

let voiceXpTimer = null;
let voiceXpProcessing = false;

function stopVoiceXpTimer() {
  if (voiceXpTimer) {
    clearInterval(voiceXpTimer);
    voiceXpTimer = null;
    logger.info("Voice XP timer stopped");
  }
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(readyClient, client) {
    logger.info({ user: readyClient.user.username }, "Bot online");

    // --- 0. INVITE TRACKER — Cacheia todos os convites ---
    try {
      await cacheAllGuilds(client);
      logger.info("[InviteTracker] Cache de convites inicializado com sucesso");
    } catch (err) {
      logger.warn({ err }, "[InviteTracker] Falha ao inicializar cache de convites");
    }

    // --- 1. GESTÃO DE PRESENÇA ---
    const presenceService = client?.services?.presence;
    if (presenceService) {
      // Aplica o status salvo anteriormente
      if (presenceService.applyPresence) {
      presenceService.applyPresence(readyClient).catch((err) => {
          logger.warn({ err }, "Falha ao aplicar presença salva");
        });
      }
      // Inicia a rotação aleatória de frases, se configurada
      if (presenceService.startRotation) {
        presenceService.startRotation(readyClient);
      }
    }

    // --- 2. PERSISTÊNCIA DA MANUTENÇÃO ---
    // Verifica se o bot "caiu" enquanto estava em manutenção
    const mConfig = await maintenanceStore.load();
    if (mConfig["global"]?.enabled) {
      if (presenceService?.startMaintenanceLoop) {
        // Retoma o loop de atualização da embed a cada 2 minutos
        presenceService.startMaintenanceLoop(readyClient, mConfig["global"]);
        logger.info("🛠️ Modo de manutenção detectado: Retomando loop de atualização.");
      }
    }

    // --- 3. GESTÃO DE EXPIRAÇÃO VIP (Original) ---
    if (client?.services?.vipExpiry?.start) {
      client.services.vipExpiry.start({ intervalMs: 5 * 60 * 1000 });
    } else if (client?.services?.vip && client?.services?.vipRole && client?.services?.vipChannel) {
      const expiry = createVipExpiryManager({
        client,
        vipService: client.services.vip,
        vipRoleManager: client.services.vipRole,
        vipChannelManager: client.services.vipChannel,
        familyService: client.services.family,
      });

      expiry.start({ intervalMs: 5 * 60 * 1000 });
    }

    // --- 4. SISTEMA DE XP POR VOZ (Original) ---
    stopVoiceXpTimer();
    voiceXpTimer = setInterval(async () => {
        if (voiceXpProcessing) return;
        voiceXpProcessing = true;

        const levelsCommand = client.commands.get("rank");
        const economyService = client.services?.economy;
        if (!levelsCommand || !economyService) { voiceXpProcessing = false; return; }

        try {
            for (const guild of client.guilds.cache.values()) {
                for (const state of guild.voiceStates.cache.values()) {
                    const member = state.member;
                    if (!member || member.user.bot) continue;
                    if (state.mute || state.deaf) continue;
                    if (!state.channelId) continue;

                    const { subiuNivel, novoNivel, nivelAnterior } = await levelsCommand.addXpForVoiceTick(member, 1);
                    if (subiuNivel && levelsCommand.applyLevelRoles) {
                      await levelsCommand.applyLevelRoles(member, nivelAnterior, novoNivel);
                    }
                    if (economyService?.addCoins) {
                        await economyService.addCoins(guild.id, member.id, 20);
                    }
                }
            }
        } catch (e) {
            logger.error({ err: e }, "Erro no Voice XP");
        } finally {
            voiceXpProcessing = false;
        }
    }, 60000);

    logger.info("Voice XP timer started");

    // --- 5. MONITOR DE SLA DOS TICKETS ---
    setInterval(async () => {
      try {
        const now = Date.now();

        // ── Verificar tickets (ticket.js) ──
        const tickets = await slaTicketStore.load();
        for (const [channelId, info] of Object.entries(tickets)) {
          if (channelId === "counters" || !info || info.closedAt || !info.lastMessageAt) continue;

          const elapsed = now - info.lastMessageAt;
          const channel = await client.channels.fetch(channelId).catch(() => null);
          if (!channel) continue;

          // Regra 3: Auto-close após 2h sem resposta do usuário (após staff responder)
          if (info.lastMessageBy === "staff" && elapsed >= SLA_AUTO_CLOSE_MS) {
            try {
              await channel.permissionOverwrites.edit(info.userId, { ViewChannel: false });
              const guild = channel.guild;
              const memberCreator = await guild.members.fetch(info.userId).catch(() => null);
              const username = memberCreator ? memberCreator.user.username.toLowerCase().replace(/\s+/g, "-") : "usuario";
              const tId = info.ticketId || "old000";

              await channel.setName(`fechado-${username}-${tId}`);
              await channel.setParent(CATEGORIA_FECHADOS_ID, { lockPermissions: false });
            } catch (e) {
              logger.warn({ err: e, channelId }, "[SLA] Permissões insuficientes para renomear/mover ticket");
            }

            await slaTicketStore.update(channelId, (data) => data ? { ...data, closedAt: Date.now() } : null);

            const embedArquivado = createEmbed({
              title: "🔒 Ticket Arquivado (Auto-Close)",
              description: `O membro não possui mais acesso a este canal.\n📋 **Motivo:** Inatividade do Usuário\n\nEquipe: Quando não for mais necessário manter o histórico, clique abaixo para excluir definitivamente.`,
              color: 0x95a5a6
            });
            const rowAdmin = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("delete_ticket_btn").setLabel("Deletar Canal").setStyle(ButtonStyle.Danger).setEmoji("🗑️"));
            await channel.send({ embeds: [embedArquivado], components: [rowAdmin] }).catch(() => {});

            // NPS DM
            try {
              const userToRate = await client.users.fetch(info.userId).catch(() => null);
              if (userToRate) await enviarAvaliacaoDM(userToRate, client.user.id, channel.guild.id);
            } catch (_) {}

            logger.info({ channelId }, "[SLA] Ticket fechado automaticamente por inatividade do usuário");
            continue;
          }

          // Regra 1: Ping staff após 30 minutos
          if (info.lastMessageBy === "user" && elapsed >= SLA_PING_STAFF_MS && !info.ping30Sent) {
            let roleId = null;
            if (info.ticketType) {
              const setupData = await slaSetupStore.load();
              const typeSetup = (setupData[info.guildId || channel.guild?.id] || {})[info.ticketType] || {};
              roleId = typeSetup.roleId;
            }
            const pingContent = roleId
              ? `<@&${roleId}> ⚠️ Atenção, este ticket aguarda resposta há 30 minutos!`
              : `⚠️ Atenção, este ticket aguarda resposta há 30 minutos!`;
            await channel.send(pingContent).catch(() => {});
            await slaTicketStore.update(channelId, (data) => data ? { ...data, ping30Sent: true } : null);
          }

          // Regra 2: Ping @everyone após 1h30m
          if (info.lastMessageBy === "user" && elapsed >= SLA_PING_EVERYONE_MS && !info.ping90Sent) {
            await channel.send(`@everyone ⚠️ ALERTA DE SLA: O usuário aguarda resposta há mais de 1 hora e meia!`).catch(() => {});
            await slaTicketStore.update(channelId, (data) => data ? { ...data, ping90Sent: true } : null);
          }
        }

        // ── Verificar chats sejawda ──
        const chats = await slaChatStore.load();
        for (const [channelId, info] of Object.entries(chats)) {
          if (channelId === "counters" || !info || info.closedAt || !info.lastMessageAt) continue;

          const elapsed = now - info.lastMessageAt;
          const channel = await client.channels.fetch(channelId).catch(() => null);
          if (!channel) continue;

          // Regra 3: Auto-close após 2h sem resposta do usuário
          if (info.lastMessageBy === "staff" && elapsed >= SLA_AUTO_CLOSE_MS) {
            try {
              await channel.permissionOverwrites.edit(info.userId, { ViewChannel: false });
              const guild = channel.guild;
              const memberCreator = await guild.members.fetch(info.userId).catch(() => null);
              const username = memberCreator ? memberCreator.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "-") : "usuario";

              await channel.setName(`fechado-${username}-${info.ticketId}`);
              await channel.setParent(CATEGORIA_FECHADOS_ID, { lockPermissions: false });
            } catch (e) {
              logger.warn({ err: e, channelId }, "[SLA] Permissões insuficientes para renomear/mover chat sejawda");
            }

            await slaChatStore.update(channelId, (data) => data ? { ...data, closedAt: Date.now() } : null);

            const embedArquivado = createEmbed({
              title: "🔒 Solicitação Arquivada (Auto-Close)",
              description: `O membro não possui mais acesso a este canal.\n📋 **Motivo:** Inatividade do Usuário\n\nEquipe: Quando não for mais necessário manter o histórico, clique abaixo para excluir definitivamente.`,
              color: 0x95a5a6
            });
            const rowAdmin = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("sejawda_delete").setLabel("Deletar Canal").setStyle(ButtonStyle.Danger).setEmoji("🗑️"));
            await channel.send({ embeds: [embedArquivado], components: [rowAdmin] }).catch(() => {});

            // NPS DM
            try {
              const userToRate = await client.users.fetch(info.userId).catch(() => null);
              if (userToRate) await enviarAvaliacaoDM(userToRate, client.user.id, channel.guild.id);
            } catch (_) {}

            logger.info({ channelId }, "[SLA] Chat sejawda fechado automaticamente por inatividade do usuário");
            continue;
          }

          // Regra 1: Ping staff após 30 minutos
          if (info.lastMessageBy === "user" && elapsed >= SLA_PING_STAFF_MS && !info.ping30Sent) {
            const roleId = info.staffRoleId;
            const pingContent = roleId
              ? `<@&${roleId}> ⚠️ Atenção, esta solicitação aguarda resposta há 30 minutos!`
              : `⚠️ Atenção, esta solicitação aguarda resposta há 30 minutos!`;
            await channel.send(pingContent).catch(() => {});
            await slaChatStore.update(channelId, (data) => data ? { ...data, ping30Sent: true } : null);
          }

          // Regra 2: Ping @everyone após 1h30m
          if (info.lastMessageBy === "user" && elapsed >= SLA_PING_EVERYONE_MS && !info.ping90Sent) {
            await channel.send(`@everyone ⚠️ ALERTA DE SLA: O usuário aguarda resposta há mais de 1 hora e meia!`).catch(() => {});
            await slaChatStore.update(channelId, (data) => data ? { ...data, ping90Sent: true } : null);
          }
        }
      } catch (err) {
        logger.error({ err }, "[SLA] Erro no monitor de SLA de tickets");
      }
    }, SLA_CHECK_INTERVAL_MS);

    logger.info("Monitor de SLA de tickets iniciado (intervalo: 5 minutos)");
  },

  cleanup: stopVoiceXpTimer
};