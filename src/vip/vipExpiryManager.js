const { logger } = require("../logger");

function createVipExpiryManager({ client, vipService, vipRoleManager, vipChannelManager, familyService }) {
  async function cleanupVipUser(guild, userId, vipEntry) {
      const guildId = guild.id;

      if (vipRoleManager?.deletePersonalRole) {
        await vipRoleManager.deletePersonalRole(userId, { guildId }).catch(() => {});
      }

      if (vipChannelManager?.deleteVipChannels) {
        await vipChannelManager.deleteVipChannels(userId, { guildId }).catch(() => {});
      }

      if (familyService) {
        try {
          await familyService.deleteFamily(guild, userId);
        } catch {
          // Sem família para esse usuário, ignorar
        }
      }

      try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return;

        const guildConfig = vipService.getGuildConfig(guildId);
        const functionalVipRoleId = guildConfig?.vipRoleId;

        if (functionalVipRoleId) {
          await member.roles.remove(functionalVipRoleId).catch(() => {});
        }

        if (vipEntry?.tierId) {
          const tier = await vipService.getTierConfig(guildId, vipEntry.tierId).catch(() => null);
          if (tier?.roleId) {
            await member.roles.remove(tier.roleId).catch(() => {});
          }
        }
      } catch (e) {
        logger.error({ err: e, userId, guildId }, "Falha ao remover roles de VIP expirado");
      }
  }

  async function runOnce() {
    const now = Date.now();
    let expiredCount = 0;

    for (const guild of client.guilds.cache.values()) {
      const guildId = guild.id;
      const ids = vipService.listVipIds(guildId);

      for (const userId of ids) {
        const entry = vipService.getVip(guildId, userId);
        const expiresAt = entry?.expiresAt;
        if (!expiresAt) continue;
        if (expiresAt > now) continue;

        try {
          const removed = await vipService.removeVip(guildId, userId);
          if (!removed?.removed) continue;

          expiredCount += 1;
          await cleanupVipUser(guild, userId, removed.vip);
        } catch (e) {
          logger.error({ err: e, userId, guildId }, "Falha ao processar expiração de VIP");
        }
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

