const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require("discord.js");
const { createDataStore } = require("../store/dataStore");

// Banco de dados das metas
const metasStore = createDataStore("metas_staff.json");

// Configuração das áreas (baseado no setupstaff.js)
const AREAS_CONFIG = [
  { id: "Divulgação", emoji: "🗞️", color: "#ff4d4d" },
  { id: "Eventos", emoji: "🎉", color: "#2ecc71" },
  { id: "MovCall", emoji: "🎙️", color: "#3498db" },
  { id: "MovChat", emoji: "🗣️", color: "#00d2d3" },
  { id: "Acolhimento", emoji: "🫂", color: "#f1c40f" },
  { id: "Recrutamento", emoji: "🫡", color: "#ff9ff3" },
  { id: "Design", emoji: "🖋️", color: "#c8d6e5" },
  { id: "Pastime", emoji: "😸", color: "#9b59b6" }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("metas")
    .setDescription("Gerencia e anuncia as metas da equipe Staff")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    // Subcomando 1: Definir Meta Geral
    .addSubcommand(sub => 
      sub.setName("definir_geral")
      .setDescription("Define uma meta obrigatória para toda a Staff")
      .addStringOption(opt => 
        opt.setName("texto")
        .setDescription("A meta obrigatória para todos (ex: 3 invites diários)")
        .setRequired(true)
      )
    )

    // Subcomando 2: Definir Meta por Área
    .addSubcommand(sub => 
      sub.setName("definir_area")
      .setDescription("Define uma meta específica para uma área da Staff")
      .addStringOption(opt => 
        opt.setName("area")
        .setDescription("Selecione a área")
        .setRequired(true)
        .addChoices(
          ...AREAS_CONFIG.map(area => ({
            name: `${area.emoji} ${area.id}`,
            value: area.id
          }))
        )
      )
      .addStringOption(opt => 
        opt.setName("texto")
        .setDescription("A meta específica para esta área (ex: 25k mensagens semanais)")
        .setRequired(true)
      )
    )

    // Subcomando 3: Visualizar Metas
    .addSubcommand(sub => 
      sub.setName("visualizar")
      .setDescription("Mostra todas as metas configuradas (apenas para você)")
    )

    // Subcomando 4: Anunciar Metas
    .addSubcommand(sub => 
      sub.setName("anunciar")
      .setDescription("Anuncia as metas em um canal")
      .addChannelOption(opt => 
        opt.setName("canal")
        .setDescription("Canal onde enviar o anúncio")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
      )
      .addRoleOption(opt => 
        opt.setName("ping")
        .setDescription("Cargo para mencionar no anúncio")
        .setRequired(false)
      )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ==========================================
    // DEFINIR META GERAL
    // ==========================================
    if (sub === "definir_geral") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const texto = interaction.options.getString("texto");
      
      await metasStore.update("geral", () => texto);
      
      const embedConfirm = new EmbedBuilder()
        .setTitle("✅ Meta Geral Definida")
        .setColor("#2ecc71")
        .setDescription(`**Meta Geral Obrigatória:**\n\`${texto}\`\n\n*Use \`/metas visualizar\` para confirmar ou \`/metas anunciar\` para divulgar.*`)
        .setFooter({ text: `Definido por ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embedConfirm] });
    }

    // ==========================================
    // DEFINIR META POR ÁREA
    // ==========================================
    if (sub === "definir_area") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const area = interaction.options.getString("area");
      const texto = interaction.options.getString("texto");
      
      await metasStore.update("areas", (areas = {}) => ({
        ...areas,
        [area]: texto
      }));
      
      const areaConfig = AREAS_CONFIG.find(a => a.id === area);
      
      const embedConfirm = new EmbedBuilder()
        .setTitle("✅ Meta de Área Definida")
        .setColor(areaConfig.color)
        .setDescription(`${areaConfig.emoji} **Meta para ${area}:**\n\`${texto}\`\n\n*Use \`/metas visualizar\` para confirmar ou \`/metas anunciar\` para divulgar.*`)
        .setFooter({ text: `Definido por ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embedConfirm] });
    }

    // ==========================================
    // VISUALIZAR METAS
    // ==========================================
    if (sub === "visualizar") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const metas = await metasStore.load();
      
      const embed = new EmbedBuilder()
        .setTitle("📋 Metas Configuradas")
        .setColor("#5865F2")
        .setFooter({ text: `Visualizado por ${interaction.user.username}` })
        .setTimestamp();

      // Meta Geral
      if (metas.geral) {
        embed.addFields({
          name: "🎯 Meta Geral Obrigatória",
          value: `\`${metas.geral}\``,
          inline: false
        });
      } else {
        embed.addFields({
          name: "🎯 Meta Geral Obrigatória",
          value: "`Nenhuma meta geral definida`",
          inline: false
        });
      }

      // Metas por Área
      const areasConfiguradas = Object.entries(metas.areas || {});
      
      if (areasConfiguradas.length > 0) {
        for (const [areaId, metaTexto] of areasConfiguradas) {
          const areaConfig = AREAS_CONFIG.find(a => a.id === areaId);
          if (areaConfig) {
            embed.addFields({
              name: `${areaConfig.emoji} Meta: ${areaId}`,
              value: `\`${metaTexto}\``,
              inline: true
            });
          }
        }
      } else {
        embed.addFields({
          name: "📂 Metas por Área",
          value: "`Nenhuma meta de área definida`",
          inline: false
        });
      }

      // Informações adicionais
      embed.addFields({
        name: "📊 Resumo",
        value: `**Metas Totais:** ${1 + areasConfiguradas.length}\n**Áreas com Metas:** ${areasConfiguradas.length}/8`,
        inline: false
      });

      await interaction.editReply({ embeds: [embed] });
    }

    // ==========================================
    // ANUNCIAR METAS
    // ==========================================
    if (sub === "anunciar") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const canal = interaction.options.getChannel("canal");
      const pingRole = interaction.options.getRole("ping");
      
      const metas = await metasStore.load();
      
      // Verifica se há metas configuradas
      if (!metas.geral && (!metas.areas || Object.keys(metas.areas).length === 0)) {
        return interaction.editReply({
          content: "❌ Não há metas configuradas para anunciar. Use `/metas definir_geral` ou `/metas definir_area` primeiro."
        });
      }

      // Constrói o embed de anúncio
      const embedAnuncio = new EmbedBuilder()
        .setTitle("🎯 Metas da Staff - Período Atual")
        .setColor("#ff9ff3")
        .setDescription(
          "Olá, equipe! 👋\n\n" +
          "Abaixo estão as metas definidas para este período. " +
          "Vamos trabalhar juntos para alcançar nossos objetivos e manter o servidor sempre ativo e organizado! 💪\n\n" +
          "---"
        )
        .setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 256 }))
        .setFooter({ 
          text: `Definido pela Administração • ${new Date().toLocaleDateString('pt-BR')}` 
        })
        .setTimestamp();

      // Adiciona Meta Geral
      if (metas.geral) {
        embedAnuncio.addFields({
          name: "🌟 META GERAL OBRIGATÓRIA",
          value: `**${metas.geral}**\n\n*Esta meta se aplica a TODOS os membros da Staff, independente da área.*`,
          inline: false
        });
      }

      // Adiciona Metas por Área
      const areasConfiguradas = Object.entries(metas.areas || {});
      if (areasConfiguradas.length > 0) {
        let areasText = "";
        
        for (const [areaId, metaTexto] of areasConfiguradas) {
          const areaConfig = AREAS_CONFIG.find(a => a.id === areaId);
          if (areaConfig) {
            areasText += `${areaConfig.emoji} **${areaId}:** ${metaTexto}\n`;
          }
        }
        
        embedAnuncio.addFields({
          name: "📋 METAS POR ÁREA",
          value: areasText,
          inline: false
        });
      }

      // Adiciona mensagem motivacional
      embedAnuncio.addFields({
        name: "💪 Mensagem da Liderança",
        value: 
          "Contamos com o comprometimento e dedicação de cada um de vocês! " +
          "Lembrem-se que o trabalho em equipe e a constância são fundamentais para o sucesso do servidor. " +
          "Qualquer dúvida ou dificuldade, procurem os líderes de área! 🚀",
        inline: false
      });

      // Envia o anúncio
      try {
        const pingText = pingRole ? `<@&${pingRole.id}> ` : "";
        await canal.send({
          content: `${pingText}📢 **NOVAS METAS DEFINIDAS!**`,
          embeds: [embedAnuncio]
        });

        const embedSuccess = new EmbedBuilder()
          .setTitle("✅ Anúncio Enviado")
          .setColor("#2ecc71")
          .setDescription(`As metas foram anunciadas com sucesso em ${canal}!`)
          .addFields({
            name: "📊 Resumo do Anúncio",
            value: `**Meta Geral:** ${metas.geral ? "✅ Definida" : "❌ Não definida"}\n**Metas por Área:** ${areasConfiguradas.length} áreas\n**Canal:** ${canal}\n**Menção:** ${pingRole ? `<@&${pingRole.id}>` : "Nenhuma"}`,
            inline: false
          })
          .setFooter({ text: `Anunciado por ${interaction.user.username}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embedSuccess] });

      } catch (error) {
        console.error("Erro ao enviar anúncio de metas:", error);
        await interaction.editReply({
          content: "❌ Ocorreu um erro ao enviar o anúncio. Verifique se o bot tem permissão para enviar mensagens no canal selecionado."
        });
      }
    }
  },

  // Exportar para uso externo se necessário
  getMetasStore: () => metasStore,
  getAreasConfig: () => AREAS_CONFIG
};
