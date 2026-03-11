const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { logger } = require("../logger");

// Armazena sorteios ativos: Map<messageId, { prize, hostId, endTime, channelId, guildId, timeout, participants }>
const activeSorteios = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sorteio")
    .setDescription("Cria um sorteio rápido no canal atual")
    .addStringOption((opt) =>
      opt.setName("premio").setDescription("O que será sorteado (ex: Nitro, VIP, Cargo)").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("duracao")
        .setDescription("Duração do sorteio (ex: 1m, 5m, 1h, 1d)")
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("vencedores")
        .setDescription("Quantidade de vencedores (padrão: 1)")
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      const premio = interaction.options.getString("premio");
      const duracaoInput = interaction.options.getString("duracao");
      const numVencedores = interaction.options.getInteger("vencedores") || 1;

      const ms = parseDuration(duracaoInput);
      if (!ms) {
        return interaction.reply({
          embeds: [createErrorEmbed("Formato de duração inválido. Use: `1m`, `5m`, `1h`, `1d`.", interaction.user)],
          ephemeral: true,
        });
      }

      // Limite: 7 dias
      if (ms > 7 * 24 * 60 * 60 * 1000) {
        return interaction.reply({
          embeds: [createErrorEmbed("A duração máxima de um sorteio é de **7 dias**.", interaction.user)],
          ephemeral: true,
        });
      }

      const endTime = Date.now() + ms;

      const embed = createEmbed({
        title: "🎉 SORTEIO!",
        description: [
          `**Prêmio:** ${premio}`,
          `**Vencedores:** ${numVencedores}`,
          `**Termina:** <t:${Math.floor(endTime / 1000)}:R>`,
          `**Criado por:** ${interaction.user}`,
          "",
          "Clique no botão abaixo para participar!",
        ].join("\n"),
        color: 0xff6b6b,
        footer: `Sorteio criado por ${interaction.user.username}`,
        user: interaction.user,
      });

      const button = new ButtonBuilder()
        .setCustomId("sorteio_participar")
        .setLabel("🎉 Participar")
        .setStyle(ButtonStyle.Success);

      const countBtn = new ButtonBuilder()
        .setCustomId("sorteio_count")
        .setLabel("0 participantes")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

      const row = new ActionRowBuilder().addComponents(button, countBtn);

      await interaction.reply({ embeds: [embed], components: [row] });
      const msg = await interaction.fetchReply();

      const sorteioData = {
        prize: premio,
        hostId: interaction.user.id,
        endTime,
        channelId: interaction.channelId,
        guildId: interaction.guildId,
        numVencedores,
        participants: new Set(),
        timeout: null,
      };

      sorteioData.timeout = setTimeout(async () => {
        await finalizeSorteio(msg.id, interaction.client);
      }, ms);

      activeSorteios.set(msg.id, sorteioData);
    } catch (error) {
      logger.error({ err: error, command: "sorteio" }, "Erro no comando /sorteio");
      const msg = { content: "❌ Ocorreu um erro ao criar o sorteio.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
  },

  async handleButton(interaction) {
    try {
      if (!interaction.customId.startsWith("sorteio_")) return;
      if (interaction.customId === "sorteio_count") return;

      const msgId = interaction.message.id;
      const sorteio = activeSorteios.get(msgId);

      if (!sorteio) {
        return interaction.reply({
          content: "❌ Este sorteio já foi encerrado.",
          ephemeral: true,
        });
      }

      const userId = interaction.user.id;

      if (sorteio.participants.has(userId)) {
        sorteio.participants.delete(userId);
        await updateParticipantCount(interaction, sorteio);
        return interaction.reply({
          content: "❎ Você saiu do sorteio.",
          ephemeral: true,
        });
      }

      sorteio.participants.add(userId);
      await updateParticipantCount(interaction, sorteio);
      return interaction.reply({
        content: "🎉 Você entrou no sorteio! Boa sorte!",
        ephemeral: true,
      });
    } catch (error) {
      if (error.code === 10062) return;
      logger.error({ err: error, command: "sorteio" }, "Erro no handleButton do sorteio");
    }
  },
};

async function updateParticipantCount(interaction, sorteio) {
  try {
    const count = sorteio.participants.size;
    const button = new ButtonBuilder()
      .setCustomId("sorteio_participar")
      .setLabel("🎉 Participar")
      .setStyle(ButtonStyle.Success);

    const countBtn = new ButtonBuilder()
      .setCustomId("sorteio_count")
      .setLabel(`${count} participante${count !== 1 ? "s" : ""}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const row = new ActionRowBuilder().addComponents(button, countBtn);
    await interaction.message.edit({ components: [row] }).catch(() => {});
  } catch {
    // silently fail on edit
  }
}

async function finalizeSorteio(msgId, client) {
  const sorteio = activeSorteios.get(msgId);
  if (!sorteio) return;

  activeSorteios.delete(msgId);

  try {
    const channel = await client.channels.fetch(sorteio.channelId).catch(() => null);
    if (!channel) return;

    const msg = await channel.messages.fetch(msgId).catch(() => null);

    const participants = [...sorteio.participants];

    // Desativa os botões
    const disabledBtn = new ButtonBuilder()
      .setCustomId("sorteio_participar")
      .setLabel("🎉 Encerrado")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const countBtn = new ButtonBuilder()
      .setCustomId("sorteio_count")
      .setLabel(`${participants.length} participante${participants.length !== 1 ? "s" : ""}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const disabledRow = new ActionRowBuilder().addComponents(disabledBtn, countBtn);
    if (msg) await msg.edit({ components: [disabledRow] }).catch(() => {});

    if (participants.length === 0) {
      const embed = createEmbed({
        title: "🎉 Sorteio Encerrado",
        description: `**Prêmio:** ${sorteio.prize}\n\n😢 Ninguém participou do sorteio.`,
        color: 0x95a5a6,
      });
      await channel.send({ embeds: [embed] });
      return;
    }

    // Seleciona vencedores aleatoriamente
    const shuffled = participants.sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, Math.min(sorteio.numVencedores, participants.length));

    const winnerMentions = winners.map((id) => `<@${id}>`).join(", ");
    const embed = createEmbed({
      title: "🎉🏆 Sorteio Encerrado!",
      description: [
        `**Prêmio:** ${sorteio.prize}`,
        `**Vencedor${winners.length > 1 ? "es" : ""}:** ${winnerMentions}`,
        `**Participantes:** ${participants.length}`,
        "",
        "Parabéns! 🥳",
      ].join("\n"),
      color: 0x2ecc71,
    });

    await channel.send({
      content: `🎊 ${winnerMentions} — Parabéns! Você${winners.length > 1 ? "s ganharam" : " ganhou"} **${sorteio.prize}**!`,
      embeds: [embed],
    });
  } catch (err) {
    logger.error({ err, msgId }, "Erro ao finalizar sorteio");
  }
}

function parseDuration(input) {
  const regex = /^(\d+)\s*(s|seg|segundo|segundos|m|min|minuto|minutos|h|hora|horas|d|dia|dias)$/i;
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
