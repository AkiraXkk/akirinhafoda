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

      // 🚨 MUDANÇA: O ID agora tem 'design_' no começo para o interactionCreate achar ele!
      const btnPedir = new ButtonBuilder()
        .setCustomId("design_modal_pedido")
        .setLabel("📝 Fazer um Pedido")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🖋️");

      const row = new ActionRowBuilder().addComponents(btnPedir);

      await interaction.reply({ embeds: [embedPainel], components: [row] });
    }
  },

  // Essa parte escuta quando alguém clica nos botões
  async handleButton(interaction) {
    // 1. Botão de abrir o formulário
    if (interaction.customId === "design_modal_pedido") {
      // Cria a janelinha Pop-up (Modal)
      const modal = new ModalBuilder()
        .setCustomId("design_submit_pedido")
        .setTitle("Formulário de Arte");

      const inputTipo = new TextInputBuilder()
        .setCustomId("design_tipo_arte")
        .setLabel("Qual o tipo de arte? (Banner, Ícone, etc)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const inputDetalhes = new TextInputBuilder()
        .setCustomId("design_detalhes_arte")
        .setLabel("Descreva como você quer a arte (Cores, texto)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const inputPrazo = new TextInputBuilder()
        .setCustomId("design_prazo_arte")
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

    // 🚨 AQUI ESTAVA O SEGREDO: A lógica de Aceitar e Recusar foi implementada!
    if (interaction.customId === "design_aceitar") {
      await interaction.deferUpdate(); // Avisa o Discord que estamos processando
      
      const embedAtualizada = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor("#2ecc71") // Fica verde
        .setTitle("✅ Pedido de Design Aceito")
        .addFields({ name: "🛠️ Status", value: `Aceito e em produção por ${interaction.user}` });

      // Atualiza a mensagem original mudando a cor do embed e sumindo com os botões
      await interaction.message.edit({ embeds: [embedAtualizada], components: [] }); 
      
      await interaction.followUp({ content: `Você assumiu o pedido de arte! Bom trabalho.`, ephemeral: true });
    }

    if (interaction.customId === "design_recusar") {
      await interaction.deferUpdate(); 
      
      const embedAtualizada = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor("#e74c3c") // Fica vermelho
        .setTitle("❌ Pedido de Design Recusado")
        .addFields({ name: "🛠️ Status", value: `Recusado por ${interaction.user}` });

      await interaction.message.edit({ embeds: [embedAtualizada], components: [] });
      
      await interaction.followUp({ content: `Você recusou o pedido de arte.`, ephemeral: true });
    }
  },

  // Essa parte escuta quando a pessoa clica em "Enviar" no formulário
  async handleModal(interaction) {
    if (interaction.customId === "design_submit_pedido") {
      const tipo = interaction.fields.getTextInputValue("design_tipo_arte");
      const detalhes = interaction.fields.getTextInputValue("design_detalhes_arte");
      const prazo = interaction.fields.getTextInputValue("design_prazo_arte");

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

      // 🚨 MUDANÇA: Colocando 'design_' na frente para o roteador achar!
      const botoesGestao = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("design_aceitar").setLabel("Aceitar").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("design_recusar").setLabel("Recusar").setStyle(ButtonStyle.Danger)
      );

      // Manda o pedido para o canal de bate-papo do Design
      const canalDesign = interaction.guild.channels.cache.find(c => c.name.includes("chat-design"));

      if (canalDesign) {
        await canalDesign.send({ content: "<@&1480453030410457158> Novo pedido recebido!", embeds: [embedPedido], components: [botoesGestao] });
        await interaction.reply({ content: "✅ O seu pedido foi enviado com sucesso para a equipe de Design!", ephemeral: true });
      } else {
        await interaction.reply({ content: "❌ Canal da equipe de Design não encontrado. Verifique se existe um canal com 'chat-design' no nome.", ephemeral: true });
      }
    }
  }
};