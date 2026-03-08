const { Events } = require("discord.js");
const { logger } = require("../logger");
const { createVipExpiryManager } = require("../vip/vipExpiryManager");
const { createDataStore } = require("../store/dataStore");

// Inicializa o store de manutenção para checagem no login
const maintenanceStore = createDataStore("maintenance.json");

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
  },

  cleanup: stopVoiceXpTimer
};