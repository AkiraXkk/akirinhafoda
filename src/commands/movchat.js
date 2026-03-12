const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  MessageFlags, } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("movchat")
    .setDescription("Ferramentas da equipe MovChat")
    .addSubcommand(sub => 
      sub.setName("interagir")
      .setDescription("Envia um tópico interessante para movimentar o chat geral")
      .addStringOption(opt => 
        opt.setName("tema")
        .setDescription("Escolha o tipo de interação")
        .setRequired(true)
        .addChoices(
          { name: "🎮 Games (Qual seu jogo favorito...)", value: "games" },
          { name: "🔥 Polêmica (Comida, Rotina...)", value: "polemica" },
          { name: "🎵 Música (Banda favorita...)", value: "musica" }
        )
      )
    )
    .addSubcommand(sub => 
      sub.setName("advertir")
      .setDescription("Envia um aviso formal para um membro que quebrou as regras do chat")
      .addUserOption(opt => opt.setName("membro").setDescription("Quem será advertido").setRequired(true))
      .addStringOption(opt => opt.setName("motivo").setDescription("Motivo da advertência").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ==========================================
    // INTERAGIR (Reviver o chat)
    // ==========================================
    if (sub === "interagir") {
      const tema = interaction.options.getString("tema");
      let pergunta = "";

      if (tema === "games") pergunta = "Se vocês pudessem jogar apenas UM jogo pelo resto da vida, qual seria e por quê? 🎮";
      if (tema === "polemica") pergunta = "Polêmica do dia: É aceitável colocar Ketchup na pizza ou isso é um crime? 🍕🍅";
      if (tema === "musica") pergunta = "Qual é aquela música que você tem vergonha de admitir que sabe a letra inteira? 🎵🤫";

      const embedInteracao = new EmbedBuilder()
        .setTitle("🗣️ Papo da Staff!")
        .setColor("#00d2d3")
        .setDescription(`\n**${pergunta}**\n\nRespondam aí embaixo! 👇`)
        .setFooter({ text: `Tópico iniciado por ${interaction.user.username}` });

      await interaction.reply({ embeds: [embedInteracao] });
    }

    // ==========================================
    // ADVERTIR (Moderação Rápida)
    // ==========================================
    if (sub === "advertir") {
      const alvo = interaction.options.getUser("membro");
      const motivo = interaction.options.getString("motivo");

      const embedAviso = new EmbedBuilder()
        .setTitle("⚠️ Você recebeu uma advertência")
        .setColor("#ff0000")
        .setDescription(`Você foi advertido no servidor **${interaction.guild.name}** pela equipe de MovChat.`)
        .addFields({ name: "Motivo", value: motivo })
        .setFooter({ text: "Por favor, leia nossas regras para evitar futuras punições." });

      // Tenta enviar na DM do usuário
      let enviouDM = true;
      await alvo.send({ embeds: [embedAviso] }).catch(() => { enviouDM = false; });

      // Resposta pro Staff (Invisível para os outros)
      await interaction.reply({ 
        content: `✅ Advertência registrada para ${alvo.tag}.\n${enviouDM ? "📩 O membro foi notificado no privado." : "❌ A DM do membro está fechada, mas o registro foi feito."}`, 
        flags: MessageFlags.Ephemeral 
      });
    }
  }
};
