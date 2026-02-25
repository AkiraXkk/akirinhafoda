const { Events } = require("discord.js");
const { logger } = require("../logger");

module.exports = {
  name: Events.GuildMemberUpdate,
  once: false,
  async execute(oldMember, newMember, client) {
    try {
      const vip = client.services?.vip;
      const vipRole = client.services?.vipRole;
      const vipChannel = client.services?.vipChannel;

      if (!vip || !vipRole || !vipChannel) return;

      const config = vip.getGuildConfig(newMember.guild.id);
      const vipRoleId = config?.vipRoleId;
      if (!vipRoleId) return;

      const hadVip = oldMember.roles.cache.has(vipRoleId);
      const hasVip = newMember.roles.cache.has(vipRoleId);
      if (!hadVip || hasVip) return;

      const entry = vip.getVip(newMember.id);
      if (entry) {
        await vip.removeVip(newMember.id).catch(() => {});
      }

      if (entry?.tierId) {
        await newMember.roles.remove(entry.tierId).catch(() => {});
      }

      await vipRole.deletePersonalRole(newMember.id, { guildId: newMember.guild.id }).catch(() => {});
      await vipChannel.archiveVipChannels(newMember.id, { guildId: newMember.guild.id }).catch(() => {});
    } catch (e) {
      logger.error({ err: e }, "Erro no GuildMemberUpdate VIP cleanup");
    }
  },
};

