const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");
const { createEmbed, createSuccessEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");
const { logger } = require("../logger");

// Banco de dados de estatísticas dos membros da staff
const staffStatsStore = createDataStore("staff_stats.json");

// Chave usada no guildConfig para armazenar o canal de logs de avaliações
// Configure com: /avaliacao config canal <#canal>
const AVAL_LOG_CHANNEL_KEY = "avaliacaoChannelId";

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/** Transforma uma nota (1-5) em uma string de ícones de estrela. */
function starsString(nota) {
  return "⭐".repeat(nota) + "☆".repeat(5 - nota);
}

// ─────────────────────────────────────────────
//  Exportações do comando
// ─────────────────────────────────────────────

module.exports = {
  /**
   * Slash command /avaliacao — utilizado apenas para configuração administrativa.
   * O fluxo principal de avaliação ocorre via botões enviados em DM.
   */
  data: new SlashCommandBuilder()
    .setName("avaliacao")
    .setDescription("Gerencia o sistema de avaliação de atendimento (NPS)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Configura o canal onde os logs de avaliações serão postados")
        .addChannelOption((opt) =>
          opt
            .setName("canal")
            .setDescription("Canal de texto para receber os logs de avaliação")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "config") {
      const canal = interaction.options.getChannel("canal");
      await setGuildConfig(interaction.guildId, { [AVAL_LOG_CHANNEL_KEY]: canal.id });
      await interaction.reply({
        embeds: [createSuccessEmbed(`Canal de logs de avaliação configurado para ${canal}.`)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  // ─────────────────────────────────────────────
  //  Botões — clique nas estrelas (chegam via DM)
  // ─────────────────────────────────────────────
  /**
   * Disparado quando o usuário clica em uma estrela na DM.
   * customId esperado: aval_staff_<NOTA>_<STAFFID>_<GUILDID>
   * Abre um Modal pedindo um comentário opcional.
   */
  async handleButton(interaction) {
    // Ex.: "aval_staff_5_123456789012345678_722253176283070506"
    const parts = interaction.customId.split("_");
    if (parts.length < 5) {
      return interaction.reply({ content: "❌ customId de avaliação inválido.", flags: MessageFlags.Ephemeral });
    }

    const nota    = parts[2];
    const staffId = parts[3];
    const guildId = parts[4];

    const notaNum = parseInt(nota, 10);
    if (isNaN(notaNum) || notaNum < 1 || notaNum > 5) {
      return interaction.reply({ content: "❌ Nota de avaliação inválida.", flags: MessageFlags.Ephemeral });
    }
    if (!/^\d{17,20}$/.test(staffId) || !/^\d{17,20}$/.test(guildId)) {
      return interaction.reply({ content: "❌ Dados de avaliação inválidos.", flags: MessageFlags.Ephemeral });
    }

    const msgId = interaction.message?.id ?? "0";

    const modal = new ModalBuilder()
      // customId: aval_modal_<STAFFID>_<NOTA>_<GUILDID>_<MSGID>
      .setCustomId(`aval_modal_${staffId}_${notaNum}_${guildId}_${msgId}`)
      .setTitle("📝 Avaliação do Atendimento");

    const commentInput = new TextInputBuilder()
      .setCustomId("aval_comment")
      .setLabel("Comentário (opcional)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(500)
      .setPlaceholder("Conte como foi sua experiência com o atendimento...");

    modal.addComponents(new ActionRowBuilder().addComponents(commentInput));

    await interaction.showModal(modal);
  },

  // ─────────────────────────────────────────────
  //  Modal — envio do comentário
  // ─────────────────────────────────────────────
  /**
   * Disparado quando o usuário envia o comentário no Modal.
   * customId esperado: aval_modal_<STAFFID>_<NOTA>_<GUILDID>_<MSGID>
   *
   * Fluxo:
   * 1. Salva a nota em staff_stats.json
   * 2. Edita a mensagem original na DM (remove os botões)
   * 3. Envia embed de log no canal configurado via /avaliacao config
   */
  async handleModal(interaction) {
    // Ex.: "aval_modal_123456789012345678_5_722253176283070506_987654321098765432"
    const parts = interaction.customId.split("_");
    if (parts.length < 6) {
      return interaction.reply({ content: "❌ customId de avaliação inválido.", flags: MessageFlags.Ephemeral });
    }

    const staffId = parts[2];
    const nota    = parseInt(parts[3], 10);
    const guildId = parts[4];
    const msgId   = parts[5] ?? "0";

    if (isNaN(nota) || nota < 1 || nota > 5) {
      return interaction.reply({ content: "❌ Nota de avaliação inválida.", flags: MessageFlags.Ephemeral });
    }
    if (!/^\d{17,20}$/.test(staffId) || !/^\d{17,20}$/.test(guildId)) {
      return interaction.reply({ content: "❌ Dados de avaliação inválidos.", flags: MessageFlags.Ephemeral });
    }

    const comment = interaction.fields.getTextInputValue("aval_comment").trim();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // 1. Atualizar estatísticas do staff no banco de dados
    const stats = await staffStatsStore.update(staffId, (current) => {
      const prev     = current || { totalNota: 0, totalAvaliacoes: 0, media: 0 };
      const newTotal = prev.totalNota + nota;
      const newCount = prev.totalAvaliacoes + 1;
      const newMedia = Math.round((newTotal / newCount) * 10) / 10;
      return { totalNota: newTotal, totalAvaliacoes: newCount, media: newMedia };
    });

    // 2. Editar a mensagem original na DM para remover os botões
    if (msgId !== "0" && interaction.channel) {
      try {
        const originalMsg = await interaction.channel.messages.fetch(msgId).catch(() => null);
        if (originalMsg) {
          const thankEmbed = createEmbed({
            title: "💛 Avaliação Recebida!",
            description:
              "Obrigado pela sua avaliação! Sua opinião é muito importante para melhorarmos nosso atendimento. 🙏",
            color: 0xf1c40f,
          });
          await originalMsg.edit({ embeds: [thankEmbed], components: [] });
        }
      } catch (e) {
        logger.warn({ err: e }, "[avaliacao] Não foi possível editar a mensagem de avaliação na DM");
      }
    }

    // 3. Enviar log no canal do servidor
    try {
      const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        const config       = await getGuildConfig(guildId);
        const logChannelId = config[AVAL_LOG_CHANNEL_KEY];

        if (logChannelId) {
          const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
          if (logChannel) {
            const staffUser = await interaction.client.users.fetch(staffId).catch(() => null);
            const staffName = staffUser
              ? `<@${staffId}> (${staffUser.username})`
              : `<@${staffId}>`;
            const stars     = starsString(nota);
            const totalAval = stats.totalAvaliacoes;

            const logEmbed = createEmbed({
              title: "📊 Nova Avaliação de Atendimento",
              color: 0xf1c40f,
              fields: [
                {
                  name: "👤 Avaliado por",
                  value: `<@${interaction.user.id}> (${interaction.user.username})`,
                  inline: true,
                },
                {
                  name: "🎖️ Staff Avaliado",
                  value: staffName,
                  inline: true,
                },
                {
                  name: "⭐ Nota",
                  value: `${stars} **(${nota}/5)**`,
                  inline: false,
                },
                {
                  name: "💬 Comentário",
                  value: comment || "*Nenhum comentário.*",
                  inline: false,
                },
                {
                  name: "📈 Média Atual do Staff",
                  value: `**${stats.media}** ⭐ (${totalAval} avaliação${totalAval !== 1 ? "ões" : ""})`,
                  inline: false,
                },
              ],
            });

            await logChannel.send({ embeds: [logEmbed] });
          }
        }
      }
    } catch (e) {
      logger.warn({ err: e }, "[avaliacao] Não foi possível enviar o log de avaliação no servidor");
    }

    await interaction.editReply({ content: "✅ Sua avaliação foi enviada com sucesso! Obrigado. 💛" });
  },
};
