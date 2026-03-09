const { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChannelType, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require("discord.js");
const { createDataStore } = require("../store/dataStore");

const setupStore = createDataStore("setup_staff.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setupstaff")
    .setDescription("Cria a mega-estrutura da Staff com Ranks de Liderança e Canais Estéticos")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const embedAviso = new EmbedBuilder()
      .setTitle("⚠️ Confirmação de Mega-Setup")
      .setColor(0xffaa00)
      .setDescription("Isso criará a **Categoria da Staff**, os **5 Ranks de Liderança** e as **8 Áreas completas**!\n\n⏳ *O processo pode levar até 2 minutos devido aos limites do Discord.*\n\nDeseja iniciar a construção?");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("confirm_setup").setLabel("✅ Construir Servidor").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("cancel_setup").setLabel("❌ Cancelar").setStyle(ButtonStyle.Danger)
    );

    const msg = await interaction.reply({ embeds: [embedAviso], components: [row], ephemeral: true });

    try {
      const btnInteraction = await msg.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 30000 });

      if (btnInteraction.customId === "cancel_setup") {
        return btnInteraction.update({ content: "❌ Setup cancelado.", embeds: [], components: [] });
      }

      await btnInteraction.update({ content: "⏳ **Construindo o império da Staff...**\nO bot está a criar os cargos, canais e a formatar os fóruns. Aguarde!", embeds: [], components: [] });
      
      const guild = interaction.guild;
      const createdRoles = [];
      const createdChannels = [];

      // ==========================================
      // 1. CARGOS DE RANKS E STAFF GERAL
      // ==========================================
      const roleChefe = await guild.roles.create({ name: "Chefe", color: "#ff0000", hoist: true });
      const roleSubChefe = await guild.roles.create({ name: "Sub-Chefe", color: "#ff4500", hoist: true });
      const roleGerente = await guild.roles.create({ name: "Gerente", color: "#ff8c00", hoist: true });
      const roleCoord = await guild.roles.create({ name: "Coordenador", color: "#ffd700", hoist: true });
      const roleSuperv = await guild.roles.create({ name: "Supervisores", color: "#ffff00", hoist: true });
      
      const cargoStaffGeral = await guild.roles.create({ name: "Staff Geral", color: "#5865F2", hoist: true });
      
      const leadershipRoles = [roleChefe, roleSubChefe, roleGerente, roleCoord, roleSuperv];
      createdRoles.push(...leadershipRoles.map(r => r.id), cargoStaffGeral.id);

      // ==========================================
      // 2. CATEGORIA GLOBAL DA STAFF
      // ==========================================
      const catStaff = await guild.channels.create({
        name: "🚨 ┆ Staff",
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: cargoStaffGeral.id, allow: [PermissionFlagsBits.ViewChannel] }
        ]
      });
      createdChannels.push(catStaff.id);

      // Canal da Cúpula (Restrito aos 2 cargos mais altos)
      const chCupula = await guild.channels.create({
        name: "🧧-central-da-cúpula",
        type: ChannelType.GuildText,
        parent: catStaff.id,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: roleChefe.id, allow: [PermissionFlagsBits.ViewChannel] },
          { id: roleSubChefe.id, allow: [PermissionFlagsBits.ViewChannel] }
        ]
      });
      createdChannels.push(chCupula.id);

      // ⭐ CANAL: Líderes de Área (Restrito aos 5 ranks de Liderança)
      const chLideres = await guild.channels.create({
        name: "👑-líderes-de-área",
        type: ChannelType.GuildText,
        parent: catStaff.id,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          ...leadershipRoles.map(r => ({
            id: r.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
          }))
        ]
      });
      createdChannels.push(chLideres.id);

      // Canais Gerais
      const staffTextChannels = ["📢-avisos-staff", "🧭-guia-staff", "🚀-compre-upamento", "🎁-sorteio-staff", "⭐-destaques", "🛒-wda-coins", "🏆-rank-up", "🔥-farm", "🧾-chat-reunião"];

      for (const chName of staffTextChannels) {
        const ch = await guild.channels.create({ name: chName, type: ChannelType.GuildText, parent: catStaff.id });
        createdChannels.push(ch.id);
      }

      const vc1 = await guild.channels.create({ name: "📞 ・ Mov Geral", type: ChannelType.GuildVoice, parent: catStaff.id });
      const vc2 = await guild.channels.create({ name: "📞 ・ Mov Geral", type: ChannelType.GuildVoice, parent: catStaff.id });
      createdChannels.push(vc1.id, vc2.id);

      // ==========================================
      // 3. BANCO DE DADOS DAS ÁREAS
      // ==========================================
      const areasConfig = [
        { 
          id: "Divulgação", emojiCat: "🗞️", color: "#ff4d4d", 
          desc: "É responsável pela divulgação do servidor, trazendo novos membros. O requisito é ter disponibilidade para fazer a função de divulgador e também ter conhecimento dos métodos de divulgação.", 
          resp: "<@376557727079464960>" 
        },
        { 
          id: "Eventos", emojiCat: "🎉", color: "#2ecc71", 
          desc: "É responsável por realizar diversas atividades interativas, com vários tipos de temas e de eventos. O requisito para ser da área é ter tempo livre à noite e disponibilidade para fazer as funções.", 
          resp: "<@376557727079464960>" 
        },
        { 
          id: "MovCall", emojiCat: "🎙️", color: "#3498db", 
          desc: "É responsável por moderar e cuidar da movimentação das calls públicas do servidor. Para fazer parte da equipe de MovCall, deve ter disponibilidade para ficar nos canais de voz, interagir com os membros e controlar a toxicidade dos mesmos.", 
          resp: "<@376557727079464960>" 
        },
        { 
          id: "MovChat", emojiCat: "🗣️", color: "#00d2d3", 
          desc: "É responsável por moderar e movimentar os chats públicos do servidor. A equipe de MovChat deve ter disponibilidade para interagir e recepcionar os membros, e também deve zelar para que as regras do chat sejam cumpridas.", 
          resp: "<@376557727079464960> & <@1357771188931399731>" 
        },
        { 
          id: "Acolhimento", emojiCat: "🫂", color: "#f1c40f", 
          desc: "É responsável por auxiliar e resolver problemas dos membros. A equipe de suporte deve ter responsabilidade para atender tickets diariamente, além de maturidade e postura. É importante que os mesmos sejam um exemplo para os restantes staffs e membros.", 
          resp: "<@376557727079464960> & <@589646045756129301>" 
        },
        { 
          id: "Recrutamento", emojiCat: "🫡", color: "#ff9ff3", 
          desc: "É responsável por trazer novos membros para a equipe staff do servidor. A equipe de recrutamento deve ter disponibilidade para recrutar e explicar aos novos staffs como funcionam as regras, as áreas escolhidas e os requisitos.", 
          resp: "<@376557727079464960> & <@1357771188931399731>" 
        },
        { 
          id: "Design", emojiCat: "🖋️", color: "#c8d6e5", 
          desc: "É responsável por fazer artes para o servidor, como para jornalismo, eventos ou movimentações temáticas das áreas. A equipe de design deve ter responsabilidade para entregar as artes no tempo certo e disponibilidade para atender os tickets diariamente.", 
          resp: "<@376557727079464960> & <@589646045756129301>" 
        },
        { 
          id: "Pastime", emojiCat: "😸", color: "#9b59b6", 
          desc: "É responsável por fazer postagens nos canais sociais da WDA, promovendo diversão para os membros. A equipe de entretenimento deve ter tempo livre para fazer postagens diariamente para movimentar esses canais.", 
          resp: "<@589646045756129301>" 
        }
      ];

      for (const area of areasConfig) {
        const areaNameLower = area.id.toLowerCase();
        
        const cargoEquipe = await guild.roles.create({ name: `Equipe ${area.id}`, color: area.color });
        createdRoles.push(cargoEquipe.id);

        const categoria = await guild.channels.create({
          name: `${area.emojiCat} ┆ ${area.id}`,
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: cargoEquipe.id, allow: [PermissionFlagsBits.ViewChannel] }
          ]
        });
        createdChannels.push(categoria.id);

        const forumGuia = await guild.channels.create({ name: `🌀-guia-${areaNameLower}`, type: ChannelType.GuildForum, parent: categoria.id });
        createdChannels.push(forumGuia.id);
        
        // ==========================================
        // 4. MÁGICA ESTÉTICA NO FÓRUM (Sem Embed)
        // ==========================================
        
        // Ajusta a gramática do texto automaticamente ("É responsável" -> "é responsável")
        const descricaoAjustada = area.desc.charAt(0).toLowerCase() + area.desc.slice(1);

        // Texto formatado EXATAMENTE igual ao print fornecido
        const textoEstetico = `⸜ ヽ ⸼ ⢄ ${area.emojiCat} A Área de **${area.id}**, ${descricaoAjustada}\n\n⠂ ︵ ◠ . ⠈ ╰ ↪ O foco da nossa equipa é manter a organização, o engajamento e a qualidade na comunidade, trabalhando sempre em conjunto para o crescimento do servidor.\n\n૩ ↪ 𝟹 **Responsáveis pela Equipa:**\n${area.resp}\n\n<@&${cargoEquipe.id}>`;

        const embedLideranca = new EmbedBuilder()
          .setTitle(`👑 Liderança - ${area.id}`)
          .setColor(area.color)
          .setDescription(`Regras, deveres e diretrizes oficias para a liderança da equipa de **${area.id}**.\n\n*(Staff Administrativa: Edite esta mensagem para adicionar as regras específicas da liderança desta área)*`)
          .setFooter({ text: "WDA Staff - Regimento Interno" });

        try {
          await forumGuia.threads.create({ 
            name: "Liderança", 
            message: { embeds: [embedLideranca] } 
          });
          
          await forumGuia.threads.create({ 
            name: "Explicativo", 
            message: { content: textoEstetico } 
          });
        } catch (err) {}

        const chAv = await guild.channels.create({ name: `📢-avisos-${areaNameLower}`, type: ChannelType.GuildText, parent: categoria.id });
        const chPr = await guild.channels.create({ name: `🎐-provas-${areaNameLower}`, type: ChannelType.GuildText, parent: categoria.id });
        const chatArea = await guild.channels.create({ name: `❄️-chat-${areaNameLower}`, type: ChannelType.GuildText, parent: categoria.id });
        const chAp = await guild.channels.create({ name: `🙋-apresentação`, type: ChannelType.GuildText, parent: categoria.id });
        const chAb = await guild.channels.create({ name: `✨-${areaNameLower}-aberto`, type: ChannelType.GuildText, parent: categoria.id });
        const vcArea = await guild.channels.create({ name: `🔊 ・ Reunião ${area.id}`, type: ChannelType.GuildVoice, parent: categoria.id });

        createdChannels.push(chAv.id, chPr.id, chatArea.id, chAp.id, chAb.id, vcArea.id);
        
        // Embed de boas vindas no chat
        const welcomeEmbed = new EmbedBuilder()
          .setColor(area.color)
          .setDescription(`Bem-vindos ao chat oficial da equipa de **${area.id}**! Lembrem-se de verificar o canal de guias.`);
        await chatArea.send({ embeds: [welcomeEmbed] }).catch(()=>{});
      }

      await setupStore.update(guild.id, () => ({ roles: createdRoles, channels: createdChannels }));

      return interaction.editReply({ content: "✅ **Mega-Estrutura montada com sucesso!**\nOs 5 ranks de liderança foram criados e o canal de líderes foi configurado. Os fóruns agora utilizam o seu padrão estético de texto limpo!" });

    } catch (e) {
      console.error(e);
      return interaction.editReply({ content: "⏳ Ocorreu um erro ou a ação foi abortada.", embeds: [], components: [] }).catch(()=>{});
    }
  }
};