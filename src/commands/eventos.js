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
    .setName("evento")
    .setDescription("Sistema da equipe de Eventos")
    .addSubcommand(sub => 
      sub.setName("painel")
      .setDescription("Cria o painel de criação rápida de eventos")
    )
    .addSubcommand(sub => 
      sub.setName("sortear")
      .setDescription("Sorteia um membro aleatório que está na call com você")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ==========================================
    // PAINEL DE EVENTOS
    // ==========================================
    if (sub === "painel") {
      const embedPainel = new EmbedBuilder()
        .setTitle("🎉 Painel de Gestão de Eventos")
        .setColor("#2ecc71")
        .setDescription("Utilize os botões abaixo para criar anúncios oficiais de eventos no servidor de forma padronizada.");

      const btnCriar = new ButtonBuilder()
        .setCustomId("modal_criar_evento")
        .setLabel("📝 Anunciar Evento")
        .setStyle(ButtonStyle.Success)
        .setEmoji("📢");

      const row = new ActionRowBuilder().addComponents(btnCriar);
      await interaction.reply({ embeds: [embedPainel], components: [row] });
    }

    // ==========================================
    // SORTEIO NA CALL
    // ==========================================
    if (sub === "sortear") {
      const canalDeVoz = interaction.member.voice.channel;
      
      if (!canalDeVoz) {
        return interaction.reply({ content: "❌ Você precisa estar em um canal de voz para sortear alguém!", ephemeral: true });
      }

      // Pega todos os membros na call, exceto bots
      const membrosNaCall = canalDeVoz.members.filter(m => !m.user.bot);
      if (membrosNaCall.size === 0) {
        return interaction.reply({ content: "❌ Não há ninguém (além de bots) na sua call para sortear.", ephemeral: true });
      }

      // Sorteia um aleatório
      const ganhador = membrosNaCall.random();
      
      const embedSorteio = new EmbedBuilder()
        .setTitle("🎁 Sorteio do Evento!")
        .setColor("#2ecc71")
        .setDescription(`A roleta girou entre os **${membrosNaCall.size}** participantes da call **${canalDeVoz.name}**...\n\n🎉 E o grande vencedor foi: ${ganhador}!`)
        .setTimestamp();

      await interaction.reply({ embeds: [embedSorteio] });
    }
  },

  // Escuta o botão do painel
  async handleButton(interaction) {
    if (interaction.customId === "modal_criar_evento") {
      const modal = new ModalBuilder()
        .setCustomId("submit_evento")
        .setTitle("Anúncio de Evento");

      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ev_titulo").setLabel("Nome do Evento").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ev_desc").setLabel("Descrição e Regras").setStyle(TextInputStyle.Paragraph).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ev_data").setLabel("Data e Horário").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ev_premio").setLabel("Premiação (Opcional)").setStyle(TextInputStyle.Short).setRequired(false))
      );

      await interaction.showModal(modal);
    }
  },

  // Posta o evento após preencher o formulário
  async handleModal(interaction) {
    if (interaction.customId === "submit_evento") {
      const titulo = interaction.fields.getTextInputValue("ev_titulo");
      const desc = interaction.fields.getTextInputValue("ev_desc");
      const data = interaction.fields.getTextInputValue("ev_data");
      const premio = interaction.fields.getTextInputValue("ev_premio");

      const embedEvento = new EmbedBuilder()
        .setTitle(`🎉 EVENTO: ${titulo}`)
        .setColor("#2ecc71")
        .setDescription(`\n${desc}\n\n📅 **Quando:** ${data}${premio ? `\n🏆 **Prêmio:** ${premio}` : ""}`)
        .setImage("https://i.imgur.com/YOUR_BANNER_HERE.png") // Banner opcional
        .setFooter({ text: `Evento organizado por ${interaction.user.username}` });

      // Aqui você coloca o ID do canal de anúncios de eventos do seu servidor
      const canalAnuncio = interaction.guild.channels.cache.find(c => c.name.includes("avisos"));
      
      if (canalAnuncio) {
        // Envia marcando Everyone ou o Cargo Ping de Eventos
        await canalAnuncio.send({ content: "@everyone Um novo evento vai começar!", embeds: [embedEvento] });
        await interaction.reply({ content: "✅ Evento anunciado com sucesso!", ephemeral: true });
      } else {
        await interaction.reply({ content: "❌ Canal de anúncios não encontrado.", ephemeral: true });
      }
    }
  }
};
