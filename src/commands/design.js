const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
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
    if (interaction.options.getSubcommand() === "painel") {
      const embedPainel = new EmbedBuilder()
        .setTitle("🎨 Central de Pedidos - WDA Design")
        .setColor("#c8d6e5")
        .setDescription("Precisa de uma arte para um evento, jornal ou anúncio?\n\nClique no botão abaixo para preencher o formulário de pedido. Nossa equipe será notificada imediatamente!");

      // 🔄 REVERTIDO: Voltamos para o ID original. Os painéis antigos vão funcionar de novo!
      const btnPedir = new ButtonBuilder()
        .setCustomId("modal_pedido_design")
        .setLabel("📝 Fazer um Pedido")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🖋️");

      const row = new ActionRowBuilder().addComponents(btnPedir);

      await interaction.reply({ embeds: [embedPainel], components: [row] });
    }
  },

  async handleButton(interaction) {
    // 🛡️ MÁGICA: Ele aceita o clique do painel original E do painel novo que criamos antes
    if (interaction.customId === "modal_pedido_design" || interaction.customId === "design_modal_pedido") {
      
      // Modal original ressuscitado
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

      await interaction.showModal(modal);
    }

    // ✅ AQUI É A CORREÇÃO REAL: Os botões de aceitar e recusar ganharam "_design" no nome
    // para o seu roteador (interactionCreate) conseguir achar eles e não dar "Interação Falhou".
    if (interaction.customId === "aceitar_pedido_design") {
      await interaction.deferUpdate(); 
      
      const embedAtualizada = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor("#2ecc71") // Verde
        .setTitle("✅ Pedido de Design Aceito")
        .addFields({ name: "🛠️ Status", value: `Aceito e em produção por ${interaction.user}` });

      await interaction.message.edit({ embeds: [embedAtualizada], components: [] }); 
      await interaction.followUp({ content: `Você assumiu o pedido de arte! Bom trabalho.`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === "recusar_pedido_design") {
      await interaction.deferUpdate(); 
      
      const embedAtualizada = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor("#e74c3c") // Vermelho
        .setTitle("❌ Pedido de Design Recusado")
        .addFields({ name: "🛠️ Status", value: `Recusado por ${interaction.user}` });

      await interaction.message.edit({ embeds: [embedAtualizada], components: [] });
      await interaction.followUp({ content: `Você recusou o pedido de arte.`, flags: MessageFlags.Ephemeral });
    }
  },

  async handleModal(interaction) {
    // Aceita o envio do modal original ou do novo
    if (interaction.customId === "submit_pedido_design" || interaction.customId === "design_submit_pedido") {
      
      // Pega o valor independente de qual modal a pessoa enviou
      const tipo = interaction.fields.getTextInputValue("tipo_arte") || interaction.fields.getTextInputValue("design_tipo_arte");
      const detalhes = interaction.fields.getTextInputValue("detalhes_arte") || interaction.fields.getTextInputValue("design_detalhes_arte");
      const prazo = interaction.fields.getTextInputValue("prazo_arte") || interaction.fields.getTextInputValue("design_prazo_arte");

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

      // Botões para os Designers com a tag "_design" para funcionar sem dar falha
      const botoesGestao = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("aceitar_pedido_design").setLabel("Aceitar").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("recusar_pedido_design").setLabel("Recusar").setStyle(ButtonStyle.Danger)
      );

      const canalDesign = interaction.guild.channels.cache.find(c => c.name.includes("chat-design"));

      if (canalDesign) {
        await canalDesign.send({ content: "<@&1480453030410457158> Novo pedido recebido!", embeds: [embedPedido], components: [botoesGestao] });
        await interaction.reply({ content: "✅ O seu pedido foi enviado com sucesso para a equipe de Design!", flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: "❌ Canal da equipe de Design não encontrado. Verifique se existe um canal com 'chat-design' no nome.", flags: MessageFlags.Ephemeral });
      }
    }
  }
};