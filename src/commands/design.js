const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("design")
    .setDescription("Painel da equipe de Design")
    .addSubcommand(sub => 
      sub.setName("painel")
      .setDescription("Cria o painel fixo de pedidos de artes para a staff")
    ),

  async execute(interaction) {
    // 1. Cria o Painel Fixo com o Botão
    if (interaction.options.getSubcommand() === "painel") {
      const embedPainel = new EmbedBuilder()
        .setTitle("🎨 Central de Pedidos - WDA Design")
        .setColor("#c8d6e5")
        .setDescription("Precisa de uma arte para um evento, jornal ou anúncio?\n\nClique no botão abaixo para preencher o formulário de pedido. Nossa equipe será notificada imediatamente!");

      const btnPedir = new ButtonBuilder()
        .setCustomId("modal_pedido_design")
        .setLabel("📝 Fazer um Pedido")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🖋️");

      const row = new ActionRowBuilder().addComponents(btnPedir);

      await interaction.reply({ embeds: [embedPainel], components: [row] });
    }
  },

  // Essa parte escuta quando alguém clica no botão "Fazer um Pedido" em qualquer lugar do servidor
  async handleButton(interaction) {
    if (interaction.customId === "modal_pedido_design") {
      // Cria a janelinha Pop-up (Modal)
      const modal = new ModalBuilder()
        .setCustomId("submit_pedido_design")
        .setTitle("Formulário de Arte");

      const inputTipo = new TextInputBuilder()
        .setCustomId("tipo_arte")
        .setLabel("Qual o tipo de arte? (Banner, Ícone, etc)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const inputDetalhes = new TextInputBuilder()
        .setCustomId("detalhes_arte")
        .setLabel("Descreva como você quer a arte (Cores, texto)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const inputPrazo = new TextInputBuilder()
        .setCustomId("prazo_arte")
        .setLabel("Para quando você precisa?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(inputTipo),
        new ActionRowBuilder().addComponents(inputDetalhes),
        new ActionRowBuilder().addComponents(inputPrazo)
      );

      // Mostra o formulário na tela do membro
      await interaction.showModal(modal);
    }
  },

  // Essa parte escuta quando a pessoa clica em "Enviar" no formulário
  async handleModal(interaction) {
    if (interaction.customId === "submit_pedido_design") {
      const tipo = interaction.fields.getTextInputValue("tipo_arte");
      const detalhes = interaction.fields.getTextInputValue("detalhes_arte");
      const prazo = interaction.fields.getTextInputValue("prazo_arte");

      const embedPedido = new EmbedBuilder()
        .setTitle("🔔 Novo Pedido de Design")
        .setColor("#c8d6e5")
        .addFields(
          { name: "👤 Solicitado por", value: `${interaction.user} (${interaction.user.tag})` },
          { name: "📌 Tipo de Arte", value: tipo },
          { name: "📝 Detalhes", value: detalhes },
          { name: "⏳ Prazo", value: prazo }
        )
        .setTimestamp();

      // Botões para os Designers Aceitarem/Recusarem (A lógica de clique pode ser feita depois!)
      const botoesGestao = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("aceitar_pedido").setLabel("Aceitar").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("recusar_pedido").setLabel("Recusar").setStyle(ButtonStyle.Danger)
      );

      // Manda o pedido para o canal de bate-papo do Design
      const canalDesign = interaction.guild.channels.cache.find(c => c.name.includes("chat-design"));
      
      if (canalDesign) {
        await canalDesign.send({ content: "<@&1480453030410457158> Novo pedido recebido!", embeds: [embedPedido], components: [botoesGestao] });
        await interaction.reply({ content: "✅ O seu pedido foi enviado com sucesso para a equipe de Design!", ephemeral: true });
      } else {
        await interaction.reply({ content: "❌ Canal da equipe de Design não encontrado.", ephemeral: true });
      }
    }
  }
};