const { Events } = require("discord.js");
const { getGuildConfig } = require("../config/guildConfig");
const { createEmbed } = require("../embeds");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    const guildConfig = await getGuildConfig(member.guild.id);
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
