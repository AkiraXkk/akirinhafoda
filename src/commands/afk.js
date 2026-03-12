const { SlashCommandBuilder,
  MessageFlags, } = require("discord.js");
const { createEmbed, createSuccessEmbed } = require("../embeds");
const { logger } = require("../logger");

// Armazena os AFKs em memória: Map<guildId, Map<userId, { reason, since }>>
const afkUsers = new Map();

function getGuildAfk(guildId) {
  if (!afkUsers.has(guildId)) afkUsers.set(guildId, new Map());
  return afkUsers.get(guildId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Define ou remove seu status de AFK")
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Motivo do AFK (opcional)").setRequired(false)
    ),

  // Exporta para ser usado pelo messageCreate
  afkUsers,

  async execute(interaction) {
    try {
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const guildAfk = getGuildAfk(guildId);

      // Se já está AFK, remove
      if (guildAfk.has(userId)) {
        guildAfk.delete(userId);
        return interaction.reply({
          embeds: [createSuccessEmbed("Seu status de AFK foi removido. Bem-vindo de volta!", interaction.user)],
          flags: MessageFlags.Ephemeral,
        });
      }

      // Define como AFK
      const motivo = interaction.options.getString("motivo") || "AFK";
      guildAfk.set(userId, { reason: motivo, since: Date.now() });

      const embed = createEmbed({
        title: "💤 AFK Ativado",
        description: `${interaction.user} agora está AFK.\n**Motivo:** ${motivo}`,
        color: 0x95a5a6,
        user: interaction.user,
      });

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error({ err: error, command: "afk" }, "Erro no comando /afk");
      const msg = { content: "❌ Ocorreu um erro ao definir seu AFK.", flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
  },

  /**
   * Chamado pelo messageCreate para verificar menções a usuários AFK
   * e auto-remover AFK de quem enviar mensagem.
   */
  async handleMessage(message) {
    if (!message.guild || message.author.bot) return;

    const guildAfk = getGuildAfk(message.guild.id);
    if (guildAfk.size === 0) return;

    // Se o autor está AFK, remove automaticamente
    if (guildAfk.has(message.author.id)) {
      const afkData = guildAfk.get(message.author.id);
      guildAfk.delete(message.author.id);
      const elapsed = Math.floor((Date.now() - afkData.since) / 60000);
      const timeText = elapsed < 1 ? "menos de 1 minuto" : `${elapsed} minuto(s)`;
      const reply = await message.reply({
        content: `👋 Bem-vindo de volta, ${message.author}! Você ficou AFK por **${timeText}**.`,
        allowedMentions: { repliedUser: false },
      }).catch(() => null);
      if (reply) setTimeout(() => reply.delete().catch(() => {}), 10000);
    }

    // Notifica se alguém mencionou um usuário AFK
    for (const mentioned of message.mentions.users.values()) {
      if (guildAfk.has(mentioned.id)) {
        const afkData = guildAfk.get(mentioned.id);
        const elapsed = Math.floor((Date.now() - afkData.since) / 60000);
        const timeText = elapsed < 1 ? "menos de 1 minuto" : `${elapsed} minuto(s)`;
        const reply = await message.reply({
          content: `💤 **${mentioned.username}** está AFK: *${afkData.reason}* (há **${timeText}**)`,
          allowedMentions: { repliedUser: false },
        }).catch(() => null);
        if (reply) setTimeout(() => reply.delete().catch(() => {}), 15000);
      }
    }
  },
};
