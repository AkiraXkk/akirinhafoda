const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pastime")
    .setDescription("Sistemas de entretenimento para a comunidade")
    .addSubcommand(sub => 
      sub.setName("correio")
      .setDescription("Envia um correio elegante / mensagem para alguém")
      .addUserOption(opt => opt.setName("para").setDescription("Para quem é a mensagem?").setRequired(true))
      .addStringOption(opt => opt.setName("mensagem").setDescription("Escreva o recado").setRequired(true))
      .addBooleanOption(opt => opt.setName("anonimo").setDescription("Deseja esconder o seu nome?").setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName("minigame")
      .setDescription("Lança um mini-game rápido no chat")
      .addStringOption(opt => 
        opt.setName("jogo")
        .setDescription("Escolha a brincadeira")
        .setRequired(true)
        .addChoices(
          { name: "💋 Kiss, Marry, Kill", value: "kmk" },
          { name: "🎵 Complete a Letra", value: "letra" },
          { name: "🤥 Duas Verdades e Uma Mentira", value: "mentira" }
        )
      )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ==========================================
    // CORREIO ELEGANTE
    // ==========================================
    if (sub === "correio") {
      const alvo = interaction.options.getUser("para");
      const mensagem = interaction.options.getString("mensagem");
      const anonimo = interaction.options.getBoolean("anonimo");

      const remetente = anonimo ? "🕵️ Alguém Anônimo" : interaction.user.username;

      const embedCorreio = new EmbedBuilder()
        .setTitle("💌 Você recebeu um Correio Elegante!")
        .setColor("#9b59b6")
        .setDescription(`**Para:** ${alvo}\n**De:** ${remetente}\n\n📝 **Mensagem:**\n*"${mensagem}"*`)
        .setFooter({ text: "WDA Pastime - Correio" });

      await interaction.reply({ content: `${alvo}`, embeds: [embedCorreio] });
    }

    // ==========================================
    // MINI-GAMES RÁPIDOS
    // ==========================================
    if (sub === "minigame") {
      const jogo = interaction.options.getString("jogo");
      let titulo = "";
      let descricao = "";

      if (jogo === "kmk") {
        titulo = "💋 Kiss, Marry, Kill";
        descricao = "A regra é clara: Vou soltar 3 nomes e vocês precisam dizer quem beijam, com quem casam e quem vocês matam!\n\n*(Staff: digite os 3 nomes abaixo)* 👇";
      } else if (jogo === "letra") {
        titulo = "🎵 Complete a Letra!";
        descricao = "Vou colocar o trecho de uma música, o primeiro que responder a continuação correta ganha!\n\n*(Staff: digite a música abaixo)* 👇";
      } else if (jogo === "mentira") {
        titulo = "🤥 Duas Verdades e Uma Mentira";
        descricao = "Escreva 3 fatos sobre você. 2 devem ser verdade e 1 mentira. O chat precisa adivinhar qual é a falsa!\n\n*(Staff: comece a brincadeira)* 👇";
      }

      const embedJogo = new EmbedBuilder()
        .setTitle(`🎮 Mini-Game: ${titulo}`)
        .setColor("#9b59b6")
        .setDescription(descricao)
        .setFooter({ text: `Iniciado por ${interaction.user.username} • WDA Pastime` });

      await interaction.reply({ embeds: [embedJogo] });
    }
  }
};
