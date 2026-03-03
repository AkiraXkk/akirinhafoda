const { Events } = require("discord.js");
const { logger } = require("../logger");
const { createVipExpiryManager } = require("../vip/vipExpiryManager");

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(readyClient, client) {
    logger.info({ user: readyClient.user.tag }, "Bot online");

    if (client?.services?.presence?.applyPresence) {
      client.services.presence.applyPresence(readyClient).catch(() => {});
    }

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

    setInterval(async () => {
        const levelsCommand = client.commands.get("rank");
        const economyService = client.services?.economy;
        if (!levelsCommand || !economyService) return;
        
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
        }
    }, 60000);
  },
};
