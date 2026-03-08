const { logger: defaultLogger } = require("../logger");

function createShopExpiryManager({ client, shopService, logger } = {}) {
  logger = logger || defaultLogger;

  async function cleanupGrant(guild, grant) {
    const guildId = guild.id;
    const userId = grant.userId;

    if (!guildId || !userId) return;

    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return;

      if (grant.type === "temporary_role" && grant.roleId) {
        await member.roles.remove(grant.roleId).catch(() => {});
      }

      if (grant.type === "channel_access" && grant.channelId) {
        const ch = await guild.channels.fetch(grant.channelId).catch(() => null);
        if (ch) {
          await ch.permissionOverwrites.delete(userId).catch(() => {});
        }
      }
    } catch (err) {
      logger.error({ err, guildId, userId, grantId: grant.id }, "Shop grant cleanup failed");
    }
  }

  async function runOnce() {
    const now = Date.now();

    const guilds = client?.guilds?.cache?.values ? Array.from(client.guilds.cache.values()) : [];
    for (const guild of guilds) {
      const guildId = guild.id;
      try {
        const grants = await shopService.listGrants(guildId);
        const expired = grants.filter((g) => g.expiresAt && g.expiresAt <= now);
        for (const grant of expired) {
          await cleanupGrant(guild, grant);
          await shopService.removeGrant(guildId, grant.id);
        }
      } catch (err) {
        logger.error({ err, guildId }, "Shop expiry run failed");
      }
    }
  }

  function start({ intervalMs = 5 * 60 * 1000 } = {}) {
    runOnce().catch((err) => logger.warn({ err }, "Shop expiry initial run failed"));
    setInterval(() => runOnce().catch((err) => logger.warn({ err }, "Shop expiry periodic run failed")), intervalMs);
  }

  return { start, runOnce };
}

module.exports = { createShopExpiryManager };
