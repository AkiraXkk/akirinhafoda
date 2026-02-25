const { Events } = require("discord.js");
const { logger } = require("../logger");
const { createVipExpiryManager } = require("../vip/vipExpiryManager");

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(readyClient, client) {
    logger.info({ user: readyClient.user.tag }, "Bot online");

    if (client?.services?.vip && client?.services?.vipRole && client?.services?.vipChannel) {
      const expiry = createVipExpiryManager({
        client,
        vipService: client.services.vip,
        vipRoleManager: client.services.vipRole,
        vipChannelManager: client.services.vipChannel,
      });

      expiry.start({ intervalMs: 5 * 60 * 1000 });
    }

    // Voice XP Loop
    // Movido do index.js para o evento ready
    setInterval(async () => {
        const levelsCommand = client.commands.get("level");
        const economyCommand = client.commands.get("economy");
        if (!levelsCommand || !economyCommand) return;
        
        try {
            for (const guild of client.guilds.cache.values()) {
                for (const state of guild.voiceStates.cache.values()) {
                    if (state.member.user.bot) continue;
                    if (state.mute || state.deaf) continue;
                    if (!state.channelId) continue;
                    
                    await levelsCommand.addXp(state.member.id, 60);
                    
                    if (economyCommand.addCoins) {
                        await economyCommand.addCoins(state.member.id, 20);
                    }
                }
            }
        } catch (e) {
            logger.error({ err: e }, "Erro no Voice XP");
        }
    }, 60000); // 1 minuto
  },
};
