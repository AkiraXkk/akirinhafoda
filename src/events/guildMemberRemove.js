const { Events } = require("discord.js");
const { logger } = require("../logger");

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member, client) {
    try {
      const userId = member.id;
      const guildId = member.guild.id;

      // Cleanup VIP assets when member leaves
      if (client.services?.vip) {
        const vipService = client.services.vip;
        const vipRoleManager = client.services.vipRole;
        const vipChannelManager = client.services.vipChannel;

        // Check if user was VIP
        if (vipService.isVip({ guildId, userId })) {
          logger.info({ userId, guildId, userTag: member.user.tag }, "VIP deixou o servidor - iniciando cleanup");

          // Remove VIP role
          if (vipRoleManager) {
            await vipRoleManager.deletePersonalRole(userId, { guildId }).catch((error) => {
              logger.error({ err: error, userId }, "Erro ao remover cargo VIP do usuário que saiu");
            });
          }

          // Remove VIP channels
          if (vipChannelManager) {
            await vipChannelManager.deleteVipChannels(userId, { guildId }).catch((error) => {
              logger.error({ err: error, userId }, "Erro ao remover canais VIP do usuário que saiu");
            });
          }

          // Remove VIP from service
          await vipService.removeVip(guildId, userId).catch((error) => {
            logger.error({ err: error, userId }, "Erro ao remover VIP do serviço");
          });
        }
      }

      // Cleanup Family assets when member leaves
      if (client.services?.family) {
        const familyService = client.services.family;
        
        try {
          // Check if user owns a family
          const family = await familyService.getFamilyByOwner(userId);
          if (family) {
            logger.info({ userId, guildId, familyId: family.id, userTag: member.user.tag }, "Dono de família deixou o servidor - removendo família");
            
            // Delete family and all associated assets
            await familyService.deleteFamily(member.guild, userId).catch((error) => {
              logger.error({ err: error, userId, familyId: family.id }, "Erro ao deletar família do usuário que saiu");
            });
          }

          // Remove user from any family they were a member of
          const memberFamily = await familyService.getFamilyByMember(userId);
          if (memberFamily) {
            logger.info({ userId, guildId, familyId: memberFamily.id, userTag: member.user.tag }, "Membro de família deixou o servidor - removendo da família");
            
            await familyService.removeMember(member.guild, memberFamily.id, userId).catch((error) => {
              logger.error({ err: error, userId, familyId: memberFamily.id }, "Erro ao remover usuário da família");
            });
          }
        } catch (error) {
          logger.error({ err: error, userId }, "Erro no cleanup de família do usuário que saiu");
        }
      }

    } catch (error) {
      logger.error({ err: error, userId: member.id, guildId: member.guild.id }, "Erro no cleanup de membro que saiu do servidor");
    }
  },
};
