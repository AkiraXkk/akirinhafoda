const { SlashCommandBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("social")
    .setDescription("Comandos de redes sociais e interação")
    .addSubcommand((sub) =>
      sub
        .setName("twitter")
        .setDescription("Posta um tweet falso")
        .addStringOption((opt) => opt.setName("mensagem").setDescription("O que você quer tweetar").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("instagram")
        .setDescription("Posta uma foto no Instagram (simulação)")
        .addStringOption((opt) => opt.setName("legenda").setDescription("Legenda da foto").setRequired(true))
        .addAttachmentOption((opt) => opt.setName("foto").setDescription("A foto para postar").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("match")
        .setDescription("Simula um match do Tinder com alguém")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Com quem você quer dar match?").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("sugestao")
        .setDescription("Envia uma sugestão para o servidor")
        .addStringOption((opt) => opt.setName("conteudo").setDescription("Sua sugestão").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // TWITTER
    if (sub === "twitter") {
        const message = interaction.options.getString("mensagem");
        
        await interaction.reply({
            embeds: [createEmbed({
                author: { name: `${interaction.user.username} (@${interaction.user.tag})`, iconURL: interaction.user.displayAvatarURL() },
                description: message,
                color: 0x1DA1F2, // Twitter Blue
                footer: { text: "Twitter for Discord", iconURL: "https://abs.twimg.com/icons/apple-touch-icon-192x192.png" },
                timestamp: true
            })]
        });
    }

    // INSTAGRAM
    if (sub === "instagram") {
        const caption = interaction.options.getString("legenda");
        const photo = interaction.options.getAttachment("foto");

        await interaction.reply({
            embeds: [createEmbed({
                author: { name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() },
                title: "Instagram",
                description: caption,
                image: photo.url,
                color: 0xC13584, // Instagram Gradient-ish (Magenta)
                footer: { text: "Instagram", iconURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Instagram_logo_2016.svg/2048px-Instagram_logo_2016.svg.png" }
            })]
        });
    }

    // MATCH (Tinder)
    if (sub === "match") {
        const target = interaction.options.getUser("usuario");
        const percentage = Math.floor(Math.random() * 101);
        
        let description = "";
        if (percentage < 30) description = "🥶 Sem chance...";
        else if (percentage < 70) description = "😐 Talvez dê certo.";
        else description = "🔥 É o destino!";

        // Barra de progresso
        const filled = Math.floor(percentage / 10);
        const empty = 10 - filled;
        const bar = "❤️".repeat(filled) + "🖤".repeat(empty);

        await interaction.reply({
            embeds: [createEmbed({
                title: "🔥 Tinder Match",
                description: `Match entre ${interaction.user} e ${target}\n\n**${percentage}%**\n${bar}\n\n${description}`,
                color: 0xFE3C72 // Tinder Red
            })]
        });
    }

    // SUGESTAO
    if (sub === "sugestao") {
        const content = interaction.options.getString("conteudo");
        // TODO: Ler canal de sugestão do guildConfig (implementar depois)
        // Por enquanto manda no chat atual e avisa
        
        const embed = createEmbed({
            author: { name: `Sugestão de ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() },
            description: content,
            color: 0xF1C40F, // Gold
            footer: "Vote abaixo!"
        });

        const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
        await msg.react("👍");
        await msg.react("👎");
    }
  },
};
