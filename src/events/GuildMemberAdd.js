const { Events } = require("discord.js");
const { getGuildConfig } = require("../config/guildConfig");
const { createEmbed } = require("../embeds");
const { logger } = require("../logger");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    let guildConfig;
    try {
      guildConfig = await getGuildConfig(member.guild.id);
    } catch (err) {
      logger.error({ err, guildId: member.guild.id }, "Falha ao obter config do guild");
      guildConfig = {};
    }
    
    // Inicializar dados de XP para o novo membro
    const levelsCommand = client.commands.get("rank");
    if (levelsCommand) {
      try {
        const levelsStore = levelsCommand.getLevelsStore?.();
        if (levelsStore) {
          await levelsStore.update(member.id, (current) => {
            // Se não existir dados, inicializar
            if (!current) {
              return {
                xp: 0,
                level: 1,
                totalXp: 0,
                messages_count: 0,
                voice_time: 0
              };
            }
            return current; // Manter dados existentes
          });
        }
      } catch (error) {
        logger.error({ err: error, userId: member.id }, "Erro ao inicializar dados de XP para novo membro");
      }
    }
    
    // Sistema de boas-vindas configurável
    if (guildConfig.welcomeChannelId) {
      const channel = member.guild.channels.cache.get(guildConfig.welcomeChannelId);
      if (channel) {
        const message = (guildConfig.welcomeMessage || "Bem-vindo ao servidor, {user}! 🎉")
          .replace("{user}", member.toString())
          .replace("{username}", member.user.username)
          .replace("{server}", member.guild.name)
          .replace("{count}", member.guild.memberCount);
        
        let color = 0x3498db;
        if (guildConfig.welcomeColor) {
          const parsed = parseInt(guildConfig.welcomeColor, 16);
          if (!isNaN(parsed)) color = parsed;
        }

        const embed = createEmbed({
          title: guildConfig.welcomeTitle || "👋 Bem-vindo(a)!",
          description: message,
          thumbnail: member.user.displayAvatarURL({ dynamic: true, size: 256 }),
          color,
          footer: { 
            text: `${guildConfig.welcomeFooter || `Membro #${member.guild.memberCount} • Esta mensagem será excluída em ${guildConfig.welcomeDeleteTime || 30} segundos`} • WDA - Todos os direitos reservados` 
          },
          timestamp: new Date()
        });
        
        // Enviar mensagem de boas-vindas
        const welcomeMessage = await channel.send({ 
          content: guildConfig.welcomePing ? `${member}` : null, 
          embeds: [embed] 
        }).catch((err) => {
          logger.warn({ err, channelId: channel.id }, "Falha ao enviar mensagem de boas-vindas");
          return null;
        });
        
        // Apagar mensagem após o tempo configurado (padrão: 30 segundos)
        if (welcomeMessage && guildConfig.welcomeDeleteTime !== 0) {
          const deleteTime = (guildConfig.welcomeDeleteTime || 30) * 1000;
          
          setTimeout(() => {
            welcomeMessage.delete().catch(() => {});
          }, deleteTime);
        }
      }
    }
  },
};
