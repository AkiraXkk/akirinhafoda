const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

let createCanvas, loadImage, registerFont;
try {
  const canvas = require("canvas");
  createCanvas = canvas.createCanvas;
  loadImage = canvas.loadImage;
  registerFont = canvas.registerFont;
} catch (error) {
  console.log("⚠️ Canvas não disponível - comandos de imagem desativados");
}

const levelsStore = createDataStore("levels.json");
const userCardsStore = createDataStore("userCards.json");

const CARDS_CONFIG = {
  default: { name: "Padrão", price: 0, color: "#4a5568" },
  premium: { name: "Premium", price: 5000, color: "#f1c40f" },
  gold: { name: "Gold", price: 10000, color: "#f39c12" },
  neon: { name: "Neon", price: 15000, color: "#e74c3c" },
  ocean: { name: "Ocean", price: 20000, color: "#3498db" },
  legendary: { name: "Lendário", price: 50000, color: "#9b59b6" },
  cosmic: { name: "Cósmico", price: 75000, color: "#2c3e50" },
  dragon: { name: "Dragão", price: 100000, color: "#e67e22" }
};

function formatarTempoCall(voice_time) {
  if (!voice_time || voice_time === 0) return "0min";
  const totalMinutos = Math.floor(voice_time / 60000);
  const totalHoras = Math.floor(totalMinutos / 60);
  const minutosRestantes = totalMinutos % 60;
  if (totalHoras > 0) return `${totalHoras}h${minutosRestantes}min`;
  return `${totalMinutos}min`;
}

async function getUserCards(userId) {
  const cards = await userCardsStore.load();
  return cards[userId] || { selected: "default", owned: ["default"] };
}

async function saveUserCards(userId, cards) {
  await userCardsStore.update(userId, () => cards);
}

async function gerarImagemLeaderboard(interaction, page = 1) {
  if (!createCanvas) return null;
  const canvas = createCanvas(1000, 900);
  const ctx = canvas.getContext("2d");

  const levels = await levelsStore.load();
  const usuariosValidos = Object.entries(levels)
    .filter(([id, data]) => (data.totalXp || 0) >= 10)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0));

  const skip = (page - 1) * 5;
  const usuariosPagina = usuariosValidos.slice(skip, skip + 5);
  if (usuariosPagina.length === 0) return null;

  const gradient = ctx.createLinearGradient(0, 0, 0, 900);
  gradient.addColorStop(0, "#1a1a2e");
  gradient.addColorStop(1, "#16213e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1000, 900);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px Arial";
  ctx.textAlign = "center";
  ctx.fillText("🏆 LEADERBOARD XP", 500, 60);

  ctx.font = "20px Arial";
  ctx.fillStyle = "#95a5a6";
  ctx.fillText(`Página ${page} de ${Math.ceil(usuariosValidos.length / 5)}`, 500, 95);

  const usuariosComAvatares = await Promise.all(
    usuariosPagina.map(async (usuario, index) => {
      let user = interaction.client.users.cache.get(usuario.id);
      if (!user) {
        try { user = await interaction.client.users.fetch(usuario.id, { force: true }); } catch (e) {}
      }

      let avatar = null;
      if (user) {
        try { avatar = await loadImage(user.displayAvatarURL({ size: 128, extension: "png", forceStatic: true })); } catch (e) {}
      }

      return { ...usuario, index: skip + index + 1, avatar, displayName: user?.displayName || user?.username || `Usuário ${usuario.id}`, hasAvatar: !!avatar };
    })
  );

  let yPos = 140;
  usuariosComAvatares.forEach((usuario) => {
    const posicao = usuario.index;

    const itemGradient = ctx.createLinearGradient(50, yPos - 10, 950, yPos + 80);
    if (posicao <= 3) {
      itemGradient.addColorStop(0, "rgba(255, 215, 0, 0.1)");
      itemGradient.addColorStop(1, "rgba(255, 215, 0, 0.05)");
    } else if (posicao <= 10) {
      itemGradient.addColorStop(0, "rgba(192, 192, 192, 0.1)");
      itemGradient.addColorStop(1, "rgba(192, 192, 192, 0.05)");
    } else {
      itemGradient.addColorStop(0, "rgba(255, 255, 255, 0.05)");
      itemGradient.addColorStop(1, "rgba(255, 255, 255, 0.02)");
    }

    ctx.fillStyle = itemGradient;
    ctx.fillRect(50, yPos - 10, 900, 90);

    ctx.strokeStyle = posicao <= 3 ? "rgba(255, 215, 0, 0.3)" : "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.strokeRect(50, yPos - 10, 900, 90);

    if (posicao <= 3) {
      const medals = ["🥇", "🥈", "🥉"];
      ctx.font = "bold 36px Arial";
      ctx.textAlign = "center";
      ctx.fillText(medals[posicao - 1], 100, yPos + 35);
    } else {
      ctx.fillStyle = posicao <= 10 ? "#c0c0c0" : "#95a5a6";
      ctx.font = "bold 28px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`#${posicao}`, 100, yPos + 35);
    }

    if (usuario.avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(200, yPos + 35, 30, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(usuario.avatar, 170, yPos + 5, 60, 60);
      ctx.restore();
      ctx.strokeStyle = posicao <= 3 ? "#ffd700" : "#4a5568";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(200, yPos + 35, 30, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#4a5568";
      ctx.beginPath();
      ctx.arc(200, yPos + 35, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px Arial";
      ctx.textAlign = "center";
      ctx.fillText("👤", 200, yPos + 42);
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "left";
    const nomeTruncado = usuario.displayName.length > 20 ? usuario.displayName.substring(0, 17) + "..." : usuario.displayName;
    ctx.fillText(nomeTruncado, 260, yPos + 25);

    ctx.font = "16px Arial";
    ctx.fillStyle = "#b8bfc7";
    ctx.fillText(`Nível ${usuario.level || 1}`, 260, yPos + 50);

    ctx.fillStyle = "#7289da";
    ctx.font = "bold 18px Arial";
    ctx.fillText(`${usuario.totalXp || 0} XP`, 260, yPos + 70);

    ctx.font = "14px Arial";
    ctx.fillStyle = "#95a5a6";
    ctx.fillText(`💬 ${usuario.messages_count || 0} msgs`, 500, yPos + 35);
    ctx.fillText(`🎙️ ${formatarTempoCall(usuario.voice_time || 0)}`, 500, yPos + 55);

    const progress = Math.min((usuario.xp || 0) / 1000, 1);
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(500, yPos + 70, 200, 6);

    const barGradient = ctx.createLinearGradient(500, yPos + 70, 700, yPos + 70);
    barGradient.addColorStop(0, "#7289da");
    barGradient.addColorStop(1, "#99aab5");
    ctx.fillStyle = barGradient;
    ctx.fillRect(500, yPos + 70, Math.floor(200 * progress), 6);

    yPos += 110;
  });

  ctx.fillStyle = "#95a5a6";
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`Total: ${usuariosValidos.length} usuários qualificados • Mostrando ${usuariosPagina.length} desta página`, 500, 860);

  return canvas.toBuffer("image/png");
}

function createShopEmbed() {
  const fields = Object.entries(CARDS_CONFIG).map(([key, card]) => ({
    name: `${card.name} ${card.price === 0 ? "🆓" : `💰 ${card.price} moedas`}`,
    value: `ID: \`${key}\`\nCor: ${card.color}`,
    inline: true
  }));

  return createEmbed({
    title: "🛍️ Loja de Cards de Perfil",
    description: "Escolha um card para personalizar seu perfil no comando `/rank`!",
    color: 0x7289da,
    fields,
    footer: { text: "Use /leaderboard comprar <id> para comprar um card • WDA" }
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Mostra o ranking dos usuários com mais XP")
    .addSubcommand((sub) =>
      sub.setName("ver").setDescription("Mostra o ranking dos usuários").addIntegerOption((opt) => opt.setName("pagina").setDescription("Número da página").setMinValue(1).setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName("comprar").setDescription("Compre um card para personalizar seu perfil").addStringOption((opt) =>
          opt.setName("card").setDescription("Card que deseja comprar").setRequired(true).addChoices(...Object.entries(CARDS_CONFIG).map(([key, card]) => ({ name: `${card.name} ${card.price === 0 ? "(Grátis)" : `(${card.price} moedas)`}`, value: key })))
      )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand(false);

    if (sub === "comprar") {
      const cardId = interaction.options.getString("card");
      const userId = interaction.user.id;
      const { economy: eco } = interaction.client.services;

      if (!eco) return interaction.reply({ embeds: [createErrorEmbed("Serviço de economia indisponível!")], flags: MessageFlags.Ephemeral });

      const card = CARDS_CONFIG[cardId];
      const userCards = await getUserCards(userId);

      if (userCards.owned.includes(cardId)) {
        return interaction.reply({ embeds: [createErrorEmbed("Você já possui este card!")], flags: MessageFlags.Ephemeral });
      }

      if (card.price > 0) {
        const balance = await eco.getBalance(interaction.guildId, userId);
        if (balance.coins < card.price) {
          return interaction.reply({ embeds: [createErrorEmbed(`Você precisa de **${card.price} moedas**!\nSaldo: **${balance.coins} moedas**`)], flags: MessageFlags.Ephemeral });
        }
        await eco.removeCoins(interaction.guildId, userId, card.price);
      }

      userCards.owned.push(cardId);
      userCards.selected = cardId;
      await saveUserCards(userId, userCards);

      return interaction.reply({ 
        embeds: [createSuccessEmbed(`Você comprou o card **${card.name}**!\n${card.price > 0 ? `💸 Foram debitadas ${card.price} moedas.` : '🆓 Card gratuito!'}\nUse \`/rank view\` para ver!`)],
        flags: MessageFlags.Ephemeral 
      });
    } else {
      const page = interaction.options.getInteger("pagina") || 1;
      await interaction.deferReply();

      try {
        const imagemBuffer = await gerarImagemLeaderboard(interaction, page);
        if (!imagemBuffer) return interaction.editReply({ embeds: [createErrorEmbed("Nenhum usuário encontrado nesta página.")], flags: MessageFlags.Ephemeral });

        const levels = await levelsStore.load();
        const totalPages = Math.ceil(Object.entries(levels).filter(([id, data]) => (data.totalXp || 0) >= 10).length / 5) || 1;

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`leaderboard_prev_${page}`).setLabel("⬅️ Anterior").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
          new ButtonBuilder().setCustomId("leaderboard_shop").setLabel("🛍️ Cards").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`leaderboard_next_${page}`).setLabel("Próximo ➡️").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
        );

        const attachment = new AttachmentBuilder(imagemBuffer, { name: "leaderboard.png" });
        return interaction.editReply({ files: [attachment], components: [row] });
      } catch (error) {
        return interaction.editReply({ content: "Erro ao gerar leaderboard.", flags: MessageFlags.Ephemeral });
      }
    }
  },

  async handleButton(interaction) {
    const customId = interaction.customId;

    if (customId === "leaderboard_shop") {
      return interaction.reply({ embeds: [createShopEmbed()], flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith("leaderboard_prev_") || customId.startsWith("leaderboard_next_")) {
      const currentPage = parseInt(customId.split("_")[2]);
      const isNext = customId.startsWith("leaderboard_next_");
      const page = isNext ? currentPage + 1 : currentPage - 1;

      await interaction.update({ content: "Carregando página...", components: [], embeds: [], files: [] });

      try {
        const imagemBuffer = await gerarImagemLeaderboard(interaction, page);
        if (!imagemBuffer) return interaction.editReply({ embeds: [createErrorEmbed("Nenhum usuário encontrado.")], flags: MessageFlags.Ephemeral, content: "" });

        const levels = await levelsStore.load();
        const totalPages = Math.ceil(Object.entries(levels).filter(([id, data]) => (data.totalXp || 0) >= 10).length / 5) || 1;

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`leaderboard_prev_${page}`).setLabel("⬅️ Anterior").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
          new ButtonBuilder().setCustomId("leaderboard_shop").setLabel("🛍️ Cards").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`leaderboard_next_${page}`).setLabel("Próximo ➡️").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
        );

        const attachment = new AttachmentBuilder(imagemBuffer, { name: "leaderboard.png" });
        return interaction.editReply({ files: [attachment], components: [row], content: "" });
      } catch (error) {
        return interaction.editReply({ content: "Erro ao carregar página.", flags: MessageFlags.Ephemeral });
      }
    }
  }
};