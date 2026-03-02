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
      client.services.vipExpiryManager = expiry;
      expiry.start({ intervalMs: 5 * 60 * 1000 });
    }

    setInterval(async () => {
      const levelsService = client.services?.levels;
      const economyService = client.services?.economy;
      const vipConfig = client.services?.vipConfig;
      if (!levelsService || !economyService) return;

      try {
        for (const guild of client.guilds.cache.values()) {
          for (const state of guild.voiceStates.cache.values()) {
            if (!state.member || state.member.user.bot) continue;
            if (state.mute || state.deaf || !state.channelId) continue;

            const vipTier = vipConfig ? await vipConfig.getMemberTier(state.member) : null;
            await levelsService.addXp(state.member.id, 60, { vipTier });
            await economyService.addCoins(state.member.id, 20);
          }
        }
      } catch (e) {
        logger.error({ err: e }, "Erro no Voice XP");
      }
    }, 60000);
  },
};
