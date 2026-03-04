const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage } = require("canvas");
const { createEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

const levelsStore = createDataStore("levels.json");

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

// Função principal para gerar imagem do leaderboard
async function gerarImagemLeaderboard(interaction, page = 1) {
  const canvas = createCanvas(934, 800);
  const ctx = canvas.getContext("2d");
  
  // Carregar dados do banco
  const levels = await levelsStore.load();
  
  // Filtrar usuários com XP >= 10 e ordenar
  const usuariosValidos = Object.entries(levels)
    .filter(([id, data]) => (data.totalXp || 0) >= 10)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0));
  
  // Calcular skip e limit
  const skip = (page - 1) * 5;
  const usuariosPagina = usuariosValidos.slice(skip, skip + 5);
  
  // Verificar se há usuários na página
  if (usuariosPagina.length === 0) {
    return null;
  }
  
  // Fundo principal com gradiente
  const gradient = ctx.createLinearGradient(0, 0, 0, 800);
  gradient.addColorStop(0, "#1a1a1a");
  gradient.addColorStop(1, "#2c2f33");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 934, 800);
  
  // Cabeçalho
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "center";
  ctx.fillText("🏆 LEADERBOARD", 467, 60);
  
  ctx.font = "18px Arial";
  ctx.fillStyle = "#95a5a6";
  ctx.fillText(`Página ${page}`, 467, 90);
  
  // Lista de usuários
  let yPos = 140;
  usuariosPagina.forEach((usuario, index) => {
    const posicao = skip + index + 1;
    
    // Fundo do item
    ctx.fillStyle = index % 2 === 0 ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)";
    ctx.fillRect(50, yPos - 5, 834, 70);
    
    // Posição
    ctx.fillStyle = posicao <= 3 ? "#ffd700" : posicao <= 10 ? "#c0c0c0" : "#95a5a6";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`#${posicao}`, 70, yPos + 25);
    
    // Avatar placeholder
    ctx.fillStyle = "#4a5568";
    ctx.fillRect(140, yPos + 5, 40, 40);
    
    // Nome do usuário
    ctx.fillStyle = "#ffffff";
    ctx.font = "20px Arial";
    ctx.textAlign = "left";
    const nomeTruncado = usuario.id.length > 15 ? `<@${usuario.id.substring(0, 12)}...>` : `<@${usuario.id}>`;
    ctx.fillText(nomeTruncado, 200, yPos + 25);
    
    // Nível e XP
    ctx.font = "18px Arial";
    ctx.fillStyle = "#95a5a6";
    ctx.fillText(`Nível ${usuario.level || 1}`, 200, yPos + 45);
    
    ctx.fillStyle = "#7289da";
    ctx.fillText(`${usuario.totalXp || 0} XP`, 450, yPos + 45);
    
    yPos += 90;
  });
  
  // Rodapé
  ctx.fillStyle = "#95a5a6";
  // Carregar banners e avatares simultaneamente
  const usuariosComAssets = await Promise.all(
    usuariosPagina.map(async (usuario, index) => {
      try {
        // Carregar avatar
        let avatar;
        try {
          avatar = await loadImage(
            interaction.client.users.cache.get(usuario.id)?.displayAvatarURL({ size: 128, extension: "png" }) || 
            `https://cdn.discordapp.com/embed/avatars/${usuario.id}/${usuario.avatar}.png?size=128`
          );
        } catch (error) {
          console.log(`Erro ao carregar avatar do usuário ${usuario.id}:`, error.message);
          avatar = null;
        }
        
        // Carregar banner (se existir)
        let banner;
        if (usuario.banner_atual) {
          try {
            banner = await loadImage(usuario.banner_atual);
          } catch (error) {
            console.log(`Banner inválido para usuário ${usuario.id}, usando fallback:`, error.message);
            banner = null;
          }
        }
        
        return {
          ...usuario,
          index,
          avatar,
          banner,
          y: 80 + (index * 140) // Posição Y de cada linha
        };
      } catch (error) {
        console.log(`Erro ao processar usuário ${usuario.id}:`, error.message);
        return {
          ...usuario,
          index,
          avatar: null,
          banner: null,
          y: 80 + (index * 140)
        };
      }
    })
  );
  
  // Desenhar cada linha do usuário
  for (const { id, totalXp, level, voice_time, index, avatar, banner, y } of usuariosComAssets) {
    // Área da linha (130px altura)
    const linhaY = y;
    const linhaAltura = 130;
    
    // Fundo da linha (banner ou cor sólida)
    if (banner) {
      // Desenhar banner esticado
      ctx.drawImage(banner, 0, linhaY, 934, linhaAltura);
    } else {
      // Fundo sólido como fallback
      ctx.fillStyle = "#2c2f33";
      ctx.fillRect(0, linhaY, 934, linhaAltura);
    }
    
    // Overlay escuro para legibilidade (50% opacidade)
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, linhaY, 934, linhaAltura);
    
    // Avatar circular
    if (avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(80, linhaY + 65, 40, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, 40, linhaY + 25, 80, 80);
      ctx.restore();
    } else {
      // Placeholder para avatar
      ctx.fillStyle = "#4a5568";
      ctx.beginPath();
      ctx.arc(80, linhaY + 65, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px Roboto-Bold";
      ctx.textAlign = "center";
      ctx.fillText("?", 80, linhaY + 72);
    }
    
    // Informações textuais
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "left";
    
    // Posição e Nickname
    const user = interaction.client.users.cache.get(id);
    const nickname = user?.displayName || `Usuário${id}`;
    ctx.fillText(`#${index + 1} ${nickname}`, 140, linhaY + 30);
    
    ctx.font = "16px Arial";
    ctx.fillStyle = "#b8bfc7";
    ctx.fillText(`ID: ${id}`, 140, linhaY + 55);
    
    // XP Total e Nível
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`XP Total: ${totalXp || 0}`, 140, linhaY + 80);
    ctx.fillText(`Nível: ${level || 1}`, 140, linhaY + 105);
    
    // Tempo em Call
    const tempoFormatado = formatarTempoCall(voice_time);
    ctx.fillText(`Tempo em Call: ${tempoFormatado}`, 140, linhaY + 125);
  }
  
  // Rodapé
  ctx.fillStyle = "#95a5a6";
  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`Total: ${usuariosValidos.length} usuários • Mostrando ${Math.min(5, usuariosValidos.length - skip)}`, 467, 760);
  
  return canvas.toBuffer("image/png");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Mostra o ranking dos usuários com mais XP")
    .addIntegerOption((opt) => opt.setName("pagina").setDescription("Número da página").setMinValue(1).setRequired(false)),

  async execute(interaction) {
    const page = interaction.options.getInteger("pagina") || 1;
    
    await interaction.deferReply();
    
    try {
      const imagemBuffer = await gerarImagemLeaderboard(interaction, page);
      
      if (!imagemBuffer) {
        return interaction.editReply({
          embeds: [createEmbed("Nenhum usuário encontrado nesta página.")],
          ephemeral: true
        });
      }
      
      const attachment = new AttachmentBuilder(imagemBuffer, "leaderboard.png");
      
      return interaction.editReply({
        files: [attachment]
      });
      
    } catch (error) {
      console.error("Erro ao gerar leaderboard:", error);
      return interaction.editReply({
        content: "Ocorreu um erro ao gerar o leaderboard. Tente novamente.",
        ephemeral: true
      });
    }
  }
};
