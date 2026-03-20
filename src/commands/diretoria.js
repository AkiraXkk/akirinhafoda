const { 
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder, MessageFlags 
} = require("discord.js");

const { createEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { logger } = require("../logger");

// 🗄️ Bancos de dados
const cupulaStore = createDataStore("tickets_alta_cupula.json");
const configStore = createDataStore("config_diretoria.json"); // NOVO: Salva as configurações

// 🔢 Gerador de ID Dinâmico baseado no prefixo (ex: duv001, sup002)
async function getNextCupulaId(prefixo) {
  const tickets = await cupulaStore.load();
  const counters = tickets["counters"] || {};
  const nextCount = (counters[prefixo] || 0) + 1;
  
  await cupulaStore.update("counters", (data) => ({ ...data, [prefixo]: nextCount }));
  return `${prefixo}${String(nextCount).padStart(3, "0")}`; 
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("diretoria")
    .setDescription("Sistema de contato direto com a Alta Cúpula")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Só admin consegue ver/usar o comando base
    
    // NOVO SUBCOMANDO: Configurar os IDs
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Configura as categorias e o cargo de ping do sistema")
        .addChannelOption(opt => opt.setName("categoria_abertos").setDescription("Categoria onde os tickets serão CRIADOS").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
        .addChannelOption(opt => opt.setName("categoria_fechados").setDescription("Categoria para onde os tickets FECHADOS vão").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
        .addRoleOption(opt => opt.setName("cargo_ping").setDescription("Cargo da Diretoria que será mencionado no ticket").setRequired(true))
    )
    
    // SUBCOMANDO: Enviar o Painel
    .addSubcommand((sub) =>
      sub
        .setName("painel")
        .setDescription("Envia o painel fixo de contato com a diretoria no canal atual")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ==========================================
    // CONFIGURAÇÃO DOS IDs
    // ==========================================
    if (sub === "config") {
      const catAbertos = interaction.options.getChannel("categoria_abertos");
      const catFechados = interaction.options.getChannel("categoria_fechados");
      const cargoPing = interaction.options.getRole("cargo_ping");

      // Salva no banco de dados usando o ID do servidor como chave
      await configStore.update(interaction.guildId, () => ({
        categoriaAbertosId: catAbertos.id,
        categoriaFechadosId: catFechados.id,
        cargoPingId: cargoPing.id
      }));

      const embedConfig = createEmbed({
        title: "⚙️ Configuração da Diretoria Salva",
        description: `O sistema foi configurado com sucesso para este servidor!\n\n📂 **Abertos:** <#${catAbertos.id}>\n📁 **Fechados:** <#${catFechados.id}>\n🔔 **Cargo Ping:** <@&${cargoPing.id}>`,
        color: 0x2ecc71
      });

      return interaction.reply({ embeds: [embedConfig], flags: MessageFlags.Ephemeral });
    }

    // ==========================================
    // ENVIA O PAINEL FIXO DE CONTATO
    // ==========================================
    if (sub === "painel") {
      // Verifica se o sistema já foi configurado antes de mandar o painel
      const configs = await configStore.load();
      if (!configs[interaction.guildId]) {
        return interaction.reply({ embeds: [createErrorEmbed("O sistema ainda não foi configurado! Use `/diretoria config` primeiro.")], flags: MessageFlags.Ephemeral });
      }

      const embedPainel = new EmbedBuilder()
        .setTitle("🏛️ Contato - Alta Cúpula WDA")
        .setDescription("Este canal é reservado exclusivamente para membros da staff entrarem em contato direto com a Administração.\n\nSelecione no menu abaixo o **motivo** do seu contato para abrir uma linha direta confidencial.")
        .setColor("#FFD700");

      const selectMotivo = new StringSelectMenuBuilder()
        .setCustomId("cupula_abrir_menu")
        .setPlaceholder("Selecione o motivo do contato...")
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel("Dúvida Administrativa").setValue("duv").setEmoji("❓"),
          new StringSelectMenuOptionBuilder().setLabel("Suporte / Ajuda").setValue("sup").setEmoji("🛠️"),
          new StringSelectMenuOptionBuilder().setLabel("Aplicação de Punição").setValue("pun").setEmoji("⚖️"),
          new StringSelectMenuOptionBuilder().setLabel("Sugestão de Upgrade").setValue("up").setEmoji("💡")
        );

      await interaction.channel.send({ 
        embeds: [embedPainel], 
        components: [new ActionRowBuilder().addComponents(selectMotivo)] 
      });
      
      await interaction.reply({ content: "✅ Painel fixo da Alta Cúpula enviado com sucesso!", flags: MessageFlags.Ephemeral });
    }
  },

  // ==========================================
  // HANDLER DE BOTÕES
  // ==========================================
  async handleButton(interaction) {
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    // --- ASSUMIR TICKET ---
    if (interaction.customId === "cupula_assumir") {
      if (!isAdmin) return interaction.reply({ embeds: [createErrorEmbed("Acesso negado: Apenas Administradores podem assumir este ticket.")], flags: MessageFlags.Ephemeral });
      
      await interaction.deferUpdate();
      await cupulaStore.update(interaction.channelId, (info) => (info ? { ...info, assumedBy: interaction.user.id } : null));

      const rowOnlyClose = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("cupula_fechar").setLabel("Encerrar").setStyle(ButtonStyle.Danger).setEmoji("🔒"));
      await interaction.message.edit({ components: [rowOnlyClose] });

      const embedAssumir = createEmbed({ title: "🤝 Atendimento Iniciado", description: `A Diretoria assumiu este caso. Você está sendo atendido por: **${interaction.user.username}**.`, color: 0xf1c40f });
      await interaction.followUp({ embeds: [embedAssumir] });
    }

    // --- FECHAR TICKET (Abre o menu de motivos) ---
    if (interaction.customId === "cupula_fechar") {
      const tickets = await cupulaStore.load();
      const ticketInfo = tickets[interaction.channelId];

      if (!ticketInfo || ticketInfo.closedAt) return interaction.reply({ embeds: [createErrorEmbed("Este ticket já foi encerrado ou não é válido.")], flags: MessageFlags.Ephemeral });

      const isAuthor = ticketInfo.userId === interaction.user.id;
      if (!isAdmin && !isAuthor) return interaction.reply({ embeds: [createErrorEmbed("Apenas o autor ou a Alta Cúpula pode fechar este canal.")], flags: MessageFlags.Ephemeral });

      const motivoMenu = new StringSelectMenuBuilder()
        .setCustomId("cupula_motivo_fechar")
        .setPlaceholder("Selecione a conclusão deste caso...")
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel("Resolvido / Ciente").setValue("Resolvido").setEmoji("✅"),
          new StringSelectMenuOptionBuilder().setLabel("Cancelado pelo Autor").setValue("Cancelado").setEmoji("❌"),
          new StringSelectMenuOptionBuilder().setLabel("Analisado e Rejeitado").setValue("Rejeitado").setEmoji("⛔")
        );

      await interaction.reply({
        embeds: [createEmbed({ title: "🔒 Encerrar Contato", description: "Selecione a resolução final:", color: 0xe74c3c })],
        components: [new ActionRowBuilder().addComponents(motivoMenu)],
        flags: MessageFlags.Ephemeral
      });
    }

    // --- DELETAR TICKET PERMANENTEMENTE ---
    if (interaction.customId === "cupula_delete") {
      if (!isAdmin) return interaction.reply({ embeds: [createErrorEmbed("Apenas Administradores podem destruir estes registros.")], flags: MessageFlags.Ephemeral });
      
      await interaction.reply({ content: "💥 Os registros estão sendo apagados em 5 segundos..." });
      setTimeout(() => interaction.channel.delete().catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); }), 5000);
    }
  },

  // ==========================================
  // HANDLER DE MENUS
  // ==========================================
  async handleSelectMenu(interaction) {
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    // --- CRIAR TICKET A PARTIR DO PAINEL FIXO ---
    if (interaction.customId === "cupula_abrir_menu") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 

      // Puxa as configurações do banco de dados
      const configs = await configStore.load();
      const serverConfig = configs[interaction.guildId];
      if (!serverConfig) return interaction.editReply({ embeds: [createErrorEmbed("O sistema não foi configurado pelos Administradores.")] });

      const prefixo = interaction.values[0]; // Retorna 'duv', 'sup', 'pun' ou 'up'
      
      const tickets = await cupulaStore.load();
      const allTickets = tickets["global"] || tickets;

      // Caçador de Fantasmas
      let existingTicket = null;
      for (const [id, info] of Object.entries(allTickets)) {
        if (id === "counters") continue;
        if (info && info.userId === interaction.user.id && !info.closedAt) {
          const canalAindaExiste = interaction.guild.channels.cache.get(info.channelId);
          if (canalAindaExiste) {
            existingTicket = [id, info];
            break;
          } else {
            await cupulaStore.update(id, (ghostInfo) => ghostInfo ? { ...ghostInfo, closedAt: Date.now() } : null);
          }
        }
      }

      if (existingTicket) return interaction.editReply({ content: `❌ Você já possui uma linha direta aberta em <#${existingTicket[1].channelId}>.` });

      try {
        const ticketId = await getNextCupulaId(prefixo); 
        const cleanUsername = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, ""); 

        // Cria o canal usando a categoria configurada dinamicamente
        const channel = await interaction.guild.channels.create({
          name: `${cleanUsername}-${ticketId}`,
          type: ChannelType.GuildText,
          parent: serverConfig.categoriaAbertosId,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
            { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
          ]
        });

        await cupulaStore.update(channel.id, () => ({
          userId: interaction.user.id, channelName: channel.name, channelId: channel.id,
          ticketId: ticketId, tipo: prefixo, openedAt: Date.now(), closedAt: null,
          guildId: interaction.guildId
        }));

        const nomesTipos = { "duv": "Dúvida", "sup": "Suporte", "pun": "Punição", "up": "Upgrade" };

        const embedTicket = createEmbed({
          title: `🏛️ Linha Direta: ${nomesTipos[prefixo]}`,
          description: `Olá ${interaction.user}, este canal é confidencial.\n\nDescreva detalhadamente sua ${nomesTipos[prefixo].toLowerCase()} abaixo. Apenas membros com cargo de Administração podem visualizar este canal.\n\n🏷️ **Protocolo:** \`${ticketId}\``,
          color: 0x34495e
        });

        const rowActions = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("cupula_assumir").setLabel("Assumir (Apenas Admins)").setStyle(ButtonStyle.Success).setEmoji("🙋"),
          new ButtonBuilder().setCustomId("cupula_fechar").setLabel("Encerrar").setStyle(ButtonStyle.Danger).setEmoji("🔒")
        );

        // Menciona o cargo configurado dinamicamente
        await channel.send({ content: `<@&${serverConfig.cargoPingId}> | Novo contato de ${interaction.user}`, embeds: [embedTicket], components: [rowActions] });
        await interaction.editReply({ content: `✅ Canal de contato criado: ${channel}` });

      } catch (e) {
        console.error("Erro ao criar ticket da cúpula:", e);
        await interaction.editReply({ content: "❌ Ocorreu um erro ao criar o canal. Verifique se o bot tem permissão e se a categoria configurada ainda existe." });
      }
    }

    // --- FECHAR TICKET (Arquivar) ---
    if (interaction.customId === "cupula_motivo_fechar") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Puxa as configurações do banco para saber onde jogar o canal fechado
      const configs = await configStore.load();
      const serverConfig = configs[interaction.guildId];

      const motivo = interaction.values[0];
      const tickets = await cupulaStore.load();
      const ticketInfo = tickets[interaction.channelId];

      if (!ticketInfo || ticketInfo.closedAt) return interaction.editReply({ embeds: [createErrorEmbed("Este canal não é válido ou já está fechado.")] });

      const canal = interaction.channel;
      
      try {
        await canal.permissionOverwrites.edit(ticketInfo.userId, { ViewChannel: false });
        
        await canal.setName(`fechado-${ticketInfo.channelName}`);
        
        // Move o canal para a categoria configurada dinamicamente
        if (serverConfig && serverConfig.categoriaFechadosId) {
          await canal.setParent(serverConfig.categoriaFechadosId, { lockPermissions: false });
        }
      } catch (e) {
        logger.warn({ err: e }, "[diretoria] Permissões insuficientes para mover canal.");
      }

      await cupulaStore.update(interaction.channelId, (info) => (info ? { ...info, closedAt: Date.now() } : null));

      const embedArquivado = createEmbed({
        title: "🔒 Caso Arquivado",
        description: `O membro que solicitou o contato não possui mais acesso à sala.\n\n📋 **Resolução:** ${motivo}\n\n*Apenas a Administração tem acesso a este arquivo. Clique abaixo para destruí-lo.*`,
        color: 0x95a5a6
      });

      const rowAdmin = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("cupula_delete").setLabel("Destruir Arquivo").setStyle(ButtonStyle.Danger).setEmoji("🗑️"));
      await canal.send({ embeds: [embedArquivado], components: [rowAdmin] });
      await interaction.editReply({ content: "✅ Canal selado e arquivado com sucesso!" });
    }
  }
};