const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createCanvas, loadImage, registerFont } = require("canvas");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

const levelsStore = createDataStore("levels.json");
const userCardsStore = createDataStore("userCards.json");

// Configurações de cards para compra
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

// Função para formatar tempo em call
function formatarTempoCall(voice_time) {
  if (!voice_time || voice_time === 0) return "0min";
  
  const totalMinutos = Math.floor(voice_time / 60000);
  const totalHoras = Math.floor(totalMinutos / 60);
  const minutosRestantes = totalMinutos % 60;
  
  if (totalHoras > 0) {
    return `${totalHoras}h${minutosRestantes}min`;
  } else {
    return `${totalMinutos}min`;
  }
}

// Função para obter cards do usuário
async function getUserCards(userId) {
  const cards = await userCardsStore.load();
  return cards[userId] || { selected: "default", owned: ["default"] };
}

// Função para salvar cards do usuário
async function saveUserCards(userId, cards) {
  await userCardsStore.update(userId, cards);
}

// Função principal para gerar imagem do leaderboard
async function gerarImagemLeaderboard(interaction, page = 1) {
  console.log(`🔍 Iniciando geração do leaderboard - Página: ${page}`);
  
  const canvas = createCanvas(1000, 900);
  const ctx = canvas.getContext("2d");
  
  // Carregar dados do banco
  const levels = await levelsStore.load();
  console.log(`📊 Total de usuários no banco: ${Object.keys(levels).length}`);
  
  // Filtrar usuários com XP >= 10 e ordenar
  const usuariosValidos = Object.entries(levels)
    .filter(([id, data]) => (data.totalXp || 0) >= 10)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0));
  
  console.log(`✅ Usuários qualificados: ${usuariosValidos.length}`);
  
  // Calcular skip e limit
  const skip = (page - 1) * 5;
  const usuariosPagina = usuariosValidos.slice(skip, skip + 5);
  
  console.log(`📄 Usuários nesta página: ${usuariosPagina.length}`);
  
  // Verificar se há usuários na página
  if (usuariosPagina.length === 0) {
    console.log(`❌ Nenhum usuário na página ${page}`);
    return null;
  }
  
  // Fundo principal com gradiente
  const gradient = ctx.createLinearGradient(0, 0, 0, 900);
  gradient.addColorStop(0, "#1a1a2e");
  gradient.addColorStop(1, "#16213e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1000, 900);
  
  // Cabeçalho
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px Arial";
  ctx.textAlign = "center";
  ctx.fillText("🏆 LEADERBOARD XP", 500, 60);
  
  ctx.font = "20px Arial";
  ctx.fillStyle = "#95a5a6";
  ctx.fillText(`Página ${page} de ${Math.ceil(usuariosValidos.length / 5)}`, 500, 95);
  
  // Carregar avatares dos usuários
  console.log(`🔍 Iniciando carregamento de avatares para ${usuariosPagina.length} usuários`);
  
  const usuariosComAvatares = await Promise.all(
    usuariosPagina.map(async (usuario, index) => {
      console.log(`👤 Processando usuário ${usuario.id} (índice ${index})`);
      
      try {
        // Tentar obter usuário do cache
        let user = interaction.client.users.cache.get(usuario.id);
        console.log(`📦 Usuário ${usuario.id} no cache: ${!!user}`);
        
        // Se não estiver no cache, tentar buscar
        if (!user) {
          try {
            console.log(`🔎 Buscando usuário ${usuario.id} na API...`);
            user = await interaction.client.users.fetch(usuario.id, { force: true });
            console.log(`✅ Usuário ${usuario.id} encontrado: ${user.username}`);
          } catch (error) {
            console.log(`❌ Não foi possível obter usuário ${usuario.id}:`, error.message);
          }
        }
        
        // Carregar avatar com múltiplas tentativas
        let avatar = null;
        let avatarUrl = null;
        
        if (user) {
          const avatarUrls = [
            user.displayAvatarURL({ size: 128, extension: "png", forceStatic: true }),
            user.displayAvatarURL({ size: 128 }),
            user.avatarURL({ size: 128, extension: "png", forceStatic: true }),
            user.avatarURL({ size: 128 }),
            `https://cdn.discordapp.com/avatars/${usuario.id}/${user.avatar}.png?size=128`,
            `https://cdn.discordapp.com/embed/avatars/${usuario.id}.png?size=128`
          ];
          
          for (let i = 0; i < avatarUrls.length; i++) {
            const url = avatarUrls[i];
            if (url) {
              try {
                console.log(`🖼️ Tentativa ${i + 1} para usuário ${usuario.id}: ${url}`);
                avatar = await loadImage(url);
                avatarUrl = url;
                console.log(`✅ Avatar carregado para usuário ${usuario.id} (tentativa ${i + 1})`);
                break; // Para no primeiro sucesso
              } catch (error) {
                console.log(`❌ Tentativa ${i + 1} falhou para ${usuario.id} (${url}):`, error.message);
                continue; // Tenta próxima URL
              }
            }
          }
        }
        
        const result = {
          ...usuario,
          index: skip + index + 1,
          avatar,
          avatarUrl,
          username: user?.username || `Usuário${usuario.id}`,
          displayName: user?.displayName || user?.username || `Usuário${usuario.id}`,
          hasAvatar: !!avatar
        };
        
        console.log(`📋 Resultado para usuário ${usuario.id}:`, {
          hasAvatar: result.hasAvatar,
          username: result.username,
          displayName: result.displayName,
          avatarUrl: result.avatarUrl
        });
        
        return result;
      } catch (error) {
        console.log(`💥 Erro ao processar usuário ${usuario.id}:`, error.message);
        return {
          ...usuario,
          index: skip + index + 1,
          avatar: null,
          avatarUrl: null,
          username: `Usuário${usuario.id}`,
          displayName: `Usuário${usuario.id}`,
          hasAvatar: false
        };
      }
    })
  );
  
  console.log(`🎯 Carregamento concluído. Avatares carregados: ${usuariosComAvatares.filter(u => u.hasAvatar).length}/${usuariosComAvatares.length}`);
  
  // Desenhar cada usuário
  let yPos = 140;
  usuariosComAvatares.forEach((usuario) => {
    const posicao = usuario.index;
    
    // Fundo do item com gradiente sutil
    const itemGradient = ctx.createLinearGradient(50, yPos - 10, 950, yPos + 80);
    if (posicao <= 3) {
      // Top 3 - gradiente dourado
      itemGradient.addColorStop(0, "rgba(255, 215, 0, 0.1)");
      itemGradient.addColorStop(1, "rgba(255, 215, 0, 0.05)");
    } else if (posicao <= 10) {
      // Top 10 - gradiente prateado
      itemGradient.addColorStop(0, "rgba(192, 192, 192, 0.1)");
      itemGradient.addColorStop(1, "rgba(192, 192, 192, 0.05)");
    } else {
      // Demais - gradiente padrão
      itemGradient.addColorStop(0, "rgba(255, 255, 255, 0.05)");
      itemGradient.addColorStop(1, "rgba(255, 255, 255, 0.02)");
    }
    
    ctx.fillStyle = itemGradient;
    ctx.fillRect(50, yPos - 10, 900, 90);
    
    // Borda sutil
    ctx.strokeStyle = posicao <= 3 ? "rgba(255, 215, 0, 0.3)" : "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.strokeRect(50, yPos - 10, 900, 90);
    
    // Posição com medalha para top 3
    if (posicao <= 3) {
      const medals = ["🥇", "🥈", "🥉"];
      ctx.font = "bold 36px Arial";
      ctx.textAlign = "center";
      ctx.fillText(medals[posicao - 1], 100, yPos + 35);
    } else {
      // Posição normal
      ctx.fillStyle = posicao <= 10 ? "#c0c0c0" : "#95a5a6";
      ctx.font = "bold 28px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`#${posicao}`, 100, yPos + 35);
    }
    
    // Avatar circular com tratamento robusto
    if (usuario.avatar && usuario.hasAvatar) {
      try {
        ctx.save();
        
        // Criar caminho circular
        ctx.beginPath();
        ctx.arc(200, yPos + 35, 30, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        
        // Desenhar avatar
        ctx.drawImage(usuario.avatar, 170, yPos + 5, 60, 60);
        
        ctx.restore();
        
        // Borda do avatar
        ctx.strokeStyle = posicao <= 3 ? "#ffd700" : "#4a5568";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(200, yPos + 35, 30, 0, Math.PI * 2);
        ctx.stroke();
        
        console.log(`Avatar desenhado com sucesso para usuário ${usuario.id}`);
      } catch (error) {
        console.log(`Erro ao desenhar avatar do usuário ${usuario.id}:`, error.message);
        // Fallback para placeholder se falhar o desenho
        drawAvatarPlaceholder(ctx, yPos, posicao);
      }
    } else {
      // Placeholder para avatar
      drawAvatarPlaceholder(ctx, yPos, posicao);
      console.log(`Usando placeholder para usuário ${usuario.id} (sem avatar)`);
    }
    
    // Função auxiliar para desenhar placeholder
    function drawAvatarPlaceholder(context, y, pos) {
      // Fundo do placeholder
      context.fillStyle = "#4a5568";
      context.beginPath();
      context.arc(200, y + 35, 30, 0, Math.PI * 2);
      context.fill();
      
      // Borda do placeholder
      context.strokeStyle = pos <= 3 ? "#ffd700" : "#4a5568";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(200, y + 35, 30, 0, Math.PI * 2);
      context.stroke();
      
      // Ícone de usuário
      context.fillStyle = "#ffffff";
      context.font = "bold 16px Arial";
      context.textAlign = "center";
      context.fillText("👤", 200, y + 42);
    }
    
    // Nome do usuário
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "left";
    const nomeTruncado = usuario.displayName.length > 20 ? 
      usuario.displayName.substring(0, 17) + "..." : 
      usuario.displayName;
    ctx.fillText(nomeTruncado, 260, yPos + 25);
    
    // Stats
    ctx.font = "16px Arial";
    ctx.fillStyle = "#b8bfc7";
    ctx.fillText(`Nível ${usuario.level || 1}`, 260, yPos + 50);
    
    ctx.fillStyle = "#7289da";
    ctx.font = "bold 18px Arial";
    ctx.fillText(`${usuario.totalXp || 0} XP`, 260, yPos + 70);
    
    // Mensagens e tempo em call
    ctx.font = "14px Arial";
    ctx.fillStyle = "#95a5a6";
    ctx.fillText(`💬 ${usuario.messages_count || 0} msgs`, 500, yPos + 35);
    ctx.fillText(`🎙️ ${formatarTempoCall(usuario.voice_time || 0)}`, 500, yPos + 55);
    
    // Barra de progresso de XP
    const progress = Math.min((usuario.xp || 0) / 1000, 1);
    const barWidth = 200;
    const barHeight = 6;
    const barX = 500;
    const barY = yPos + 70;
    
    // Fundo da barra
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
    // Preenchimento da barra
    const barGradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
    barGradient.addColorStop(0, "#7289da");
    barGradient.addColorStop(1, "#99aab5");
    ctx.fillStyle = barGradient;
    ctx.fillRect(barX, barY, Math.floor(barWidth * progress), barHeight);
    
    yPos += 110;
  });
  
  // Rodapé
  ctx.fillStyle = "#95a5a6";
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`Total: ${usuariosValidos.length} usuários qualificados • Mostrando ${Math.min(5, usuariosValidos.length - skip)} desta página`, 500, 860);
  
  return canvas.toBuffer("image/png");
}

// Função para criar embed de compra de cards
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
    footer: { text: "Use /leaderboard comprar <id> para comprar um card • WDA - Todos os direitos reservados" }
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Mostra o ranking dos usuários com mais XP")
    .addIntegerOption((opt) => opt.setName("pagina").setDescription("Número da página").setMinValue(1).setRequired(false))
    .addSubcommand((sub) =>
      sub
        .setName("comprar")
        .setDescription("Compre um card para personalizar seu perfil")
        .addStringOption((opt) =>
          opt
            .setName("card")
            .setDescription("Card que deseja comprar")
            .setRequired(true)
            .addChoices(
              ...Object.entries(CARDS_CONFIG).map(([key, card]) => ({
                name: `${card.name} ${card.price === 0 ? "(Grátis)" : `(${card.price} moedas)`}`,
                value: key
              }))
            )
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand(false); // false para não lançar erro se não tiver subcomando
    
    if (sub === "comprar") {
      const cardId = interaction.options.getString("card");
      const userId = interaction.user.id;
      const { economy: eco } = interaction.client.services;
      
      if (!eco) {
        return interaction.reply({ 
          embeds: [createErrorEmbed("Serviço de economia não disponível!")],
          ephemeral: true 
        });
      }
      
      const card = CARDS_CONFIG[cardId];
      const userCards = await getUserCards(userId);
      
      // Verificar se já possui o card
      if (userCards.owned.includes(cardId)) {
        return interaction.reply({ 
          embeds: [createErrorEmbed("Você já possui este card!")],
          ephemeral: true 
        });
      }
      
      // Verificar se tem moedas suficientes
      if (card.price > 0) {
        const balance = await eco.getBalance(interaction.guildId, userId);
        if (balance.coins < card.price) {
          return interaction.reply({ 
            embeds: [createErrorEmbed(`Você precisa de **${card.price} moedas** para comprar este card!\nSaldo atual: **${balance.coins} moedas**`)],
            ephemeral: true 
          });
        }
        
        // Remover moedas
        await eco.removeCoins(interaction.guildId, userId, card.price);
      }
      
      // Adicionar card aos cards do usuário
      userCards.owned.push(cardId);
      userCards.selected = cardId;
      await saveUserCards(userId, userCards);
      
      return interaction.reply({ 
        embeds: [createSuccessEmbed(
          `Você comprou o card **${card.name}** com sucesso!\n` +
          `${card.price > 0 ? `💸 Foram debitadas ${card.price} moedas.` : '🆓 Card gratuito adquirido!'}\n\n` +
          `Use \`/rank view\` para ver seu novo card!`
        )],
        ephemeral: true 
      });
    } else {
      // Comando principal do leaderboard
      const page = interaction.options.getInteger("pagina") || 1;
      
      await interaction.deferReply();
      
      try {
        const imagemBuffer = await gerarImagemLeaderboard(interaction, page);
      
      if (!imagemBuffer) {
          return interaction.editReply({
            embeds: [createErrorEmbed("Nenhum usuário encontrado nesta página.")],
            ephemeral: true
          });
        }
        
        // Criar botões de navegação
        const totalPages = Math.ceil(
        Object.entries(await levelsStore.load())
          .filter(([id, data]) => (data.totalXp || 0) >= 10)
          .length / 5
      );
      
      const row = new ActionRowBuilder();
        
        // Botão anterior
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`leaderboard_prev_${page}`)
            .setLabel("⬅️ Anterior")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1)
        );
        
        // Botão de shop
        row.addComponents(
          new ButtonBuilder()
            .setCustomId("leaderboard_shop")
            .setLabel("🛍️ Cards")
            .setStyle(ButtonStyle.Primary)
        );
        
        // Botão próximo
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`leaderboard_next_${page}`)
            .setLabel("Próximo ➡️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages)
        );
        
        const attachment = new AttachmentBuilder(imagemBuffer, "leaderboard.png");
        
        return interaction.editReply({
          files: [attachment],
          components: [row]
        });
        
      } catch (error) {
        console.error("Erro ao gerar leaderboard:", error);
        return interaction.editReply({
          content: "Ocorreu um erro ao gerar o leaderboard. Tente novamente.",
          ephemeral: true
        });
      }
    }
  },

  // Handler para interações de botões
  async handleButton(interaction) {
    const customId = interaction.customId;
    
    if (customId === "leaderboard_shop") {
      return interaction.reply({ 
        embeds: [createShopEmbed()],
        ephemeral: true 
      });
    }
    
    if (customId.startsWith("leaderboard_prev_")) {
      const page = parseInt(customId.split("_")[2]) - 1;
      if (page < 1) return;
      
      await interaction.update({ content: "Carregando página anterior...", components: [] });
      
      try {
        const imagemBuffer = await gerarImagemLeaderboard(interaction, page);
        
        if (!imagemBuffer) {
          return interaction.editReply({
            embeds: [createErrorEmbed("Nenhum usuário encontrado nesta página.")],
            ephemeral: true
          });
        }
        
        // Criar botões de navegação
        const totalPages = Math.ceil(
          Object.entries(await levelsStore.load())
            .filter(([id, data]) => (data.totalXp || 0) >= 10)
            .length / 5
        );
        
        const row = new ActionRowBuilder();
        
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`leaderboard_prev_${page}`)
            .setLabel("⬅️ Anterior")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1)
        );
        
        row.addComponents(
          new ButtonBuilder()
            .setCustomId("leaderboard_shop")
            .setLabel("🛍️ Cards")
            .setStyle(ButtonStyle.Primary)
        );
        
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`leaderboard_next_${page}`)
            .setLabel("Próximo ➡️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages)
        );
        
        const attachment = new AttachmentBuilder(imagemBuffer, "leaderboard.png");
        
        return interaction.editReply({
          files: [attachment],
          components: [row]
        });
      } catch (error) {
        console.error("Erro ao navegar para página anterior:", error);
        return interaction.editReply({
          content: "Erro ao carregar página. Tente novamente.",
          ephemeral: true
        });
      }
    }
    
    if (customId.startsWith("leaderboard_next_")) {
      const page = parseInt(customId.split("_")[2]) + 1;
      
      await interaction.update({ content: "Carregando próxima página...", components: [] });
      
      try {
        const imagemBuffer = await gerarImagemLeaderboard(interaction, page);
        
        if (!imagemBuffer) {
          return interaction.editReply({
            embeds: [createErrorEmbed("Nenhum usuário encontrado nesta página.")],
            ephemeral: true
          });
        }
        
        // Criar botões de navegação
        const totalPages = Math.ceil(
          Object.entries(await levelsStore.load())
            .filter(([id, data]) => (data.totalXp || 0) >= 10)
            .length / 5
        );
        
        const row = new ActionRowBuilder();
        
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`leaderboard_prev_${page}`)
            .setLabel("⬅️ Anterior")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1)
        );
        
        row.addComponents(
          new ButtonBuilder()
            .setCustomId("leaderboard_shop")
            .setLabel("🛍️ Cards")
            .setStyle(ButtonStyle.Primary)
        );
        
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`leaderboard_next_${page}`)
            .setLabel("Próximo ➡️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages)
        );
        
        const attachment = new AttachmentBuilder(imagemBuffer, "leaderboard.png");
        
        return interaction.editReply({
          files: [attachment],
          components: [row]
        });
      } catch (error) {
        console.error("Erro ao navegar para próxima página:", error);
        return interaction.editReply({
          content: "Erro ao carregar página. Tente novamente.",
          ephemeral: true
        });
      }
    }
  }
};
