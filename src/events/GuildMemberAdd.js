const { Events } = require("discord.js");
const { getGuildConfig } = require("../config/guildConfig");
const { createEmbed } = require("../embeds");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    const guildConfig = await getGuildConfig(member.guild.id);
    
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
        console.error(`Erro ao inicializar dados de XP para usuário ${member.id}:`, error);
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
        
        const embed = createEmbed({
          title: guildConfig.welcomeTitle || "👋 Bem-vindo(a)!",
          description: message,
          thumbnail: member.user.displayAvatarURL({ dynamic: true, size: 256 }),
          color: parseInt(guildConfig.welcomeColor || "3498db", 16),
          footer: { 
            text: guildConfig.welcomeFooter || `Membro #${member.guild.memberCount} • Esta mensagem será excluída em ${guildConfig.welcomeDeleteTime || 30} segundos` 
          },
          timestamp: new Date()
        });
        
        // Enviar mensagem de boas-vindas
        const welcomeMessage = await channel.send({ 
          content: guildConfig.welcomePing ? `${member}` : null, 
          embeds: [embed] 
        }).catch(() => {});
        
        // Apagar mensagem após o tempo configurado (padrão: 30 segundos)
        if (welcomeMessage && guildConfig.welcomeDeleteTime !== 0) {
          const deleteTime = (guildConfig.welcomeDeleteTime || 30) * 1000;
          
          setTimeout(() => {
            welcomeMessage.delete().catch(() => {
              console.log(`Não foi possível apagar mensagem de boas-vindas para ${member.user.username} (pode já ter sido excluída)`);
            });
          }, deleteTime);
        }
      }
    }
  },
};
