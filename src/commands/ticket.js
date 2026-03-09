const { 
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder 
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const { createEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

// Banco de dados dos tickets (abertos, fechados, IDs)
const ticketStore = createDataStore("tickets.json");
// Banco de dados NOVO: Salva as configurações feitas no painel do administrador
const setupStore = createDataStore("ticket_setup.json");

// IDs Fixos da WDA
const CATEGORIA_FECHADOS_ID = "1097361304756433019";
const CARGOS_STAFF_WDA = ["1480452886755278848", "1480452884859453520"]; 

// Ícones personalizados para o menu do usuário
const CATEGORY_ICONS = {
  suporte: "🤔",
  parceria: "🤝",
  denuncia: "☎️",
  sugestao: "💡",
  vip: "💎"
};

function loadTicketCategories() {
  try {
    const configPath = path.join(__dirname, "../data/ticketCategories.json");
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    console.error("Erro ao carregar ticketCategories.json:", error);
    return null;
  }
}

async function getNextTicketId(ticketType) {
  const tickets = await ticketStore.load();
  const counters = tickets["counters"] || {};
  const nextCount = (counters[ticketType] || 0) + 1;
  
  await ticketStore.update("counters", (data) => {
    return { ...data, [ticketType]: nextCount };
  });

  const shortType = ticketType.substring(0, 3).toLowerCase();
  const paddedCount = String(nextCount).padStart(3, "0"); 
  return `${shortType}${paddedCount}`; 
}

function isStaff(member) {
  return CARGOS_STAFF_WDA.some(roleId => member.roles.cache.has(roleId));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Sistema de Tickets Avançado")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Abre o menu interativo para configurar e enviar o painel de tickets")
    )
    .addSubcommand((sub) => sub.setName("close").setDescription("Fecha (arquiva) o ticket atual"))
    .addSubcommand((sub) => sub.setName("list").setDescription("Lista todos os tickets abertos")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const logService = interaction.client.services?.log;
    const ticketConfig = loadTicketCategories();

    if (!ticketConfig) return interaction.reply({ embeds: [createErrorEmbed("ticketCategories.json não encontrado.")], ephemeral: true });

    // ==========================================
    // 1. SETUP ADMINISTRATIVO INTERATIVO
    // ==========================================
    if (sub === "setup") {
      const embedSetup = new EmbedBuilder()
        .setTitle("⚙️ Gerenciamento de Tickets WDA")
        .setDescription("Utilize o menu abaixo para configurar qual **Categoria** (canal) e qual **Cargo** será acionado para cada tipo de ticket.\n\nQuando terminar de configurar, clique no botão para enviar o painel oficial neste chat.")
        .setColor("#2F3136");

      const selectCategorias = new StringSelectMenuBuilder()
        .setCustomId("setup_select_cat")
        .setPlaceholder("Escolha o tipo de ticket para configurar...")
        .addOptions(
          Object.entries(ticketConfig.categories).map(([key, cat]) => 
            new StringSelectMenuOptionBuilder()
              .setLabel(`Configurar: ${cat.title.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').trim()}`)
              .setValue(key)
              .setEmoji(CATEGORY_ICONS[key] || "🎫")
          )
        );

      const btnEnviar = new ButtonBuilder()
        .setCustomId("setup_send_panel")
        .setLabel("Enviar Painel Oficial Aqui")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅");

      await interaction.reply({ 
        embeds: [embedSetup], 
        components: [
          new ActionRowBuilder().addComponents(selectCategorias),
          new ActionRowBuilder().addComponents(btnEnviar)
        ], 
        ephemeral: true 
      });
    }

    if (sub === "list") {
      const tickets = await ticketStore.load();
      const allTickets = tickets["global"] || tickets; 
      const openTickets = Object.entries(allTickets).filter(([id, info]) => id !== "counters" && info && !info.closedAt && info.openedAt).sort((a, b) => b[1].openedAt - a[1].openedAt);

      if (openTickets.length === 0) return interaction.reply({ embeds: [createEmbed({ title: "📋 Tickets Abertos", description: "Não há tickets abertos no momento.", color: 0x3498db })], ephemeral: true });

      const fields = openTickets.slice(0, 10).map(([channelId, info]) => ({
        name: `🎫 ${info.channelName} (ID: ${info.ticketId})`, value: `Criado por <@${info.userId}>\nAberto em <t:${Math.floor(info.openedAt / 1000)}>`, inline: false
      }));

      await interaction.reply({ embeds: [createEmbed({ title: "📋 Tickets Abertos", description: `Mostrando os ${Math.min(openTickets.length, 10)} mais recentes.`, fields, color: 0x3498db })], ephemeral: true });
    }

    if (sub === "close") {
      await module.exports.archiveTicket(interaction, ticketStore, logService);
    }
  },

  async archiveTicket(interaction, ticketStore, logService) {
    const tickets = await ticketStore.load();
    const ticketInfo = tickets[interaction.channelId] || (tickets["global"] && tickets["global"][interaction.channelId]);

    if (!ticketInfo) return interaction.reply({ embeds: [createErrorEmbed("Este não é um ticket válido.")], ephemeral: true });
    if (ticketInfo.closedAt) return interaction.reply({ content: "❌ Este ticket já foi arquivado.", ephemeral: true });

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isStaff(member) && ticketInfo.userId !== interaction.user.id) {
      return interaction.reply({ embeds: [createErrorEmbed("Apenas staff ou o criador do ticket pode fechá-lo.")], ephemeral: true });
    }

    await interaction.reply({ content: "🔒 Arquivando ticket...", ephemeral: true });
    const canal = interaction.channel;
    
    try {
      await canal.permissionOverwrites.edit(ticketInfo.userId, { ViewChannel: false });
      const memberCreator = await interaction.guild.members.fetch(ticketInfo.userId).catch(() => null);
      const username = memberCreator ? memberCreator.user.username.toLowerCase().replace(/\s+/g, "-") : "usuario";
      const tId = ticketInfo.ticketId || "old000";
      
      await canal.setName(`fechado-${username}-${tId}`);
      await canal.setParent(CATEGORIA_FECHADOS_ID, { lockPermissions: false });
    } catch (e) {
      console.log("Aviso: Permissões insuficientes para renomear/mover o canal.");
    }

    await ticketStore.update(interaction.channelId, (info) => (info ? { ...info, closedAt: Date.now() } : null));

    if (logService) {
      await logService.log(interaction.guild, {
        title: "🔒 Ticket Arquivado", description: `Ticket **${canal.name}** arquivado por **${interaction.user.tag}**.`, color: 0xe67e22,
        fields: [{ name: "👤 Fechou", value: interaction.user.tag, inline: true }, { name: "👥 Criador", value: `<@${ticketInfo.userId}>`, inline: true }]
      });
    }

    const embedArquivado = createEmbed({
      title: "🔒 Ticket Arquivado",
      description: `O membro não possui mais acesso a este canal.\n\nEquipe: Quando não for mais necessário manter o histórico, clique abaixo para excluir definitivamente.`,
      color: 0x95a5a6
    });

    const rowAdmin = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("delete_ticket_btn").setLabel("Deletar Canal").setStyle(ButtonStyle.Danger).setEmoji("🗑️"));
    await canal.send({ embeds: [embedArquivado], components: [rowAdmin] });
  },

  // ==========================================
  // HANDLER GERAL DE COMPONENTES (Botões e Menus)
  // ==========================================
  async handleButton(interaction) {
    const logService = interaction.client.services?.log;
    const ticketConfig = loadTicketCategories();
    if (!ticketConfig) return interaction.reply({ content: "Sistema não configurado.", ephemeral: true });

    // --- LÓGICA DO SETUP ADMINISTRATIVO ---
    if (interaction.customId === "setup_select_cat") {
      const categoryKey = interaction.values[0];
      const catInfo = ticketConfig.categories[categoryKey];

      const setupData = await setupStore.load();
      const currentConfig = (setupData[interaction.guildId] || {})[categoryKey] || {};

      const embedConfig = new EmbedBuilder()
        .setTitle(`🛠️ Configurando: ${catInfo.title}`)
        .setDescription(`Utilize os menus abaixo para definir as regras específicas para **${catInfo.name}**.\n\n` +
          `**Cargo Responsável:** ${currentConfig.roleId ? `<@&${currentConfig.roleId}>` : "`Não definido`"}\n` +
          `**Categoria do Canal:** ${currentConfig.categoryId ? `<#${currentConfig.categoryId}>` : "`Não definido`"}`)
        .setColor("#5865F2");

      const roleSelect = new RoleSelectMenuBuilder().setCustomId(`setup_role_${categoryKey}`).setPlaceholder("Selecione qual cargo será mencionado...");
      const channelSelect = new ChannelSelectMenuBuilder().setCustomId(`setup_channel_${categoryKey}`).setPlaceholder("Selecione a categoria para os tickets...").addChannelTypes(ChannelType.GuildCategory);
      const btnVoltar = new ButtonBuilder().setCustomId("setup_back").setLabel("Voltar ao Menu Principal").setStyle(ButtonStyle.Secondary);

      await interaction.update({ 
        embeds: [embedConfig], 
        components: [
          new ActionRowBuilder().addComponents(roleSelect), 
          new ActionRowBuilder().addComponents(channelSelect),
          new ActionRowBuilder().addComponents(btnVoltar)
        ] 
      });
    }

    if (interaction.customId.startsWith("setup_role_")) {
      const categoryKey = interaction.customId.replace("setup_role_", "");
      const roleId = interaction.values[0];

      await setupStore.update(interaction.guildId, (data) => {
        const guildData = data || {};
        const catData = guildData[categoryKey] || {};
        return { ...guildData, [categoryKey]: { ...catData, roleId } };
      });

      await interaction.reply({ content: `✅ Cargo salvo para **${categoryKey}**! Retorne ao menu para continuar.`, ephemeral: true });
    }

    if (interaction.customId.startsWith("setup_channel_")) {
      const categoryKey = interaction.customId.replace("setup_channel_", "");
      const categoryId = interaction.values[0];

      await setupStore.update(interaction.guildId, (data) => {
        const guildData = data || {};
        const catData = guildData[categoryKey] || {};
        return { ...guildData, [categoryKey]: { ...catData, categoryId } };
      });

      await interaction.reply({ content: `✅ Categoria salva para **${categoryKey}**! Retorne ao menu para continuar.`, ephemeral: true });
    }

    if (interaction.customId === "setup_back") {
      // Reconstrói o menu principal
      const embedSetup = new EmbedBuilder().setTitle("⚙️ Gerenciamento de Tickets WDA").setDescription("Utilize o menu abaixo para configurar qual **Categoria** e qual **Cargo** será acionado para cada tipo de ticket.\n\nQuando terminar, envie o painel.").setColor("#2F3136");
      const selectCategorias = new StringSelectMenuBuilder().setCustomId("setup_select_cat").setPlaceholder("Escolha o tipo de ticket para configurar...").addOptions(Object.entries(ticketConfig.categories).map(([key, cat]) => new StringSelectMenuOptionBuilder().setLabel(`Configurar: ${cat.title.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').trim()}`).setValue(key).setEmoji(CATEGORY_ICONS[key] || "🎫")));
      const btnEnviar = new ButtonBuilder().setCustomId("setup_send_panel").setLabel("Enviar Painel Oficial Aqui").setStyle(ButtonStyle.Success).setEmoji("✅");
      await interaction.update({ embeds: [embedSetup], components: [new ActionRowBuilder().addComponents(selectCategorias), new ActionRowBuilder().addComponents(btnEnviar)] });
    }

    // --- ENVIA O PAINEL DE USUÁRIO OFICIAL ---
    if (interaction.customId === "setup_send_panel") {
      const mainEmbed = new EmbedBuilder()
        .setTitle("Central de Atendimento WDA")
        .setDescription("Olá, seja muito bem-vindo(a) à nossa central de suporte!\n\nPara garantir um atendimento rápido e eficaz, clique no botão abaixo e selecione o departamento que melhor atende à sua necessidade.\n\n⚠️ **Importante:**\n• Tenha sempre provas em mãos caso vá realizar uma denúncia.\n• Não abra tickets sem necessidade ou por brincadeira.\n• Aguarde com paciência, nossa equipe será notificada e chegará em breve.")
        .setColor("#1a1a1a")
        .setImage("https://i.imgur.com/YOUR_BANNER_HERE.png"); // Troque pelo banner que quiser!

      const btnOpen = new ButtonBuilder()
        .setCustomId("user_open_menu")
        .setLabel("Abrir Ticket")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📩");

      await interaction.channel.send({ embeds: [mainEmbed], components: [new ActionRowBuilder().addComponents(btnOpen)] });
      await interaction.update({ content: "✅ Painel enviado com sucesso! Pode dispensar esta mensagem.", embeds: [], components: [] });
    }

    // --- FLUXO DO USUÁRIO ---
    if (interaction.customId === "user_open_menu") {
      const menuEmbed = new EmbedBuilder()
        .setTitle("Selecione o Departamento")
        .setDescription("Escolha a categoria correta para o seu atendimento:")
        .setColor("#2F3136");

      // Cria as opções pegando do JSON, mas injetando descrições amigáveis e os ícones
      const descricoesAmigaveis = {
        suporte: "Tire suas dúvidas ou peça ajuda",
        denuncia: "Reporte infrações e abusos de poder",
        parceria: "Solicite a união de servidores",
        sugestao: "Envie ideias de melhoria para o servidor",
        vip: "Apoie o servidor e receba vantagens"
      };

      const selectType = new StringSelectMenuBuilder()
        .setCustomId("user_select_ticket_type")
        .setPlaceholder("Qual é o assunto do ticket?")
        .addOptions(
          Object.entries(ticketConfig.categories).map(([key, cat]) => 
            new StringSelectMenuOptionBuilder()
              .setLabel(cat.title.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').trim())
              .setDescription(descricoesAmigaveis[key] || "Abrir ticket nesta categoria")
              .setValue(key)
              .setEmoji(CATEGORY_ICONS[key] || "🎫")
          )
        );

      await interaction.reply({ embeds: [menuEmbed], components: [new ActionRowBuilder().addComponents(selectType)], ephemeral: true });
    }

    if (interaction.customId === "user_select_ticket_type") {
      const ticketType = interaction.values[0];
      const categoryConfig = ticketConfig.categories[ticketType];

      // Busca as configurações feitas pelo Administrador no /setup
      const setupData = await setupStore.load();
      const typeSetup = (setupData[interaction.guildId] || {})[ticketType] || {};
      
      const parentCategoryId = typeSetup.categoryId;
      const mentionRoleId = typeSetup.roleId;

      if (!parentCategoryId) return interaction.reply({ content: "❌ O Administrador ainda não configurou uma categoria para este tipo de ticket.", ephemeral: true });

      const tickets = await ticketStore.load();
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
            await ticketStore.update(id, (ghostInfo) => ghostInfo ? { ...ghostInfo, closedAt: Date.now() } : null);
          }
        }
      }

      if (existingTicket) return interaction.reply({ content: `❌ Você já tem um ticket aberto em <#${existingTicket[1].channelId}>.`, ephemeral: true });

      // Criar canal
      const ticketId = await getNextTicketId(ticketType);
      const cleanUsername = interaction.user.username.toLowerCase().replace(/\s+/g, "-");
      const ticketName = `${categoryConfig.prefix}-${cleanUsername}`;

      const channel = await interaction.guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: parentCategoryId,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
          { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
        ]
      });

      // Permissões Fixas da Cúpula/Gerência
      for (const roleId of CARGOS_STAFF_WDA) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role) await channel.permissionOverwrites.create(role, { ViewChannel: true, SendMessages: true, AttachFiles: true });
      }

      // Permissão para o Cargo Específico configurado no Painel Admin!
      if (mentionRoleId) {
        const specificRole = interaction.guild.roles.cache.get(mentionRoleId);
        if (specificRole) await channel.permissionOverwrites.create(specificRole, { ViewChannel: true, SendMessages: true, AttachFiles: true });
      }

      await ticketStore.update(channel.id, () => ({
        userId: interaction.user.id, channelName: channel.name, channelId: channel.id,
        ticketType: ticketType, ticketId: ticketId, openedAt: Date.now(), closedAt: null
      }));

      const embedTicket = createEmbed({
        title: `Atendimento: ${categoryConfig.title.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').trim()}`,
        description: `Olá ${interaction.user}, sua sala foi criada com sucesso!\n\nPor favor, envie sua dúvida ou prova abaixo. Nossa equipe já foi notificada.\n\n🏷️ **Protocolo:** \`${ticketId}\``,
        color: categoryConfig.color || 0x2ecc71
      });

      const rowActions = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("assumir_ticket_btn").setLabel("Assumir").setStyle(ButtonStyle.Success).setEmoji("🙋"),
        new ButtonBuilder().setCustomId("close_ticket_btn").setLabel("Fechar").setStyle(ButtonStyle.Danger).setEmoji("🔒")
      );

      // Marca o cargo específico se ele existir, se não, não marca ninguém extra
      const msgContent = mentionRoleId ? `${interaction.user} | <@&${mentionRoleId}>` : `${interaction.user}`;
      await channel.send({ content: msgContent, embeds: [embedTicket], components: [rowActions] });
      
      // Resposta no menu para o usuário sumir
      await interaction.update({ content: `✅ Ticket criado com sucesso: ${channel}`, embeds: [], components: [] });
    }

    // --- GERENCIAMENTO DO TICKET ABERTO ---
    if (interaction.customId === "assumir_ticket_btn") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      
      // Verifica se é staff global OU se tem o cargo específico daquele ticket
      const tickets = await ticketStore.load();
      const ticketInfo = tickets[interaction.channelId] || (tickets["global"] && tickets["global"][interaction.channelId]);
      
      let isSpecificStaff = false;
      if (ticketInfo) {
        const setupData = await setupStore.load();
        const typeSetup = (setupData[interaction.guildId] || {})[ticketInfo.ticketType] || {};
        if (typeSetup.roleId && member.roles.cache.has(typeSetup.roleId)) isSpecificStaff = true;
      }

      if (!isStaff(member) && !isSpecificStaff) {
        return interaction.reply({ embeds: [createErrorEmbed("Apenas responsáveis por esta área podem assumir o ticket.")], ephemeral: true });
      }

      const rowOnlyClose = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("close_ticket_btn").setLabel("Fechar Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒"));
      await interaction.message.edit({ components: [rowOnlyClose] });

      const embedAssumir = createEmbed({ title: "🫂 Atendimento Iniciado", description: `Olá! O staff **${interaction.user.username}** assumiu este ticket e irá te ajudar a partir de agora.`, color: 0xf1c40f });
      await interaction.reply({ embeds: [embedAssumir] });
    }

    if (interaction.customId === "close_ticket_btn") {
      await module.exports.archiveTicket(interaction, ticketStore, logService);
    }

    if (interaction.customId === "delete_ticket_btn") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!isStaff(member)) return interaction.reply({ embeds: [createErrorEmbed("Apenas a Liderança pode deletar o histórico de tickets.")], ephemeral: true });
      await interaction.reply({ content: "💥 O canal será destruído em 5 segundos...", ephemeral: false });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
  }
};