const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } = require("discord.js");
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

        const instaEmbed = createEmbed({
            author: { name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() },
            description: caption,
            image: photo.url,
            color: 0xC13584,
            footer: { text: "Instagram • ❤️ 0 curtidas", iconURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Instagram_logo_2016.svg/2048px-Instagram_logo_2016.svg.png" }
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('social_insta_like')
                .setEmoji('❤️')
                .setLabel('Curtir')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`social_insta_comment_${interaction.user.id}`)
                .setEmoji('💬')
                .setLabel('Comentar')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({
            embeds: [instaEmbed],
            components: [row]
        });
        // Sem collector aqui - handled globalmente
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

  // Handler GLOBAL para Botões
  async handleButton(interaction) {
    const customId = interaction.customId;

    // Suporte para IDs novos ('social_insta_like') e antigos ('insta_like')
    if (customId === 'social_insta_like' || customId === 'insta_like') {
        const message = interaction.message;
        const embed = message.embeds[0];
        
        // Parse current likes from footer
        // Footer text: "Instagram • ❤️ 0 curtidas"
        let currentLikes = 0;
        if (embed.footer && embed.footer.text) {
            const match = embed.footer.text.match(/❤️ (\d+) curtidas/);
            if (match) {
                currentLikes = parseInt(match[1]);
            }
        }

        // Increment (stateless - just adds 1)
        currentLikes++;

        const newEmbed = createEmbed({
            author: embed.author,
            description: embed.description,
            image: embed.image?.url,
            color: embed.color,
            footer: { text: `Instagram • ❤️ ${currentLikes} curtidas`, iconURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Instagram_logo_2016.svg/2048px-Instagram_logo_2016.svg.png" }
        });

        await interaction.update({ embeds: [newEmbed] });
    }

    // Suporte para IDs novos e antigos de comentário
    if (customId.startsWith('social_insta_comment_') || customId === 'insta_comment') {
        let postOwnerId = 'LEGACY';
        
        if (customId.startsWith('social_insta_comment_')) {
             postOwnerId = customId.split('_')[3]; // social_insta_comment_ID
        }

        const modal = new ModalBuilder()
            .setCustomId(`social_insta_modal_${postOwnerId}`)
            .setTitle('Comentar na foto');

        const commentInput = new TextInputBuilder()
            .setCustomId('comment_text')
            .setLabel("Seu comentário")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(200)
            .setRequired(true);

        const modalRow = new ActionRowBuilder().addComponents(commentInput);
        modal.addComponents(modalRow);

        await interaction.showModal(modal);
    }
  },

  // Handler GLOBAL para Modais
  async handleModal(interaction) {
      const customId = interaction.customId;

      if (customId.startsWith('social_insta_modal_')) {
          const postOwnerId = customId.split('_')[3]; // social_insta_modal_ID
          const comment = interaction.fields.getTextInputValue('comment_text');

          // Se for post antigo (LEGACY), não temos o ID do dono para mandar DM
          if (postOwnerId === 'LEGACY') {
              await interaction.reply({ content: "Comentário registrado! 📨 (Post antigo, autor não notificado)", ephemeral: true });
              return;
          }

          try {
              // Tenta buscar o dono do post
              const postOwner = await interaction.client.users.fetch(postOwnerId);
              
              const dmEmbed = createEmbed({
                  title: "💬 Novo comentário no seu post!",
                  description: `**${interaction.user.username}** comentou:\n\n"${comment}"`,
                  color: 0xC13584,
                  footer: { text: `Enviado do servidor: ${interaction.guild.name}` }
              });

              await postOwner.send({ embeds: [dmEmbed] });
              await interaction.reply({ content: "Comentário enviado com sucesso! 📨", ephemeral: true });
          } catch (error) {
              console.error("Erro ao enviar DM de comentário:", error);
              await interaction.reply({ content: "Comentário registrado, mas não consegui enviar DM para o autor (DM fechada ou usuário não encontrado).", ephemeral: true });
          }
      }
  }
};
