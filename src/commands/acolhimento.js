const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("acolhimento")
    .setDescription("Ferramentas da equipe de Acolhimento e Suporte")
    .addSubcommand(sub => 
      sub.setName("assumir")
      .setDescription("Assume o atendimento do ticket atual")
    )
    .addSubcommand(sub => 
      sub.setName("guia")
      .setDescription("Envia um guia explicativo rápido para um membro")
      .addUserOption(opt => opt.setName("membro").setDescription("Membro que vai receber o guia").setRequired(true))
      .addStringOption(opt => 
        opt.setName("assunto")
        .setDescription("Qual guia você quer enviar?")
        .setRequired(true)
        .addChoices(
          { name: "📋 Como funcionam os Cargos", value: "cargos" },
          { name: "🛡️ Como entrar para a Staff", value: "staff" },
          { name: "🛒 Como ganhar WDA Coins", value: "coins" }
        )
      )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ==========================================
    // ASSUMIR TICKET
    // ==========================================
    if (sub === "assumir") {
      const canal = interaction.channel;
      
      // Muda o nome do canal (se o bot tiver permissão e não exceder o rate limit)
      await canal.setName(`ticket-${interaction.user.username}`).catch(()=>{});

      const embedAssumir = new EmbedBuilder()
        .setTitle("🫂 Atendimento Iniciado")
        .setColor("#f1c40f")
        .setDescription(`Olá! Meu nome é **${interaction.user.username}** e eu serei o responsável pelo seu atendimento a partir de agora.\n\nComo posso ajudar você hoje?`)
        .setFooter({ text: "WDA Suporte" });

      await interaction.reply({ embeds: [embedAssumir] });
    }

    // ==========================================
    // ENVIAR GUIA RÁPIDO
    // ==========================================
    if (sub === "guia") {
      const alvo = interaction.options.getUser("membro");
      const assunto = interaction.options.getString("assunto");

      let titulo = "";
      let texto = "";

      if (assunto === "cargos") {
        titulo = "📋 Guia de Cargos WDA";
        texto = "No nosso servidor, os cargos definem o seu nível de acesso e destaque!\nVocê pode ganhar novos cargos participando de eventos, comprando com **WDA Coins** na nossa lojinha, ou sendo um membro ativo nos chats.";
      } else if (assunto === "staff") {
        titulo = "🛡️ Como entrar para a Staff";
        texto = "Tem interesse em fazer parte da nossa equipe? Fique de olho no canal de **Recrutamento**! Quando as vagas abrirem, você poderá escolher uma área (Eventos, MovChat, Design, etc.) e fazer a sua entrevista.";
      } else if (assunto === "coins") {
        titulo = "🛒 O que são WDA Coins?";
        texto = "WDA Coins é a nossa moeda virtual! Você ganha moedas conversando no chat, ganhando eventos ou ajudando o servidor. Com elas, você pode comprar cargos exclusivos e mimos na aba de compras!";
      }

      const embedGuia = new EmbedBuilder()
        .setTitle(titulo)
        .setColor("#f1c40f")
        .setDescription(`Olá ${alvo}, o staff ${interaction.user} enviou este guia para você!\n\n${texto}`)
        .setFooter({ text: "WDA Acolhimento" });

      await interaction.reply({ content: `${alvo}`, embeds: [embedGuia] });
    }
  }
};