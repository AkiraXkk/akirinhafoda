const { Events } = require("discord.js");
const { logger } = require("../logger");

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member, client) {
    try {
      const userId = member.id;
      const guildId = member.guild.id;

      // 🛡️ Cleanup VIP
      if (client.services && client.services.vip) {
        const { vip: vipService, vipRole: vipRoleManager, vipChannel: vipChannelManager } = client.services;

        // Tenta obter os dados do VIP. Se retornar algo, ele era VIP.
        const vipData = await vipService.getVipData(guildId, userId);
        
        if (vipData && vipData.tierId) {
          logger.info({ userId, guildId, username: member.user.username }, "VIP deixou o servidor - iniciando cleanup");

          // Remove Cargo Personalizado
          if (vipRoleManager) {
            await vipRoleManager.deletePersonalRole(userId, { guildId }).catch((err) => 
              logger.error({ err, userId }, "Erro: Remover cargo VIP no logout")
            );
          }

          // Remove Canais VIP
          if (vipChannelManager) {
            await vipChannelManager.deleteVipChannels(userId, { guildId }).catch((err) => 
              logger.error({ err, userId }, "Erro: Remover canais VIP no logout")
            );
          }

          // Remove do Banco de Dados
          await vipService.removeVip(guildId, userId).catch((err) => 
            logger.error({ err, userId }, "Erro: Remover registro VIP")
          );
        }
      }

      // 🏠 Cleanup Família
      if (client.services && client.services.family) {
        const familyService = client.services.family;
        
        // Se for dono de família, deleta a família inteira
        const familyAsOwner = await familyService.getFamilyByOwner(userId);
        if (familyAsOwner) {
          logger.info({ userId, familyId: familyAsOwner.id }, "Dono de família saiu - deletando clã");
          await familyService.deleteFamily(member.guild, userId).catch((err) => 
            logger.error({ err, userId }, "Erro: Deletar família no logout")
          );
        }

        // Se for apenas membro, remove da lista de membros
        const familyAsMember = await familyService.getFamilyByMember(userId);
        if (familyAsMember) {
          logger.info({ userId, familyId: familyAsMember.id }, "Membro de família saiu - removendo da lista");
          await familyService.removeMember(member.guild, familyAsMember.id, userId).catch((err) => 
            logger.error({ err, userId }, "Erro: Remover membro da família no logout")
          );
        }
      }

    } catch (error) {
      logger.error({ err: error, userId: member.id }, "Erro crítico no GuildMemberRemove");
    }
  },
};