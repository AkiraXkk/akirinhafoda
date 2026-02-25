const { logger } = require("../logger");

function createVipExpiryManager({ client, vipService, vipRoleManager, vipChannelManager }) {
  async function cleanupVipUser(userId, vipEntry) {
    const guilds = client.guilds.cache.values();

    for (const guild of guilds) {
      const guildId = guild.id;

      if (vipRoleManager?.deletePersonalRole) {
        await vipRoleManager.deletePersonalRole(userId, { guildId }).catch(() => {});
      }

      if (vipChannelManager?.archiveVipChannels) {
        await vipChannelManager.archiveVipChannels(userId, { guildId }).catch(() => {});
      }

      try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) continue;

        const guildConfig = vipService.getGuildConfig(guildId);
        const functionalVipRoleId = guildConfig?.vipRoleId;

        if (functionalVipRoleId) {
          await member.roles.remove(functionalVipRoleId).catch(() => {});
        }

        if (vipEntry?.tierId) {
          await member.roles.remove(vipEntry.tierId).catch(() => {});
        }
      } catch (e) {
        logger.error({ err: e, userId, guildId }, "Falha ao remover roles de VIP expirado");
      }
    }
  }

  async function runOnce() {
    const now = Date.now();
    const ids = vipService.listVipIds();
    let expiredCount = 0;

    for (const userId of ids) {
      const entry = vipService.getVip(userId);
      const expiresAt = entry?.expiresAt;
      if (!expiresAt) continue;
      if (expiresAt > now) continue;

      try {
        const removed = await vipService.removeVip(userId);
        if (!removed?.removed) continue;

        expiredCount += 1;
        await cleanupVipUser(userId, removed.vip);
      } catch (e) {
        logger.error({ err: e, userId }, "Falha ao processar expiração de VIP");
      }
    }

    if (expiredCount > 0) {
      logger.info({ expiredCount }, "VIPs expirados processados");
    }
  }

  function start({ intervalMs = 5 * 60 * 1000 } = {}) {
    runOnce().catch(() => {});
    setInterval(() => runOnce().catch(() => {}), intervalMs);
  }

  return { start, runOnce };
}

module.exports = { createVipExpiryManager };

