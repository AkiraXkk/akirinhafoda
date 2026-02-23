const { SlashCommandBuilder } = require("discord.js");
const { createEmbed } = require("../embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("fun")
    .setDescription("Comandos de diversão")
    .addSubcommand((sub) =>
      sub
        .setName("8ball")
        .setDescription("Faça uma pergunta para a bola mágica")
        .addStringOption((opt) => opt.setName("pergunta").setDescription("Sua pergunta").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("avatar")
        .setDescription("Mostra o avatar de um usuário")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário (opcional)").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("say")
        .setDescription("Faz o bot falar algo")
        .addStringOption((opt) => opt.setName("texto").setDescription("O que o bot deve dizer").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("coinflip")
        .setDescription("Joga uma moeda (Cara ou Coroa)")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // 8BALL
    if (sub === "8ball") {
      const question = interaction.options.getString("pergunta");
      const answers = [
        "Sim!", "Infelizmente não", "Você está absolutamente certo!", "Não, desculpe.",
        "Eu concordo", "Sem ideia!", "Eu não sou tão inteligente...", "Minhas fontes dizem não!",
        "É certo", "Você pode confiar nisso", "Provavelmente não", "Tudo aponta para um não",
        "Sem dúvida", "Absolutamente", "Eu não sei"
      ];
      
      const result = answers[Math.floor(Math.random() * answers.length)];

      await interaction.reply({ 
          embeds: [createEmbed({
              title: "🎱 Bola 8 Mágica",
              fields: [
                  { name: "💬 Sua Pergunta", value: `\`\`\`${question}\`\`\`` },
                  { name: "🤖 Resposta do Bot", value: `\`\`\`${result}\`\`\`` }
              ],
              color: 0x000000 // Black
          })] 
      });
    }

    // AVATAR
    if (sub === "avatar") {
      const user = interaction.options.getUser("usuario") || interaction.user;
      
      await interaction.reply({ 
          embeds: [createEmbed({
              title: `🖼 Avatar de ${user.username}`,
              image: user.displayAvatarURL({ dynamic: true, size: 1024 }),
              color: 0x3498db // Blue
          })] 
      });
    }

    // SAY
    if (sub === "say") {
      const text = interaction.options.getString("texto");
      
      if (text.length > 2000) {
          return interaction.reply({ content: "O texto é muito longo (máx 2000 caracteres).", ephemeral: true });
      }

      // Remove mentions if needed or allow them? Usually safer to remove unless admin.
      // For simplicity, we send as is but ephemeral response to confirm.
      
      await interaction.channel.send({ content: text });
      await interaction.reply({ content: "Mensagem enviada com sucesso!", ephemeral: true });
    }

    // COINFLIP
    if (sub === "coinflip") {
        const result = Math.random() < 0.5 ? "Cara" : "Coroa";
        
        await interaction.reply({ 
            embeds: [createEmbed({
                title: "🪙 Cara ou Coroa",
                description: `A moeda caiu em: **${result}**!`,
                color: 0xF1C40F // Yellow/Gold
            })] 
        });
    }
  },
};
