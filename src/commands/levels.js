const { SlashCommandBuilder } = require("discord.js");
const { createEmbed, createErrorEmbed } = require("../embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level")
    .setDescription("Sistema de níveis")
    .addSubcommand((sub) =>
      sub
        .setName("rank")
        .setDescription("Verifica seu nível e XP")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário (opcional)").setRequired(false)),
    )
    .addSubcommand((sub) => sub.setName("leaderboard").setDescription("Mostra o top 10 usuários com mais XP")),

  async execute(interaction, services) {
    const levelsService = services?.levels;
    if (!levelsService) {
      return interaction.reply({ embeds: [createErrorEmbed("Serviço de níveis indisponível.")], ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "rank") {
      const user = interaction.options.getUser("usuario") || interaction.user;
      const data = await levelsService.getProfile(user.id);
      const xpNeeded = data.level * 100;
      const progress = Math.min(data.xp / xpNeeded, 1);
      const filled = Math.floor(progress * 10);
      const empty = 10 - filled;
      const bar = "🟦".repeat(filled) + "⬜".repeat(empty);

      return interaction.reply({
        embeds: [
          createEmbed({
            title: `🌟 Nível de ${user.username}`,
            fields: [
              { name: "Nível", value: `${data.level}`, inline: true },
              { name: "XP Total", value: `${data.xp}`, inline: true },
              { name: "Progresso para Próximo Nível", value: `${data.xp}/${xpNeeded} XP\n${bar}` },
            ],
            thumbnail: user.displayAvatarURL(),
            color: 0x9b59b6,
          }),
        ],
      });
    }

    if (sub === "leaderboard") {
      const sorted = await levelsService.getLeaderboard(10);
      if (!sorted.length) {
        return interaction.reply({ embeds: [createEmbed({ description: "Ninguém ganhou XP ainda." })], ephemeral: true });
      }

      const top = sorted.map((entry, index) => `**${index + 1}.** <@${entry.id}> - Nível ${entry.level} (${entry.xp} XP)`);
      return interaction.reply({
        embeds: [
          createEmbed({
            title: "🏆 Top 10 Níveis",
            description: top.join("\n"),
            color: 0xf1c40f,
          }),
        ],
      });
    }
  },
};
