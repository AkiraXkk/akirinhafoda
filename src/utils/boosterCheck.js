const { logger } = require("../logger");

/**
 * Verifica se Boosters automáticos ainda estão boostando o servidor.
 * Se pararam de boostar, executa a limpeza atômica do VIP.
 *
 * @param {import('discord.js').Client} client
 */
async function checkBoosters(client) {
  try {
    const vip        = client.services?.vip;
    const vipRole    = client.services?.vipRole;
    const vipChannel = client.services?.vipChannel;

    if (!vip || !vipRole || !vipChannel) return;

    for (const guild of client.guilds.cache.values()) {
      try {
        const vipIds = vip.listVipIds ? vip.listVipIds(guild.id) : [];
        if (!Array.isArray(vipIds) || vipIds.length === 0) continue;

        for (const userId of vipIds) {
          try {
            const entry = vip.getVip(guild.id, userId);
            if (!entry || entry.source !== "booster_auto") continue;

            const member = await guild.members.fetch(userId).catch(() => null);

            // Se o membro saiu do servidor, limpeza atômica também se aplica
            if (!member || !member.premiumSinceTimestamp) {
              logger.info({ userId, guildId: guild.id }, "[BoosterCheck] Boost removido — iniciando limpeza atômica de VIP");

              await vipChannel.deleteVipChannels(userId, { guildId: guild.id }).catch((err) => {
                logger.warn({ err, userId }, "[BoosterCheck] Falha ao deletar canais VIP");
              });

              await vipRole.deletePersonalRole(userId, { guildId: guild.id }).catch((err) => {
                logger.warn({ err, userId }, "[BoosterCheck] Falha ao deletar cargo pessoal");
              });

              if (entry.tierId) {
                await vipRole.removeTierRole(userId, entry.tierId, { guildId: guild.id }).catch((err) => {
                  logger.warn({ err, userId }, "[BoosterCheck] Falha ao remover cargo de tier");
                });
              }

              await vip.removeVip(guild.id, userId).catch((err) => {
                logger.warn({ err, userId }, "[BoosterCheck] Falha ao remover registro VIP");
              });

              // Notificar o membro via DM, se possível
              if (member) {
                await member.send({
                  content: "😔 Seu VIP Booster foi removido porque você não está mais boostando o servidor. Obrigado por ter contribuído! 💙",
                }).catch(() => {});
              }
            }
          } catch (e) {
            logger.error({ err: e, userId, guildId: guild.id }, "[BoosterCheck] Erro ao verificar membro booster");
          }
        }
      } catch (e) {
        logger.error({ err: e, guildId: guild.id }, "[BoosterCheck] Erro ao processar guild");
      }
    }
  } catch (e) {
    logger.error({ err: e }, "[BoosterCheck] Erro global ao verificar boosters");
  }
}

module.exports = { checkBoosters };
