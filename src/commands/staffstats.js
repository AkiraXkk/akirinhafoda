const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  PermissionFlagsBits 
} = require("discord.js");
const { createDataStore } = require("../store/dataStore");

// Bancos de dados existentes
const levelsStore = createDataStore("levels.json");
const ticketStore = createDataStore("tickets.json");
const staffStatsStore = createDataStore("staff_stats.json"); // Criaremos este se não existir

// IDs das áreas baseado no setupstaff.js
const AREAS_CONFIG = [
  { id: "Divulgação", emoji: "🗞️", color: "#ff4d4d", roleName: "Equipe Divulgação" },
  { id: "Eventos", emoji: "🎉", color: "#2ecc71", roleName: "Equipe Eventos" },
  { id: "MovCall", emoji: "🎙️", color: "#3498db", roleName: "Equipe MovCall" },
  { id: "MovChat", emoji: "🗣️", color: "#00d2d3", roleName: "Equipe MovChat" },
  { id: "Acolhimento", emoji: "🫂", color: "#f1c40f", roleName: "Equipe Acolhimento" },
  { id: "Recrutamento", emoji: "🫡", color: "#ff9ff3", roleName: "Equipe Recrutamento" },
  { id: "Design", emoji: "🖋️", color: "#c8d6e5", roleName: "Equipe Design" },
  { id: "Pastime", emoji: "😸", color: "#9b59b6", roleName: "Equipe Pastime" }
];

// Função formatDuration do levels.js
function formatDuration(ms) {
  if (!ms || ms === 0) return "0min";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes}min`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("staffstats")
    .setDescription("Mostra suas estatísticas de produtividade como Staff")
    .addUserOption(opt => 
      opt.setName("usuario")
      .setDescription("Verificar stats de outro membro da Staff")
      .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("usuario") || interaction.user;
    const targetMember = await interaction.guild.members.fetch(targetUser.id);
    
    // Verifica se o usuário tem algum cargo de equipe
    const userAreas = AREAS_CONFIG.filter(area => 
      targetMember.roles.cache.some(role => role.name === area.roleName)
    );

    if (userAreas.length === 0) {
      return interaction.reply({ 
        content: "❌ Este membro não faz parte de nenhuma equipe da Staff mapeada.", 
        ephemeral: true 
      });
    }

    await interaction.deferReply({ ephemeral: targetUser.id !== interaction.user.id });

    try {
      const levels = await levelsStore.load();
      const tickets = await ticketStore.load();
      const staffStats = await staffStatsStore.load();
      
      const userData = levels[targetUser.id] || {};
      const ticketData = tickets[targetUser.id] || {};
      const statsData = staffStats[targetUser.id] || {};

      // Embed principal
      const embed = new EmbedBuilder()
        .setTitle(`${AREAS_CONFIG[0].emoji} 📊 Painel de Estatísticas Staff`)
        .setColor("#5865F2")
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .setFooter({ 
          text: `Estatísticas de ${targetUser.username} • ${new Date().toLocaleDateString('pt-BR')}` 
        })
        .setTimestamp();

      // Campos para cada área que o usuário pertence
      for (const area of userAreas) {
        let fieldValue = "📊 Sem dados registrados";
        
        switch (area.id) {
          case "Divulgação":
            const parceriasFechadas = statsData.parcerias_fechadas || 0;
            const convitesEnviados = statsData.convites_enviados || 0;
            fieldValue = `**🤝 Parcerias Fechadas:** ${parceriasFechadas}\n**📩 Convites Enviados:** ${convitesEnviados}`;
            break;

          case "MovCall":
            const voiceTime = userData.voice_time || 0;
            fieldValue = `**🎙️ Tempo em Call:** ${formatDuration(voiceTime)}`;
            break;

          case "MovChat":
            const messagesCount = userData.messages_count || 0;
            fieldValue = `**🗣️ Mensagens Enviadas:** ${messagesCount.toLocaleString('pt-BR')}`;
            break;

          case "Acolhimento":
            const ticketsAtendidos = ticketData.tickets_atendidos || 0;
            const ticketsFechados = ticketData.tickets_fechados || 0;
            fieldValue = `**🎫 Tickets Atendidos:** ${ticketsAtendidos}\n**🔒 Tickets Fechados:** ${ticketsFechados}`;
            break;

          case "Recrutamento":
            const membrosRecrutados = statsData.membros_recrutados || 0;
            const entrevistasRealizadas = statsData.entrevistas_realizadas || 0;
            fieldValue = `**👥 Membros Recrutados:** ${membrosRecrutados}\n**🫂 Entrevistas Realizadas:** ${entrevistasRealizadas}`;
            break;

          case "Eventos":
            const eventosCriados = statsData.eventos_criados || 0;
            const sorteiosRealizados = statsData.sorteios_realizados || 0;
            fieldValue = `**🎉 Eventos Criados:** ${eventosCriados}\n**🎁 Sorteios Realizados:** ${sorteiosRealizados}`;
            break;

          case "Design":
            const artesCriadas = statsData.artes_criadas || 0;
            const pedidosEntregues = statsData.pedidos_entregues || 0;
            fieldValue = `**🎨 Artes Criadas:** ${artesCriadas}\n**📦 Pedidos Entregues:** ${pedidosEntregues}`;
            break;

          case "Pastime":
            const postsCriados = statsData.posts_criados || 0;
            const minigamesLancados = statsData.minigames_lancados || 0;
            fieldValue = `**📝 Posts Criados:** ${postsCriados}\n**🎮 Mini-games Lançados:** ${minigamesLancados}`;
            break;
        }

        embed.addFields({
          name: `${area.emoji} ${area.id}`,
          value: fieldValue,
          inline: false
        });
      }

      // Adiciona informações gerais
      embed.addFields({
        name: "📈 Visão Geral",
        value: `**🏆 Level Atual:** ${userData.level || 0}\n**⭐ XP Total:** ${(userData.totalXp || 0).toLocaleString('pt-BR')}\n**🎯 Áreas Ativas:** ${userAreas.length}`,
        inline: false
      });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("Erro ao buscar estatísticas:", error);
      await interaction.editReply({ 
        content: "❌ Ocorreu um erro ao buscar suas estatísticas. Tente novamente mais tarde." 
      });
    }
  },

  // Funções auxiliares para atualizar estatísticas (podem ser chamadas por outros comandos)
  async updateStaffStats(userId, area, action, value = 1) {
    const staffStats = await staffStatsStore.load();
    
    if (!staffStats[userId]) {
      staffStats[userId] = {};
    }

    switch (area) {
      case "Divulgação":
        if (action === "parceria") {
          staffStats[userId].parcerias_fechadas = (staffStats[userId].parcerias_fechadas || 0) + value;
        } else if (action === "convite") {
          staffStats[userId].convites_enviados = (staffStats[userId].convites_enviados || 0) + value;
        }
        break;

      case "Recrutamento":
        if (action === "recrutado") {
          staffStats[userId].membros_recrutados = (staffStats[userId].membros_recrutados || 0) + value;
        } else if (action === "entrevista") {
          staffStats[userId].entrevistas_realizadas = (staffStats[userId].entrevistas_realizadas || 0) + value;
        }
        break;

      case "Eventos":
        if (action === "evento") {
          staffStats[userId].eventos_criados = (staffStats[userId].eventos_criados || 0) + value;
        } else if (action === "sorteio") {
          staffStats[userId].sorteios_realizados = (staffStats[userId].sorteios_realizados || 0) + value;
        }
        break;

      case "Design":
        if (action === "arte") {
          staffStats[userId].artes_criadas = (staffStats[userId].artes_criadas || 0) + value;
        } else if (action === "pedido") {
          staffStats[userId].pedidos_entregues = (staffStats[userId].pedidos_entregues || 0) + value;
        }
        break;

      case "Pastime":
        if (action === "post") {
          staffStats[userId].posts_criados = (staffStats[userId].posts_criados || 0) + value;
        } else if (action === "minigame") {
          staffStats[userId].minigames_lancados = (staffStats[userId].minigames_lancados || 0) + value;
        }
        break;
    }

    await staffStatsStore.save(staffStats);
  },

  // Exportar stores para uso externo
  getStaffStatsStore: () => staffStatsStore,
  getAreasConfig: () => AREAS_CONFIG
};
