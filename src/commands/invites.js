const { SlashCommandBuilder } = require("discord.js");
const { createEmbed } = require("../embeds");
const { getInviteData, getAllInviteData } = require("../services/inviteTracker");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("invites")
    .setDescription("Sistema de convites do servidor")
    .addSubcommand((sub) =>
      sub
        .setName("user")
        .setDescription("Veja quantos membros você (ou outro membro) convidou")
        .addUserOption((opt) =>
          opt.setName("membro").setDescription("Membro para consultar").setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("ranking").setDescription("Veja o Top 10 de quem mais convidou membros")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ==========================================
    // /invites user [membro]
    // ==========================================
    if (sub === "user") {
      const target = interaction.options.getUser("membro") || interaction.user;

      try {
        const data = await getInviteData(interaction.guildId, target.id);

        if (!data || !data.total) {
          return interaction.reply({
            embeds: [
              createEmbed({
                title: "📩 Convites",
                description:
                  target.id === interaction.user.id
                    ? "Você ainda não convidou ninguém! Compartilhe o link do servidor para começar. 💌"
                    : `**${target.username}** ainda não convidou ninguém.`,
                color: 0x2f3136,
                footer: { text: "WDA - Invite Tracker" },
              }),
            ],
            ephemeral: true,
          });
        }

        const real = Math.max((data.total || 0) - (data.leaves || 0) - (data.fake || 0), 0);

        return interaction.reply({
          embeds: [
            createEmbed({
              title: "📩 Convites",
              description:
                `**${target.username}** possui **${real}** convite${real !== 1 ? "s" : ""} real${real !== 1 ? "is" : ""}.\n\n` +
                `✅ **Entrou:** ${data.total || 0}\n` +
                `❌ **Saiu:** ${data.leaves || 0}\n` +
                `⚠️ **Fake:** ${data.fake || 0}`,
              color: 0xffd700,
              thumbnail: target.displayAvatarURL({ dynamic: true, size: 128 }),
              footer: { text: "WDA - Invite Tracker" },
            }),
          ],
        });
      } catch (err) {
        const { logger } = require("../logger");
        logger.error({ err }, "[invites] Erro ao buscar dados de convite");
        return interaction.reply({
          content: "❌ Ocorreu um erro ao buscar os dados de convite.",
          ephemeral: true,
        });
      }
    }

    // ==========================================
    // /invites ranking
    // ==========================================
    if (sub === "ranking") {
      try {
        const guildData = await getAllInviteData(interaction.guildId);

        const entries = Object.entries(guildData)
          .map(([userId, data]) => {
            const real = Math.max((data.total || 0) - (data.leaves || 0) - (data.fake || 0), 0);
            return {
              userId,
              real,
              total: data.total || 0,
              leaves: data.leaves || 0,
              fake: data.fake || 0,
            };
          })
          .filter((e) => e.real > 0)
          .sort((a, b) => b.real - a.real)
          .slice(0, 10);

        if (entries.length === 0) {
          return interaction.reply({
            embeds: [
              createEmbed({
                title: "🏆 Ranking de Convites",
                description:
                  "Ninguém convidou membros ainda! Seja o primeiro a trazer amigos para o servidor. 🌟",
                color: 0x2f3136,
                footer: { text: "WDA - Invite Tracker" },
              }),
            ],
          });
        }

        const medals = ["🥇", "🥈", "🥉"];
        const lines = entries.map((e, i) => {
          const medal = medals[i] || `**#${i + 1}**`;
          return `${medal} <@${e.userId}> — **${e.real}** convites *(✅ ${e.total} | ❌ ${e.leaves} | ⚠️ ${e.fake})*`;
        });

        return interaction.reply({
          embeds: [
            createEmbed({
              title: "🏆 Ranking de Convites",
              description: lines.join("\n"),
              color: 0xffd700,
              thumbnail: interaction.guild.iconURL({ dynamic: true, size: 128 }),
              footer: { text: "WDA - Invite Tracker" },
            }),
          ],
        });
      } catch (err) {
        const { logger } = require("../logger");
        logger.error({ err }, "[invites] Erro ao gerar ranking");
        return interaction.reply({
          content: "❌ Ocorreu um erro ao gerar o ranking de convites.",
          ephemeral: true,
        });
      }
    }
  },
};
