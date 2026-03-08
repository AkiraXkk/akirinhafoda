const { Events, PermissionFlagsBits } = require("discord.js");
const { logger } = require("../logger");
const { getGuildConfig } = require("../config/guildConfig");

module.exports = {
  name: Events.GuildMemberUpdate,
  once: false,
  async execute(oldMember, newMember, client) {
    try {
      const vip = client.services?.vip;
      const vipRole = client.services?.vipRole;
      const vipChannel = client.services?.vipChannel;

      if (!vip || !vipRole || !vipChannel) return;

      const vipConfig = vip.getGuildConfig(newMember.guild.id);
      const vipRoleId = vipConfig?.vipRoleId;
      if (!vipRoleId) return;

      const hadVip = oldMember.roles.cache.has(vipRoleId);
      const hasVip = newMember.roles.cache.has(vipRoleId);
      const guildConfig = await getGuildConfig(newMember.guild.id);
      const generalChannelId = guildConfig.generalChannelId;

      if (!hadVip && hasVip && generalChannelId) {
        const canalGeral = await newMember.guild.channels.fetch(generalChannelId).catch(() => null);
        if (canalGeral) {
          await canalGeral.permissionOverwrites
            .edit(newMember.id, {
              [PermissionFlagsBits.AttachFiles]: true,
              [PermissionFlagsBits.EmbedLinks]: true,
            })
            .catch(() => {});
        }
      }

      if (hadVip && !hasVip) {
        if (generalChannelId) {
          const canalGeral = await newMember.guild.channels.fetch(generalChannelId).catch(() => null);
          if (canalGeral) {
            await canalGeral.permissionOverwrites.delete(newMember.id).catch(() => {});
          }
        }

        const entry = vip.getVip(newMember.guild.id, newMember.id);
        if (entry) {
          await vip.removeVip(newMember.guild.id, newMember.id).catch((err) => {
            logger.error({ err, userId: newMember.id, guildId: newMember.guild.id }, "Erro ao remover VIP no GuildMemberUpdate");
          });
        }

        if (entry?.tierId) {
          await newMember.roles.remove(entry.tierId).catch(() => {});
        }

        await vipRole.deletePersonalRole(newMember.id, { guildId: newMember.guild.id }).catch(() => {});
        await vipChannel.deleteVipChannels(newMember.id, { guildId: newMember.guild.id }).catch(() => {});
      }
    } catch (e) {
      logger.error({ err: e }, "Erro no GuildMemberUpdate VIP cleanup");
    }
  },
};

