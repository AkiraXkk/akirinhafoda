const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");
const fs = require("fs");
const path = require("path");

const { createDataStore } = require("../store/dataStore");

const ticketStore = createDataStore("tickets.json");

// Carregar configurações de categorias
function loadTicketCategories() {
  try {
    const configPath = path.join(__dirname, "../data/ticketCategories.json");
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    console.error("Erro ao carregar ticketCategories.json:", error);
    return null;
  }
}

// Gerar nome de ticket com contador
async function generateTicketName(guild, categoryPrefix, username) {
  const categoryChannels = guild.channels.cache.filter(c => 
    c.name.startsWith(categoryPrefix) && c.type === ChannelType.GuildText
  );

  const count = categoryChannels.size + 1;
  const paddedCount = String(count).padStart(3, "0");
  const cleanUsername = username.toLowerCase().replace(/\s+/g, "-");

  return `${categoryPrefix}-${cleanUsername}-${paddedCount}`;
}

// Verificar se usuário tem permissão de staff
function isStaff(member, staffRoles) {
  if (!staffRoles || !staffRoles.allowed) return false;
  return staffRoles.allowed.some(roleId => member.roles.cache.has(roleId));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Sistema de Tickets")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Envia o painel de tickets para o canal atual")
        .addStringOption((opt) =>
          opt
            .setName("tipo")
            .setDescription("Tipo de painel")
            .setRequired(true)
            .addChoices(
              { name: "Suporte", value: "suporte" },
              { name: "Parceria", value: "parceria" },
              { name: "Denúncia", value: "denuncia" },
              { name: "Sugestão", value: "sugestao" },
              { name: "👑 Seja VIP", value: "vip" }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("close")
        .setDescription("Fecha (arquiva) o ticket atual")
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Lista todos os tickets abertos")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const logService = interaction.client.services?.log;
    const ticketConfig = loadTicketCategories();

    if (!ticketConfig) {
      return interaction.reply({ 
        embeds: [createErrorEmbed("Configuração de tickets não encontrada.")], 
        ephemeral: true 
      });
    }

    // ==========================================
    // SETUP
    // ==========================================
    if (sub === "setup") {
      const tipo = interaction.options.getString("tipo");
      const categoryConfig = ticketConfig.categories[tipo];

      if (!categoryConfig) return interaction.reply({ embeds: [createErrorEmbed("Tipo de ticket inválido.")], ephemeral: true });

      const guildConfig = await getGuildConfig(interaction.guildId);
      if (!guildConfig.ticketCategoryId) return interaction.reply({ embeds: [createErrorEmbed("Configure a categoria de tickets primeiro.")], ephemeral: true });

      const embed = createEmbed({
        title: categoryConfig.title,
        description: categoryConfig.description,
        color: categoryConfig.color,
        footer: { text: categoryConfig.footer || "WDA - Todos os direitos reservados" }
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`open_ticket_${tipo}`).setLabel(categoryConfig.buttonLabel).setStyle(categoryConfig.buttonStyle || ButtonStyle.Primary).setEmoji(categoryConfig.buttonEmoji || "🎫")
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: "Painel de tickets enviado com sucesso!", ephemeral: true });
    }

    // ==========================================
    // LISTAR ABERTOS
    // ==========================================
    if (sub === "list") {
      const tickets = await ticketStore.load();
      const allTickets = tickets["global"] || tickets; 

      const openTickets = Object.entries(allTickets)
        .filter(([id, info]) => info && !info.closedAt && info.openedAt)
        .sort((a, b) => b[1].openedAt - a[1].openedAt);

      if (openTickets.length === 0) {
        return interaction.reply({ embeds: [createEmbed({ title: "📋 Tickets Abertos", description: "Não há tickets abertos no momento.", color: 0x3498db })], ephemeral: true });
      }

      const fields = openTickets.slice(0, 10).map(([channelId, info]) => ({
        name: `🎫 ${info.channelName}`,
        value: `Criado por <@${info.userId}>\nAberto em <t:${Math.floor(info.openedAt / 1000)}>` ,
        inline: false
      }));

      await interaction.reply({ embeds: [createEmbed({ title: "📋 Tickets Abertos", description: `Mostrando ${Math.min(openTickets.length, 10)} tickets mais recentes.`, fields, color: 0x3498db })], ephemeral: true });
    }

    // ==========================================
    // FECHAR TICKET (COMANDO)
    // ==========================================
    if (sub === "close") {
      await module.exports.archiveTicket(interaction, ticketStore, logService, ticketConfig);
    }
  },

  // FUNÇÃO ISOLADA PARA ARQUIVAR O TICKET
  async archiveTicket(interaction, ticketStore, logService, ticketConfig) {
    const tickets = await ticketStore.load();
    const ticketInfo = tickets[interaction.channelId] || (tickets["global"] && tickets["global"][interaction.channelId]);

    if (!ticketInfo) {
      return interaction.reply({ embeds: [createErrorEmbed("Este não é um ticket válido.")], ephemeral: true });
    }

    if (ticketInfo.closedAt) {
      return interaction.reply({ content: "❌ Este ticket já foi arquivado/fechado.", ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isStaff(member, ticketConfig.staffRoles) && ticketInfo.userId !== interaction.user.id) {
      return interaction.reply({ embeds: [createErrorEmbed("Apenas staff ou o criador do ticket pode fechá-lo.")], ephemeral: true });
    }

    await interaction.reply({ content: "🔒 Arquivando ticket e removendo acesso do membro...", ephemeral: true });

    const canal = interaction.channel;
    
    try {
      await canal.permissionOverwrites.edit(ticketInfo.userId, { ViewChannel: false });
      
      const memberCreator = await interaction.guild.members.fetch(ticketInfo.userId).catch(() => null);
      const username = memberCreator ? memberCreator.user.username : "usuario";
      await canal.setName(`fechado-${username}`);

      const guildConfig = await getGuildConfig(interaction.guildId);
      if (guildConfig.closedTicketCategoryId) {
        await canal.setParent(guildConfig.closedTicketCategoryId, { lockPermissions: false });
      }

    } catch (e) {
      console.log("Aviso: Permissões insuficientes para renomear/mover o canal do ticket.");
    }

    await ticketStore.update(interaction.channelId, (info) => {
      if (info) return { ...info, closedAt: Date.now() };
      return null;
    });

    if (logService) {
      await logService.log(interaction.guild, {
        title: "🔒 Ticket Arquivado",
        description: `Ticket **${canal.name}** foi arquivado por **${interaction.user.tag}**.`,
        color: 0xe67e22,
        fields: [
          { name: "👤 Fechado por", value: interaction.user.tag, inline: true },
          { name: "👥 Criador", value: `<@${ticketInfo.userId}>`, inline: true }
        ]
      });
    }

    const embedArquivado = createEmbed({
      title: "🔒 Ticket Arquivado",
      description: `O criador do ticket não possui mais acesso a este canal.\n\nA staff pode ler o histórico acima. Quando não for mais necessário, clique no botão abaixo para excluir o canal permanentemente.`,
      color: 0x95a5a6
    });

    const rowAdmin = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("delete_ticket_btn").setLabel("Deletar Canal").setStyle(ButtonStyle.Danger).setEmoji("🗑️")
    );

    await canal.send({ embeds: [embedArquivado], components: [rowAdmin] });
  },

  // ==========================================
  // HANDLER DE BOTÕES
  // ==========================================
  async handleButton(interaction) {
    const logService = interaction.client.services?.log;
    const ticketConfig = loadTicketCategories();

    if (!ticketConfig) return interaction.reply({ content: "Sistema de tickets não configurado.", ephemeral: true });

    // ABRIR TICKET
    if (interaction.customId.startsWith("open_ticket_")) {
      const ticketType = interaction.customId.replace("open_ticket_", "");
      const categoryConfig = ticketConfig.categories[ticketType];

      if (!categoryConfig) return interaction.reply({ content: "Tipo de ticket inválido.", ephemeral: true });

      const guildConfig = await getGuildConfig(interaction.guildId);
      if (!guildConfig.ticketCategoryId) return interaction.reply({ content: "Falta configurar a categoria de tickets.", ephemeral: true });

      const tickets = await ticketStore.load();
      const allTickets = tickets["global"] || tickets;

      // ==========================================
      // CAÇADOR DE FANTASMAS
      // ==========================================
      let existingTicket = null;
      
      for (const [id, info] of Object.entries(allTickets)) {
        if (info && info.userId === interaction.user.id && !info.closedAt) {
          const canalAindaExiste = interaction.guild.channels.cache.get(info.channelId);
          
          if (canalAindaExiste) {
            existingTicket = [id, info];
            break;
          } else {
            await ticketStore.update(id, (ghostInfo) => {
              if (ghostInfo) return { ...ghostInfo, closedAt: Date.now() };
              return null;
            });
          }
        }
      }

      if (existingTicket) {
        return interaction.reply({ content: `❌ Você já tem um ticket aberto em <#${existingTicket[1].channelId}>. Feche-o para abrir um novo.`, ephemeral: true });
      }

      // CRIAR CANAL NOVO
      const ticketName = await generateTicketName(interaction.guild, categoryConfig.prefix, interaction.user.username);

      const channel = await interaction.guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: guildConfig.ticketCategoryId,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
          { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
        ]
      });

      if (ticketConfig.staffRoles && ticketConfig.staffRoles.allowed) {
          for (const roleId of ticketConfig.staffRoles.allowed) {
            const role = interaction.guild.roles.cache.get(roleId);
            if (role) await channel.permissionOverwrites.create(role, { ViewChannel: true, SendMessages: true, AttachFiles: true });
          }
      }

      await ticketStore.update(channel.id, () => ({
        userId: interaction.user.id,
        channelName: channel.name,
        channelId: channel.id,
        ticketType: ticketType,
        openedAt: Date.now(),
        closedAt: null
      }));

      const embed = createEmbed({
        title: `Atendimento: ${categoryConfig.title}`,
        description: "Descreva sua dúvida ou solicitação. A equipe responsável chegará em breve.",
        color: categoryConfig.color || 0x2ecc71,
        footer: { text: "Use os botões abaixo para gerenciar o atendimento." }
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("assumir_ticket_btn").setLabel("Assumir Ticket").setStyle(ButtonStyle.Success).setEmoji("🙋"),
        new ButtonBuilder().setCustomId("close_ticket_btn").setLabel("Fechar Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒")
      );

      await channel.send({ content: `${interaction.user}`, embeds: [embed], components: [row] });
      await interaction.reply({ content: `✅ Ticket criado com sucesso: ${channel}`, ephemeral: true });
    }

    // ASSUMIR TICKET
    if (interaction.customId === "assumir_ticket_btn") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!isStaff(member, ticketConfig.staffRoles)) return interaction.reply({ embeds: [createErrorEmbed("Apenas membros da staff podem assumir tickets.")], ephemeral: true });

      const rowOnlyClose = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("close_ticket_btn").setLabel("Fechar Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒")
      );
      await interaction.message.edit({ components: [rowOnlyClose] });

      const embedAssumir = createEmbed({ title: "🫂 Atendimento Iniciado", description: `Olá! O staff **${interaction.user.username}** assumiu este ticket e irá te ajudar a partir de agora.`, color: 0xf1c40f });
      await interaction.reply({ embeds: [embedAssumir] });
    }

    // FECHAR TICKET (Arquivar)
    if (interaction.customId === "close_ticket_btn") {
      await module.exports.archiveTicket(interaction, ticketStore, logService, ticketConfig);
    }

    // DELETAR TICKET PERMANENTEMENTE
    if (interaction.customId === "delete_ticket_btn") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      
      if (!isStaff(member, ticketConfig.staffRoles)) {
        return interaction.reply({ embeds: [createErrorEmbed("Apenas membros da staff podem deletar tickets.")], ephemeral: true });
      }

      await interaction.reply({ content: "💥 O canal será destruído em 5 segundos...", ephemeral: false });

      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
  }
};