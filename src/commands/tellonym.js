const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");
const { createEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { logger } = require("../logger");
const fs = require("node:fs/promises");
const path = require("node:path");

// ──────────────────────────────────────────────
// Stores
// ──────────────────────────────────────────────
const configStore = createDataStore("tellonym_config.json");

// Log file para auditoria da staff (não exposto ao público).
// Usa NDJSON (uma entrada JSON por linha) para evitar reler e reescrever o arquivo inteiro.
const LOG_PATH = path.join(process.cwd(), "data", "tellonym_logs.ndjson");

async function appendLog(entry) {
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fs.appendFile(LOG_PATH, JSON.stringify(entry) + "\n", "utf8");
}

// ──────────────────────────────────────────────
// Helpers de embed
// ──────────────────────────────────────────────
const PINK = 0xf368e0;
const PINK_LIGHT = 0xff9ff3;

function buildPanelEmbed() {
  return createEmbed({
    title: "💌 WDA Tellonym • Correio Anônimo",
    description: [
      "**Tem algo no coração que quer dizer, mas tem vergonha? 🥺**",
      "",
      "Aqui você pode enviar uma cartinha anônima para alguém especial!",
      "Ninguém vai saber que foi você — só o amor vai chegar. 💖",
      "",
      "**Como funciona?**",
      "🤫 Clique no botão abaixo",
      "✍️ Escreva para quem é e o que sente",
      "📮 O bot entrega de forma completamente anônima!",
      "",
      "> *Seja gentil. Uma palavra pode mudar o dia de alguém.* 🌸"
    ].join("\n"),
    color: PINK,
    footer: { text: "WDA — Tellonym • Nenhuma mensagem ofensiva será tolerada 💌" },
    thumbnail: "https://cdn.discordapp.com/emojis/1015437992920051752.webp"
  });
}

// ──────────────────────────────────────────────
// Módulo exportado
// ──────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName("tellonym")
    .setDescription("Sistema de Correio Anônimo do WDA 💌")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName("painel")
        .setDescription("Envia o painel do Correio Anônimo no canal atual")
        .addChannelOption(opt =>
          opt
            .setName("canal_destino")
            .setDescription("Canal onde as cartinhas anônimas serão postadas publicamente")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    ),

  // ────────────────────────────────────────────
  // COMANDO SLASH  /tellonym painel
  // ────────────────────────────────────────────
  async execute(interaction) {
    if (interaction.options.getSubcommand() !== "painel") return;

    const canalDestino = interaction.options.getChannel("canal_destino");

    // Persiste o canal de destino vinculado à guilda
    await configStore.set(interaction.guildId, { canalDestinoId: canalDestino.id });

    logger.info(
      { guildId: interaction.guildId, canalDestinoId: canalDestino.id },
      "Tellonym: painel configurado"
    );

    const embedPainel = buildPanelEmbed();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("tellonym_abrir_modal")
        .setLabel("💌 Enviar Cartinha Anônima")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("💖")
    );

    // O painel é permanente — enviamos no canal atual (não efêmero)
    await interaction.reply({
      content: `✅ Painel configurado! As cartinhas serão postadas em ${canalDestino}.`,
      ephemeral: true
    });

    await interaction.channel.send({ embeds: [embedPainel], components: [row] });
  },

  // ────────────────────────────────────────────
  // HANDLER DE BOTÃO  tellonym_abrir_modal
  // ────────────────────────────────────────────
  async handleButton(interaction) {
    if (interaction.customId !== "tellonym_abrir_modal") return;

    const modal = new ModalBuilder()
      .setCustomId("tellonym_submit_modal")
      .setTitle("💌 Enviar Cartinha Anônima");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("tellonym_para")
          .setLabel("Para quem é a mensagem? (ID ou @Nome)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Ex: 123456789012345678 ou Akira")
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("tellonym_mensagem")
          .setLabel("Sua mensagem anônima 💬")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Escreva o que está no coração... 🌸")
          .setRequired(true)
          .setMaxLength(1800)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("tellonym_imagem")
          .setLabel("Link de uma imagem (Opcional)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("https://...")
          .setRequired(false)
          .setMaxLength(500)
      )
    );

    // showModal() DEVE ser a única resposta a esta interação
    await interaction.showModal(modal);
  },

  // ────────────────────────────────────────────
  // HANDLER DE MODAL  tellonym_submit_modal
  // ────────────────────────────────────────────
  async handleModal(interaction) {
    if (interaction.customId !== "tellonym_submit_modal") return;

    await interaction.deferReply({ ephemeral: true });

    // Recupera o canal de destino configurado para esta guilda
    const config = await configStore.get(interaction.guildId);
    if (!config?.canalDestinoId) {
      return interaction.editReply({
        content: "❌ O sistema de Tellonym ainda não foi configurado neste servidor. Um administrador precisa usar `/tellonym painel` primeiro."
      });
    }

    const canalDestino = interaction.guild.channels.cache.get(config.canalDestinoId);
    if (!canalDestino) {
      return interaction.editReply({
        content: "❌ O canal de destino configurado não foi encontrado. Por favor, peça a um administrador para reconfigurar com `/tellonym painel`."
      });
    }

    // Lê os campos do modal
    const para      = interaction.fields.getTextInputValue("tellonym_para").trim();
    const mensagem  = interaction.fields.getTextInputValue("tellonym_mensagem").trim();
    const imagemRaw = interaction.fields.getTextInputValue("tellonym_imagem").trim();

    // Valida URL da imagem usando o construtor URL (mais robusto que regex simples)
    let imagemUrl = null;
    if (imagemRaw) {
      try {
        const parsed = new URL(imagemRaw);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          imagemUrl = imagemRaw;
        }
      } catch {
        // URL inválida — ignora silenciosamente
      }
    }

    // Tenta resolver menção: se for um Snowflake do Discord (17-20 dígitos), busca o membro
    let mencao = para;
    // Discord Snowflake IDs are 17-20 digit numbers
    const ID_REGEX = /^\d{17,20}$/;
    if (ID_REGEX.test(para)) {
      try {
        const membro = await interaction.guild.members.fetch(para);
        mencao = `<@${membro.id}>`;
      } catch {
        // ID não encontrado — usa o texto literal mesmo
      }
    }

    // Monta o embed fofo da cartinha
    const embedCartinha = createEmbed({
      title: "💌 Uma Cartinha Anônima chegou para você!",
      description: [
        `> ${mensagem.split("\n").join("\n> ")}`,
        "",
        "🤫 *O remetente preferiu manter o anonimato...*"
      ].join("\n"),
      color: PINK_LIGHT,
      footer: {
        text: "WDA — Tellonym • Correio Anônimo 💌",
        iconURL: interaction.client.user.displayAvatarURL()
      },
      ...(imagemUrl && { image: imagemUrl })
    });

    // Envia a cartinha no canal de destino com menção fora do embed
    try {
      await canalDestino.send({
        content: `💌 Tem uma nova cartinha para você, ${mencao}!`,
        embeds: [embedCartinha]
      });
    } catch (err) {
      logger.error({ err, guildId: interaction.guildId }, "Tellonym: erro ao enviar cartinha");
      return interaction.editReply({
        content: "❌ Não foi possível enviar a cartinha. Verifique se o bot tem permissão de enviar mensagens no canal de destino."
      });
    }

    // Log de auditoria (staff only — não exposto ao público)
    try {
      await appendLog({
        timestamp: new Date().toISOString(),
        guildId: interaction.guildId,
        autorId: interaction.user.id,
        autorTag: interaction.user.tag,
        para,
        canalDestinoId: config.canalDestinoId
      });
    } catch (err) {
      // Falha no log não deve impedir o envio
      logger.warn({ err }, "Tellonym: falha ao gravar log de auditoria");
    }

    logger.info(
      { guildId: interaction.guildId, autorId: interaction.user.id, canalDestinoId: config.canalDestinoId },
      "Tellonym: cartinha enviada com sucesso"
    );

    await interaction.editReply({
      content: "✅ Sua cartinha foi entregue com sucesso! 💌🌸\n*Lembre-se: seja sempre gentil e respeitoso.*"
    });
  }
};
