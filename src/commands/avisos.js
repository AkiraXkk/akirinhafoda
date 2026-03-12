const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { logger } = require("../logger");

// Mapa em memória para guardar os dados do anúncio entre o modal e o botão de confirmação.
// Chave: userId | Valor: { tipo, titulo, conteudo, canalId, pingText }
// ⚠️ Propositalmente efêmero: os dados só precisam existir durante os segundos entre o modal
// e o clique em Confirmar/Cancelar. Reiniciar o bot descartará pending entries não confirmados,
// o que é comportamento aceitável para este fluxo de curta duração.
// Um usuário pode ter apenas um anúncio pendente de confirmação por vez.
const pendingAvisos = new Map();

// Configurações de estilo por tipo de anúncio
const TIPOS_AVISO = {
  normal:  { emoji: "📌", cor: 0x5865F2, label: "Aviso Normal" },
  urgente: { emoji: "🚨", cor: 0xe74c3c, label: "Urgente" },
  evento:  { emoji: "🎉", cor: 0x2ecc71, label: "Evento" },
  regras:  { emoji: "📋", cor: 0xf1c40f, label: "Atualização de Regras" }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("avisos")
    .setDescription("Painel interativo para criação de anúncios oficiais do servidor")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub.setName("painel")
        .setDescription("Envia o painel de seleção de tipo de anúncio neste canal")
    ),

  async execute(interaction) {
    if (interaction.options.getSubcommand() === "painel") {
      const embedPainel = createEmbed({
        title: "📢 Central de Anúncios WDA",
        description:
          "Selecione o **tipo de anúncio** que deseja criar clicando em um dos botões abaixo.\n\n" +
          "📌 **Aviso Normal** — Comunicados gerais do servidor\n" +
          "🚨 **Urgente** — Avisos que precisam de atenção imediata\n" +
          "🎉 **Evento** — Anúncios de eventos e atividades especiais\n" +
          "📋 **Regras** — Atualizações nas regras do servidor",
        color: 0x5865F2,
        footer: { text: "WDA • Apenas Staff pode usar este painel" }
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("avisos_tipo_normal").setLabel("📌 Aviso Normal").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("avisos_tipo_urgente").setLabel("🚨 Urgente").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("avisos_tipo_evento").setLabel("🎉 Evento").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("avisos_tipo_regras").setLabel("📋 Regras").setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({ embeds: [embedPainel], components: [row] });
    }
  },

  // ==========================================
  // HANDLER DE BOTÕES
  // ==========================================
  async handleButton(interaction) {
    // Botões do painel de seleção: abrem o modal de criação do anúncio
    if (interaction.customId.startsWith("avisos_tipo_")) {
      const tipo = interaction.customId.replace("avisos_tipo_", "");
      const tipoConfig = TIPOS_AVISO[tipo] || TIPOS_AVISO.normal;

      const modal = new ModalBuilder()
        .setCustomId(`avisos_modal_${tipo}`)
        .setTitle(`📢 Criar Anúncio: ${tipoConfig.label}`);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("avisos_titulo")
            .setLabel("Título do Anúncio")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("avisos_conteudo")
            .setLabel("Conteúdo / Mensagem")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(2000)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("avisos_canal_id")
            .setLabel("ID do canal de destino (vazio = canal atual)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(20)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("avisos_ping")
            .setLabel("Menção (@everyone / @here / ID de cargo)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(100)
        )
      );

      // showModal() DEVE ser a única resposta — sem defer antes.
      await interaction.showModal(modal);
    }

    // Botão de confirmação: publica o anúncio após o preview
    if (interaction.customId.startsWith("avisos_confirmar_")) {
      await interaction.deferUpdate();

      const aviso = pendingAvisos.get(interaction.user.id);
      if (!aviso) {
        return interaction.followUp({ content: "❌ Dados do anúncio não encontrados. Por favor, preencha o formulário novamente.", flags: MessageFlags.Ephemeral });
      }

      const canalDestino = aviso.canalId
        ? interaction.guild.channels.cache.get(aviso.canalId)
        : interaction.channel;

      if (!canalDestino) {
        return interaction.followUp({ content: `❌ Canal com ID \`${aviso.canalId}\` não encontrado neste servidor.`, flags: MessageFlags.Ephemeral });
      }

      const tipoConfig = TIPOS_AVISO[aviso.tipo] || TIPOS_AVISO.normal;

      const embedFinal = createEmbed({
        title: `${tipoConfig.emoji} ${aviso.titulo}`,
        description: aviso.conteudo,
        color: tipoConfig.cor,
        footer: { text: `Publicado por ${interaction.user.username} • WDA` }
      });

      try {
        await canalDestino.send({ content: aviso.pingText || null, embeds: [embedFinal] });
        pendingAvisos.delete(interaction.user.id);
        logger.info({ userId: interaction.user.id, tipo: aviso.tipo, canal: canalDestino.id }, "Aviso publicado");
        await interaction.editReply({
          content: `✅ Anúncio publicado com sucesso em ${canalDestino}!`,
          embeds: [],
          components: []
        });
      } catch (e) {
        logger.error({ err: e, userId: interaction.user.id }, "Erro ao publicar aviso");
        await interaction.followUp({
          content: "❌ Não foi possível enviar o anúncio. Verifique se o bot tem permissão de enviar mensagens no canal de destino.",
          flags: MessageFlags.Ephemeral
        });
      }
    }

    // Botão de cancelamento: descarta o preview
    if (interaction.customId.startsWith("avisos_cancelar_")) {
      await interaction.deferUpdate();
      pendingAvisos.delete(interaction.user.id);
      await interaction.editReply({ content: "❌ Anúncio cancelado.", embeds: [], components: [] });
    }
  },

  // ==========================================
  // HANDLER DE MODAIS
  // ==========================================
  async handleModal(interaction) {
    if (interaction.customId.startsWith("avisos_modal_")) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const tipo = interaction.customId.replace("avisos_modal_", "");
      const tipoConfig = TIPOS_AVISO[tipo] || TIPOS_AVISO.normal;

      const titulo    = interaction.fields.getTextInputValue("avisos_titulo");
      const conteudo  = interaction.fields.getTextInputValue("avisos_conteudo");
      const canalIdRaw = interaction.fields.getTextInputValue("avisos_canal_id").trim();
      const pingRaw   = interaction.fields.getTextInputValue("avisos_ping").trim();

      const canalId  = canalIdRaw || null;

      // Valida e sanitiza o campo de menção: aceita apenas @everyone, @here ou <@&ROLEID>
      const PING_REGEX = /^(@everyone|@here|<@&\d{17,20}>)$/;
      const pingText = (pingRaw && PING_REGEX.test(pingRaw)) ? pingRaw : null;
      if (pingRaw && !PING_REGEX.test(pingRaw)) {
        return interaction.editReply({ embeds: [createErrorEmbed(`Menção inválida: \`${pingRaw}\`\n\nFormatos aceitos: \`@everyone\`, \`@here\` ou \`<@&CARGO_ID>\`.`)] });
      }

      // Valida o canal se informado — antes de gravar no Map para evitar entradas obsoletas
      if (canalId) {
        const canalTeste = interaction.guild.channels.cache.get(canalId);
        if (!canalTeste) {
          return interaction.editReply({ embeds: [createErrorEmbed(`Canal com ID \`${canalId}\` não encontrado. Verifique o ID e tente novamente.`)] });
        }
      }

      // Guarda os dados em memória para o botão de confirmação acessar
      pendingAvisos.set(interaction.user.id, { tipo, titulo, conteudo, canalId, pingText });

      // Constrói o embed de preview
      const embedPreview = createEmbed({
        title: `${tipoConfig.emoji} ${titulo}`,
        description: conteudo,
        color: tipoConfig.cor,
        footer: { text: `Preview — Publicado por ${interaction.user.username} • WDA` }
      });

      const canalAlvo = canalId
        ? interaction.guild.channels.cache.get(canalId)
        : interaction.channel;

      const rowConfirm = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`avisos_confirmar_${tipo}`).setLabel("✅ Confirmar e Publicar").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`avisos_cancelar_${tipo}`).setLabel("❌ Cancelar").setStyle(ButtonStyle.Danger)
      );

      await interaction.editReply({
        content: [
          `🔍 **Preview do anúncio** | Tipo: **${tipoConfig.label}**`,
          `📤 Canal de destino: ${canalAlvo || interaction.channel}`,
          pingText ? `🔔 Menção: \`${pingText}\`` : "🔕 Sem menção",
          "",
          "Revise o embed abaixo e clique em **Confirmar** para publicar."
        ].join("\n"),
        embeds: [embedPreview],
        components: [rowConfirm]
      });
    }
  }
};
