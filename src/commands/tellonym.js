const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
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
    title: "💌 WDA Tellonym • Correio Elegante",
    description: [
      "**Tem algo no coração que quer dizer? 🥺**",
      "",
      "Aqui você pode enviar uma cartinha para alguém especial!",
      "Escolha como você quer se identificar. 💖",
      "",
      "**Como funciona?**",
      "👻 **Anônimo** — O destinatário não saberá quem enviou",
      "✍️ **Assinado** — Sua identidade aparece na cartinha",
      "📮 Clique em um dos botões abaixo para começar!",
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
    .setDescription("Sistema de Correio Elegante do WDA 💌")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName("painel")
        .setDescription("Envia o painel do Correio Elegante no canal atual")
        .addChannelOption(opt =>
          opt
            .setName("canal_destino")
            .setDescription("Canal onde as cartinhas serão postadas publicamente")
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

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("tellonym_btn_anonimo")
        .setLabel("Enviar Anônimo")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("👻"),
      new ButtonBuilder()
        .setCustomId("tellonym_btn_assinado")
        .setLabel("Enviar Assinado")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("✍️")
    );

    // O painel é permanente — enviamos no canal atual (não efêmero)
    await interaction.reply({
      content: `✅ Painel configurado! As cartinhas serão postadas em ${canalDestino}.`,
      flags: MessageFlags.Ephemeral
    });

    await interaction.channel.send({ embeds: [buildPanelEmbed()], components: [row] }).catch(() => {});
  },

  // ────────────────────────────────────────────
  // HANDLER DE BOTÃO  tellonym_btn_anonimo / tellonym_btn_assinado
  // ────────────────────────────────────────────
  async handleButton(interaction) {
    const { customId } = interaction;
    if (!customId.startsWith("tellonym_btn_")) return;

    const tipo = customId === "tellonym_btn_anonimo" ? "anonimo" : "assinado";

    const selectMenu = new UserSelectMenuBuilder()
      .setCustomId(`tellonym_select_${tipo}`)
      .setPlaceholder("Para quem é a cartinha? 💌")
      .setMinValues(1)
      .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      content: "💌 Escolha o destinatário da sua cartinha:",
      components: [row],
      flags: MessageFlags.Ephemeral
    });
  },

  // ────────────────────────────────────────────
  // HANDLER DE USER SELECT MENU  tellonym_select_<tipo>
  // ────────────────────────────────────────────
  async handleUserSelectMenu(interaction) {
    if (!interaction.customId.startsWith("tellonym_select_")) return;

    const tipo = interaction.customId.replace("tellonym_select_", "");
    const userId = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`tellonym_modal_${tipo}_${userId}`)
      .setTitle(tipo === "anonimo" ? "💌 Cartinha Anônima" : "💌 Cartinha Assinada");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("tellonym_mensagem")
          .setLabel("Sua mensagem 💬")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Escreva o que está no coração... 🌸")
          .setRequired(true)
          .setMaxLength(550)
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

    await interaction.showModal(modal);
  },

  // ────────────────────────────────────────────
  // HANDLER DE MODAL  tellonym_modal_<tipo>_<userId>
  // ────────────────────────────────────────────
  async handleModal(interaction) {
    if (!interaction.customId.startsWith("tellonym_modal_")) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // customId format: tellonym_modal_<tipo>_<userId>
    // userId é um Snowflake numérico — não contém "_", então split seguro
    const parts = interaction.customId.split("_");
    const tipo = parts[2];          // "anonimo" ou "assinado"
    const destinatarioId = parts[3]; // Snowflake do destinatário

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

    const isAnonimo = tipo === "anonimo";

    const embedCartinha = createEmbed({
      title: isAnonimo ? "💌 Uma Cartinha Anônima chegou para você!" : "💌 Uma Cartinha chegou para você!",
      description: [
        `> ${mensagem.split("\n").join("\n> ")}`,
        "",
        isAnonimo ? "🤫 *O remetente preferiu manter o anonimato...*" : ""
      ].join("\n").trimEnd(),
      color: PINK_LIGHT,
      footer: isAnonimo
        ? { text: "WDA - Tellonym 👻 | Mensagem Anônima", iconURL: interaction.client.user.displayAvatarURL() }
        : { text: "WDA - Tellonym ✍️", iconURL: interaction.client.user.displayAvatarURL() },
      ...(!isAnonimo && {
        author: {
          name: interaction.user.displayName || interaction.user.username,
          iconURL: interaction.user.displayAvatarURL()
        }
      }),
      ...(imagemUrl && { image: imagemUrl })
    });

    // Envia a cartinha no canal de destino com menção fora do embed
    try {
      await canalDestino.send({
        content: `💌 Tem uma nova cartinha para você, <@${destinatarioId}>!`,
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
        tipo,
        destinatarioId,
        canalDestinoId: config.canalDestinoId
      });
    } catch (err) {
      // Falha no log não deve impedir o envio
      logger.warn({ err }, "Tellonym: falha ao gravar log de auditoria");
    }

    logger.info(
      { guildId: interaction.guildId, autorId: interaction.user.id, tipo, destinatarioId },
      "Tellonym: cartinha enviada com sucesso"
    );

    await interaction.editReply({
      content: "✅ Sua cartinha foi entregue com sucesso! 💌🌸\n*Lembre-se: seja sempre gentil e respeitoso.*"
    });
  }
};
