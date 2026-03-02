const { logger } = require("../logger");

function createVipExpiryManager({ client, vipService, vipRoleManager, vipChannelManager }) {
  async function cleanupVipUser(guildId, userId, vipEntry) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    if (vipRoleManager?.deletePersonalRole) {
      await vipRoleManager.deletePersonalRole(userId, { guildId }).catch(() => {});
    }

    if (vipChannelManager?.archiveVipChannels) {
      await vipChannelManager.archiveVipChannels(userId, { guildId }).catch(() => {});
    }

    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return;

      const tiers = client.services?.vipConfig ? await client.services.vipConfig.getGuildTiers(guildId) : {};
      const tierRoleId = tiers[vipEntry?.tierId]?.roleId;
      if (tierRoleId) {
        await member.roles.remove(tierRoleId).catch(() => {});
      }

      const guildConfig = vipService.getGuildConfig(guildId);
      if (guildConfig?.vipRoleId) {
        await member.roles.remove(guildConfig.vipRoleId).catch(() => {});
      }
    } catch (e) {
      logger.error({ err: e, userId, guildId }, "Falha ao limpar VIP expirado");
    }
  }

  async function runOnce() {
    const now = Date.now();
    let expiredCount = 0;

    for (const guild of client.guilds.cache.values()) {
      const guildId = guild.id;
      const entries = vipService.listVipEntries(guildId);

      for (const entry of entries) {
        if (!entry?.expiresAt || entry.expiresAt > now) continue;

        try {
          const removed = await vipService.removeVip(entry.userId, { guildId });
          if (!removed?.removed) continue;
          expiredCount += 1;

          await cleanupVipUser(guildId, entry.userId, removed.vip);
          logger.info({ guildId, userId: entry.userId, tierId: entry.tierId }, "VIP expirado removido e limpo");
        } catch (e) {
          logger.error({ err: e, guildId, userId: entry.userId }, "Erro ao processar expiração VIP");
        }
      }
    }

    if (expiredCount > 0) {
      logger.info({ expiredCount }, "Varredura de expiração VIP concluída");
    }
  }

  function start({ intervalMs = 5 * 60 * 1000 } = {}) {
    runOnce().catch(() => {});
    setInterval(() => runOnce().catch(() => {}), intervalMs);
  }

  return { start, runOnce };
}

module.exports = { createVipExpiryManager };
