const { SlashCommandBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { logger } = require("../logger");

// Armazena lembretes ativos em memória: Map<usernId, Array<{ timeout, text, channel, endsAt }>>
const activeReminders = new Map();

function parseTime(input) {
  const regex = /^(\d+)\s*(m|min|minuto|minutos|h|hora|horas|d|dia|dias|s|seg|segundo|segundos)$/i;
  const match = input.trim().match(regex);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (unit.startsWith("s")) return value * 1000;
  if (unit.startsWith("m")) return value * 60 * 1000;
  if (unit.startsWith("h")) return value * 60 * 60 * 1000;
  if (unit.startsWith("d")) return value * 24 * 60 * 60 * 1000;
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lembrete")
    .setDescription("Define um lembrete pessoal")
    .addStringOption((opt) =>
      opt
        .setName("tempo")
        .setDescription("Quando ser lembrado (ex: 10m, 1h, 2d)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("mensagem")
        .setDescription("O que deseja ser lembrado")
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      const tempoInput = interaction.options.getString("tempo");
      const mensagem = interaction.options.getString("mensagem");
      const ms = parseTime(tempoInput);

      if (!ms) {
        return interaction.reply({
          embeds: [createErrorEmbed("Formato de tempo inválido. Use: `10s`, `5m`, `2h`, `1d`.", interaction.user)],
          ephemeral: true,
        });
      }

      // Limite máximo: 7 dias
      const MAX_MS = 7 * 24 * 60 * 60 * 1000;
      if (ms > MAX_MS) {
        return interaction.reply({
          embeds: [createErrorEmbed("O tempo máximo para um lembrete é de **7 dias**.", interaction.user)],
          ephemeral: true,
        });
      }

      // Limite: 5 lembretes ativos por usuário
      const userId = interaction.user.id;
      if (!activeReminders.has(userId)) activeReminders.set(userId, []);
      const userReminders = activeReminders.get(userId);

      if (userReminders.length >= 5) {
        return interaction.reply({
          embeds: [createErrorEmbed("Você já tem **5 lembretes** ativos. Aguarde um deles expirar.", interaction.user)],
          ephemeral: true,
        });
      }

      const endsAt = Date.now() + ms;
      const channelId = interaction.channelId;

      const timeout = setTimeout(async () => {
        // Remove da lista de ativos
        const list = activeReminders.get(userId);
        if (list) {
          const idx = list.findIndex((r) => r.endsAt === endsAt && r.text === mensagem);
          if (idx !== -1) list.splice(idx, 1);
          if (list.length === 0) activeReminders.delete(userId);
        }

        // Tenta enviar no canal original
        try {
          const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
          if (channel) {
            const embed = createEmbed({
              title: "⏰ Lembrete!",
              description: `${interaction.user}, você pediu para ser lembrado:\n\n📝 **${mensagem}**`,
              color: 0x3498db,
              user: interaction.user,
            });
            await channel.send({ content: `<@${userId}>`, embeds: [embed] });
            return;
          }
        } catch {
          // fallthrough para DM
        }

        // Fallback: DM
        try {
          const embed = createEmbed({
            title: "⏰ Lembrete!",
            description: `Você pediu para ser lembrado:\n\n📝 **${mensagem}**`,
            color: 0x3498db,
            user: interaction.user,
          });
          await interaction.user.send({ embeds: [embed] });
        } catch (err) {
          logger.warn({ err, userId }, "Não foi possível enviar lembrete via DM");
        }
      }, ms);

      userReminders.push({ timeout, text: mensagem, channelId, endsAt });

      const embed = createEmbed({
        title: "⏰ Lembrete Definido",
        description: `Vou te lembrar <t:${Math.floor(endsAt / 1000)}:R>!\n\n📝 **${mensagem}**`,
        color: 0x3498db,
        user: interaction.user,
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      logger.error({ err: error, command: "lembrete" }, "Erro no comando /lembrete");
      const msg = { content: "❌ Ocorreu um erro ao definir o lembrete.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
  },
};
