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
                messages: 0,
                voiceMs: 0
              };
            }
            return current; // Manter dados existentes
          });
        }
      } catch (error) {
        console.error(`Erro ao inicializar dados de XP para usuário ${member.id}:`, error);
      }
    }
    
    if (guildConfig.welcomeChannelId) {
        const channel = member.guild.channels.cache.get(guildConfig.welcomeChannelId);
        if (channel) {
            const message = (guildConfig.welcomeMessage || "Bem-vindo ao servidor, {user}!").replace("{user}", member.toString());
            const embed = createEmbed({
                title: "👋 Bem-vindo(a)!",
                description: message,
                thumbnail: member.user.displayAvatarURL(),
                color: 0x3498db,
                footer: { text: `Membro #${member.guild.memberCount}` },
                user: member.user
            });
            channel.send({ content: `${member}`, embeds: [embed] }).catch(() => {});
        }
    }
  },
};
