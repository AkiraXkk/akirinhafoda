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
    .setDescription("Cria a mega-estrutura da Staff com Fóruns e Embeds Personalizadas")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const embedAviso = new EmbedBuilder()
      .setTitle("⚠️ Confirmação de Mega-Setup")
      .setColor(0xffaa00)
      .setDescription("Isso criará a **Categoria Geral da Staff** e as **Categorias de 8 Áreas**, totalizando quase **70 canais novos**!\n\n⏳ *O processo pode levar até 2 minutos devido aos limites do Discord.*\n\nDeseja iniciar a construção?");

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

      await btnInteraction.update({ content: "⏳ **Construindo o império da Staff...**\nO bot está criando os canais e enviando as Embeds. Aguarde!", embeds: [], components: [] });
      
      const guild = interaction.guild;
      const createdRoles = [];
      const createdChannels = [];

      // ==========================================
      // 1. CARGOS GERAIS
      // ==========================================
      const cargoCupula = await guild.roles.create({ name: "Cúpula / Gerência", color: "#ff0000", hoist: true });
      const cargoStaffGeral = await guild.roles.create({ name: "Staff Geral", color: "#5865F2", hoist: true });
      createdRoles.push(cargoCupula.id, cargoStaffGeral.id);

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

      const chCupula = await guild.channels.create({
        name: "🧧-central-da-cúpula",
        type: ChannelType.GuildText,
        parent: catStaff.id,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: cargoCupula.id, allow: [PermissionFlagsBits.ViewChannel] }
        ]
      });
      createdChannels.push(chCupula.id);

      // CORRIGIDO: wda-coins ao invés de bda-coins
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
        { id: "Divulgação", emojiCat: "📢", color: "#ff4d4d", chefe: "<:chefe:1232392646249418822>", dot: "<:c_pontoredr:1368699031416737916>", desc: "É responsável pela divulgação do servidor, trazendo novos membros. Os requisitos é ter disponibilidade para fazer a função de divulgador e também ter conhecimento dos métodos de divulgação.", resp: "<@376557727079464960>" },
        { id: "Eventos", emojiCat: "🎉", color: "#2ecc71", chefe: "<:chefe:1232392646249418822>", dot: "<:h_green:1368700878776696932>", desc: "É responsável por realizar diversas atividades interativas, com vários tipos de tema e de eventos. O requisito para ser da área é ter tempo livre a noite e disponibilidade para fazer as funções.", resp: "<@376557727079464960>" },
        { id: "MovCall", emojiCat: "🗣️", color: "#3498db", chefe: "<:chefe:1232392646249418822>", dot: "<:e_dot:1295932292061204561>", desc: "É Responsável por moderar e cuidar da movimentação das call´s públicas do servidor. Para fazer parte da equipe de MovCall, deve ter disponibilidade para ficar nos canais de voz, deve interagir com os membros e controlar a toxidade dos mesmos.", resp: "<@376557727079464960>" },
        { id: "MovChat", emojiCat: "💬", color: "#00d2d3", chefe: "<:chefe:1232392646249418822>", dot: "<:h_pontoazul:1139607194908770314>", desc: "É responsável por moderar e movimentar os chats públicos do servidor. A equipe de mov chat deve ter disponibilidade para interagir e recepcionar os membros, também deve zelar para que as regras do chat sejam cumpridas.", resp: "<@376557727079464960> & <@1357771188931399731>" },
        { id: "Acolhimento", emojiCat: "🫂", color: "#f1c40f", chefe: "<:gerente:1232392636606840913>", dot: "<:ponto:1232392655879540861>", desc: "É responsável auxiliar e resolver problemas do membros . A equipe de suporte deve ter responsabilidade para atender tickets diariamente e maturidade e postura, é importantes que os mesmos sejam um exemplo para os restantes staff´s e membros.", resp: "<@376557727079464960> & <@589646045756129301>" },
        { id: "Recrutamento", emojiCat: "🎯", color: "#ff9ff3", chefe: "<:chefe:1232392646249418822>", dot: "<:c_pontoredr:1368699031416737916>", desc: "É responsável por trazer novos membros para equipe staff do servidor. A equipe de recrutamento deve ter disponibilidade para recrutar e explicar aos novos staffs como funciona as regras, as áreas escolhidas e os requisitos.", resp: "<@376557727079464960> & <@1357771188931399731>" },
        { id: "Design", emojiCat: "🎨", color: "#c8d6e5", chefe: "<:gerente:1232392636606840913>", dot: "<:ponto:1232392655879540861>", desc: "É responsável por fazer artes para o servidor como para jornalismo, eventos ou mov temáticas das áreas. A equipe de design deve ter responsabilidade para entregar as artes a tempo certo e disponibilidade para atender os tickets diariamente.", resp: "<@376557727079464960> & <@589646045756129301>" },
        { id: "Pastime", emojiCat: "🎮", color: "#9b59b6", chefe: "<:gerente:1232392636606840913>", dot: "<:j_ponto_roxo:1368718208458297496>", desc: "É responsável fazer postagens nos canais sociais da wda promovendo diversão para os membros. A equipe de e entretenimento deve ter tempo livre para fazer postagens diáriamente para movimentar esses canais.", resp: "<@589646045756129301>" }
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
        // 4. MÁGICA DAS EMBEDS NO FÓRUM
        // ==========================================
        const embedExplicativo = new EmbedBuilder()
          .setTitle(`**${area.id}** - \`Área\` ${area.chefe}`)
          .setColor(area.color)
          .setDescription(`${area.dot} ${area.desc}\n\n> **Responsáveis:**\n${area.resp}`)
          .setFooter({ text: "WDA Staff - Guia Explicativo" });

        const embedLideranca = new EmbedBuilder()
          .setTitle(`👑 Liderança - ${area.id}`)
          .setColor(area.color)
          .setDescription(`Regras, deveres e diretrizes oficias para a liderança da equipe de **${area.id}**.\n\n*(Staff Administrativa: Edite esta mensagem para adicionar as regras específicas da liderança desta área)*`)
          .setFooter({ text: "WDA Staff - Regimento Interno" });

        try {
          // Cria os posts no fórum já enviando as Embeds personalizadas!
          await forumGuia.threads.create({ 
            name: "Liderança", 
            message: { embeds: [embedLideranca] } 
          });
          await forumGuia.threads.create({ 
            name: "Explicativo", 
            message: { embeds: [embedExplicativo] } 
          });
        } catch (err) {}

        const chAv = await guild.channels.create({ name: `📢-avisos-${areaNameLower}`, type: ChannelType.GuildText, parent: categoria.id });
        const chPr = await guild.channels.create({ name: `🎐-provas-${areaNameLower}`, type: ChannelType.GuildText, parent: categoria.id });
        const chatArea = await guild.channels.create({ name: `❄️-chat-${areaNameLower}`, type: ChannelType.GuildText, parent: categoria.id });
        const chAp = await guild.channels.create({ name: `🙋-apresentação`, type: ChannelType.GuildText, parent: categoria.id });
        const chAb = await guild.channels.create({ name: `✨-${areaNameLower}-aberto`, type: ChannelType.GuildText, parent: categoria.id });
        const vcArea = await guild.channels.create({ name: `🔊 ・ Reunião ${area.id}`, type: ChannelType.GuildVoice, parent: categoria.id });

        createdChannels.push(chAv.id, chPr.id, chatArea.id, chAp.id, chAb.id, vcArea.id);
        
        // Opcional: Uma embed simples de boas vindas no chat de texto para não ficar vazio
        const welcomeEmbed = new EmbedBuilder()
          .setColor(area.color)
          .setDescription(`Bem-vindos ao chat oficial da equipe de **${area.id}**! Lembrem-se de verificar o canal de guias.`);
        await chatArea.send({ embeds: [welcomeEmbed] }).catch(()=>{});
      }

      await setupStore.update(guild.id, () => ({ roles: createdRoles, channels: createdChannels }));

      return interaction.editReply({ content: "✅ **Mega-Estrutura montada com sucesso!**\nTodos os canais da Staff Geral e as 8 Áreas foram gerados. Fóruns preenchidos com Embeds personalizadas!" });

    } catch (e) {
      console.error(e);
      return interaction.editReply({ content: "⏳ Ocorreu um erro ou a ação foi abortada.", embeds: [], components: [] }).catch(()=>{});
    }
  }
};
