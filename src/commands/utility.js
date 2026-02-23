const { SlashCommandBuilder } = require("discord.js");
const { createEmbed } = require("../embeds");
const { version: djsVersion } = require("discord.js");
const os = require("os");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("utility")
    .setDescription("Comandos de utilidade")
    .addSubcommand((sub) =>
      sub
        .setName("serverinfo")
        .setDescription("Mostra informações sobre o servidor")
    )
    .addSubcommand((sub) =>
      sub
        .setName("userinfo")
        .setDescription("Mostra informações sobre um usuário")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário (opcional)").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("botinfo")
        .setDescription("Mostra informações sobre o bot")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // SERVERINFO
    if (sub === "serverinfo") {
      const guild = interaction.guild;
      await guild.members.fetch(); // Cache members for accurate count
      
      const channels = guild.channels.cache;
      const members = guild.members.cache;
      
      await interaction.reply({ 
          embeds: [createEmbed({
              title: `Informações de ${guild.name}`,
              thumbnail: guild.iconURL({ dynamic: true }),
              fields: [
                  { name: "👑 Dono", value: `<@${guild.ownerId}>`, inline: true },
                  { name: "🆔 ID", value: guild.id, inline: true },
                  { name: "📅 Criado em", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:d>`, inline: true },
                  { name: "👥 Membros", value: `${guild.memberCount}`, inline: true },
                  { name: "🤖 Bots", value: `${members.filter(m => m.user.bot).size}`, inline: true },
                  { name: "📜 Cargos", value: `${guild.roles.cache.size}`, inline: true },
                  { name: "💬 Canais", value: `Texto: ${channels.filter(c => c.type === 0).size}\nVoz: ${channels.filter(c => c.type === 2).size}`, inline: true },
                  { name: "🚀 Boosts", value: `${guild.premiumSubscriptionCount || 0} (Nível ${guild.premiumTier})`, inline: true }
              ],
              color: 0x3498db
          })] 
      });
    }

    // USERINFO
    if (sub === "userinfo") {
      const user = interaction.options.getUser("usuario") || interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      
      const roles = member 
        ? member.roles.cache
            .filter(r => r.name !== "@everyone")
            .sort((a, b) => b.position - a.position)
            .map(r => r)
            .slice(0, 10)
            .join(", ") 
        : "Nenhum";

      await interaction.reply({ 
          embeds: [createEmbed({
              title: `Informações de ${user.username}`,
              thumbnail: user.displayAvatarURL({ dynamic: true }),
              fields: [
                  { name: "🆔 ID", value: user.id, inline: true },
                  { name: "📅 Entrou no Discord", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:d>`, inline: true },
                  ...(member ? [{ name: "📅 Entrou no Servidor", value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:d>`, inline: true }] : []),
                  ...(member ? [{ name: `📜 Cargos (${member.roles.cache.size - 1})`, value: roles || "Nenhum" }] : [])
              ],
              color: member ? member.displayHexColor : 0x95a5a6
          })] 
      });
    }

    // BOTINFO
    if (sub === "botinfo") {
      const uptime = process.uptime();
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor(uptime / 3600) % 24;
      const minutes = Math.floor(uptime / 60) % 60;
      const seconds = Math.floor(uptime % 60);

      await interaction.reply({ 
          embeds: [createEmbed({
              title: "🤖 Informações do Bot",
              description: "Bot desenvolvido em Node.js com Discord.js",
              fields: [
                  { name: "📦 Versão DJS", value: `v${djsVersion}`, inline: true },
                  { name: "🟢 Node.js", value: process.version, inline: true },
                  { name: "💾 Memória", value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
                  { name: "⏱ Uptime", value: `${days}d ${hours}h ${minutes}m ${seconds}s`, inline: true },
                  { name: "🌐 Servidores", value: `${interaction.client.guilds.cache.size}`, inline: true },
                  { name: "👥 Usuários", value: `${interaction.client.users.cache.size}`, inline: true }
              ],
              color: 0x2ecc71
          })] 
      });
    }
  },
};
