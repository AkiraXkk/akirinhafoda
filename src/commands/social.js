const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { createEmbed } = require("../embeds");

// Rastreia quais usuários já curtiram cada post: Map<messageId, Set<userId>>
const likedByUsers = new Map();
const MAX_TRACKED_POSTS = 500;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("social")
    .setDescription("Comandos de redes sociais e interações divertidas")
    .addSubcommand((sub) =>
      sub
        .setName("twitter")
        .setDescription("Publica um tweet falso")
        .addStringOption((opt) => opt.setName("mensagem").setDescription("O que queres tweetar?").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("instagram")
        .setDescription("Publica uma foto no Instagram (simulação)")
        .addStringOption((opt) => opt.setName("legenda").setDescription("Legenda da foto").setRequired(true))
        .addAttachmentOption((opt) => opt.setName("foto").setDescription("A foto a publicar").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("match")
        .setDescription("Simula um match do Tinder com alguém")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Com quem queres dar match?").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // TWITTER
    if (sub === "twitter") {
        const message = interaction.options.getString("mensagem");

        await interaction.reply({
            embeds: [createEmbed({
                author: { name: `${interaction.user.username} (@${interaction.user.username})`, iconURL: interaction.user.displayAvatarURL() },
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
  },

  // Handler GLOBAL para Botões
  async handleButton(interaction) {
    const customId = interaction.customId;

    if (customId === 'social_insta_like' || customId === 'insta_like') {
        const message = interaction.message;
        const embed = message.embeds[0];
        const messageId = message.id;
        const userId = interaction.user.id;

        // Inicializa o Set de likes para esta mensagem se não existir
        if (!likedByUsers.has(messageId)) {
            // Limpa entradas antigas se exceder o limite
            if (likedByUsers.size >= MAX_TRACKED_POSTS) {
                const oldestKey = likedByUsers.keys().next().value;
                likedByUsers.delete(oldestKey);
            }
            likedByUsers.set(messageId, new Set());
        }

        const likedUsers = likedByUsers.get(messageId);

        // Toggle: se já curtiu, descurte; se não, curte
        let currentLikes = 0;
        if (embed.footer && embed.footer.text) {
            const match = embed.footer.text.match(/❤️ (\d+) curtidas?/);
            if (match) {
                currentLikes = parseInt(match[1]);
            }
        }

        if (likedUsers.has(userId)) {
            likedUsers.delete(userId);
            currentLikes = Math.max(0, currentLikes - 1);
        } else {
            likedUsers.add(userId);
            currentLikes++;
        }

        const newEmbed = createEmbed({
            author: embed.author,
            description: embed.description,
            image: embed.image?.url,
            color: embed.color,
            footer: { text: `Instagram • ❤️ ${currentLikes} curtida${currentLikes !== 1 ? 's' : ''}`, iconURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Instagram_logo_2016.svg/2048px-Instagram_logo_2016.svg.png" }
        });

        await interaction.update({ embeds: [newEmbed] });
    }

    if (customId.startsWith('social_insta_comment_') || customId === 'insta_comment') {
        let postOwnerId = 'LEGACY';

        if (customId.startsWith('social_insta_comment_')) {
             postOwnerId = customId.split('_')[3]; 
        }

        const modal = new ModalBuilder()
            .setCustomId(`social_insta_modal_${postOwnerId}`)
            .setTitle('Comentar na foto');

        const commentInput = new TextInputBuilder()
            .setCustomId('comment_text')
            .setLabel("O teu comentário")
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
          const postOwnerId = customId.split('_')[3]; 
          const comment = interaction.fields.getTextInputValue('comment_text');

          if (postOwnerId === 'LEGACY') {
              await interaction.reply({ content: "Comentário registado! 📨 (Post antigo, autor não notificado)", ephemeral: true });
              return;
          }

          try {
              const postOwner = await interaction.client.users.fetch(postOwnerId);

              const dmEmbed = createEmbed({
                  title: "💬 Novo comentário no teu post!",
                  description: `**${interaction.user.username}** comentou:\n\n"${comment}"`,
                  color: 0xC13584,
                  footer: { text: `Enviado do servidor: ${interaction.guild.name}` }
              });

              await postOwner.send({ embeds: [dmEmbed] });
              await interaction.reply({ content: "Comentário enviado com sucesso! 📨", ephemeral: true });
          } catch (error) {
              console.error("Erro ao enviar DM de comentário:", error);
              await interaction.reply({ content: "Comentário registado, mas não consegui enviar DM ao autor (DM fechada ou utilizador não encontrado).", ephemeral: true });
          }
      }
  }
};