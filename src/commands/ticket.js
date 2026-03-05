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
              { name: "Sugestão", value: "sugestao" }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("close")
        .setDescription("Fecha o ticket atual (apenas em canais de ticket)")
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Lista todos os tickets abertos")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const logService = interaction.client.services.log;
    const ticketConfig = loadTicketCategories();

    if (!ticketConfig) {
      return interaction.reply({ 
        embeds: [createErrorEmbed("Configuração de tickets não encontrada.")], 
        ephemeral: true 
      });
    }

    if (sub === "setup") {
      const tipo = interaction.options.getString("tipo");
      const categoryConfig = ticketConfig.categories[tipo];
      
      if (!categoryConfig) {
        return interaction.reply({ 
          embeds: [createErrorEmbed("Tipo de ticket inválido.")], 
          ephemeral: true 
        });
      }

      const guildConfig = await getGuildConfig(interaction.guildId);
      const categoryId = guildConfig.ticketCategoryId;
      
      if (!categoryId) {
        return interaction.reply({ 
          embeds: [createErrorEmbed("Configure a categoria dos tickets primeiro usando `/config ticket_category`.")], 
          ephemeral: true 
        });
      }

      const embed = createEmbed({
        title: categoryConfig.title,
        description: categoryConfig.description,
        color: categoryConfig.color,
        footer: categoryConfig.footer
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`open_ticket_${tipo}`)
          .setLabel(categoryConfig.buttonLabel)
          .setStyle(ButtonStyle.Primary)
          .setEmoji(categoryConfig.buttonEmoji)
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: "Painel de tickets enviado!", ephemeral: true });
    }

    if (sub === "close") {
      const tickets = await ticketStore.load();
      const ticketInfo = tickets[interaction.channelId];
      
      if (!ticketInfo) {
        return interaction.reply({ 
          embeds: [createErrorEmbed("Este comando só pode ser usado em canais de ticket.")], 
          ephemeral: true 
        });
      }

      if (logService) {
        await logService.log(interaction.guild, {
          title: "🔒 Ticket Fechado",
          description: `Ticket **${interaction.channel.name}** foi fechado por **${interaction.user.tag}**.`,
          color: 0xe67e22,
          fields: [
            { name: "👤 Fechado por", value: interaction.user.tag, inline: true },
            { name: "📅 Aberto em", value: `<t:${Math.floor(ticketInfo.openedAt / 1000)}>` , inline: true },
            { name: "👥 Criador", value: `<@${ticketInfo.userId}>`, inline: true }
          ],
          user: interaction.user
        });
      }

      delete tickets[interaction.channelId];
      await ticketStore.save(tickets);

      await interaction.reply({ 
        embeds: [createEmbed({ description: "🔒 Ticket será fechado em 5 segundos...", color: 0xF1C40F, footer: { text: "WDA - Todos os direitos reservados" } })] 
      });
      
      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 5000);
    }

    if (sub === "list") {
      const tickets = await ticketStore.load();
      const openTickets = Object.entries(tickets)
        .filter(([id, info]) => !info.closedAt)
        .sort((a, b) => b[1].openedAt - a[1].openedAt);

      if (openTickets.length === 0) {
        return interaction.reply({
          embeds: [createEmbed({
            title: "📋 Tickets Abertos",
            description: "Não há tickets abertos no momento.",
            color: 0x3498db,
            footer: { text: "WDA - Todos os direitos reservados" }
          })],
          ephemeral: true
        });
      }

      const fields = openTickets.slice(0, 10).map(([channelId, info]) => ({
        name: `🎫 ${info.channelName}`,
        value: `Criado por <@${info.userId}>\nAberto em <t:${Math.floor(info.openedAt / 1000)}>` ,
        inline: false
      }));

      await interaction.reply({
        embeds: [createEmbed({
          title: "📋 Tickets Abertos",
          description: `Mostrando ${Math.min(openTickets.length, 10)} tickets mais recentes.`,
          fields,
          color: 0x3498db,
          footer: { text: "WDA - Todos os direitos reservados" }
        })],
        ephemeral: true
      });
    }
  },

  async handleButton(interaction) {
    const logService = interaction.client.services.log;
    const ticketConfig = loadTicketCategories();

    if (!ticketConfig) {
      return interaction.reply({ 
        content: "Sistema de tickets não configurado.", 
        ephemeral: true 
      });
    }

    // Handler para abrir ticket
    if (interaction.customId.startsWith("open_ticket_")) {
      const ticketType = interaction.customId.replace("open_ticket_", "");
      const categoryConfig = ticketConfig.categories[ticketType];
      
      if (!categoryConfig) {
        return interaction.reply({ 
          content: "Tipo de ticket inválido.", 
          ephemeral: true 
        });
      }

      const guildConfig = await getGuildConfig(interaction.guildId);
      const categoryId = guildConfig.ticketCategoryId;
      
      if (!categoryId) {
        return interaction.reply({ 
          content: "O sistema de tickets não está configurado (falta categoria). Peça a um admin para usar `/config ticket_category`.", 
          ephemeral: true 
        });
      }

      // Verifica se já tem ticket aberto
      const tickets = await ticketStore.load();
      const existingTicket = Object.entries(tickets).find(([id, info]) => 
        info.userId === interaction.user.id && !info.closedAt
      );
      
      if (existingTicket) {
        return interaction.reply({ 
          content: `Você já tem um ticket aberto: <#${existingTicket[0]}>`, 
          ephemeral: true 
        });
      }

      // Gera nome personalizado
      const ticketName = await generateTicketName(interaction.guild, categoryConfig.prefix, interaction.user.username);

      // Cria o canal
      const channel = await interaction.guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
          { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
        ]
      });

      // Adiciona permissões para staff
      ticketConfig.staffRoles.allowed.forEach(roleId => {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role) {
          channel.permissionOverwrites.create(role, {
            ViewChannel: true,
            SendMessages: true,
            AttachFiles: true
          });
        }
      });

      // Salva no banco de dados
      tickets[channel.id] = {
        userId: interaction.user.id,
        channelName: channel.name,
        channelId: channel.id,
        ticketType: ticketType,
        openedAt: Date.now(),
        closedAt: null
      };
      await ticketStore.save(tickets);

      // Log da criação
      if (logService) {
        await logService.log(interaction.guild, {
          title: "🎫 Ticket Criado",
          description: `**${interaction.user.tag}** abriu um novo ticket do tipo **${ticketType}**.`,
          color: 0x2ecc71,
          fields: [
            { name: "👤 Usuário", value: interaction.user.tag, inline: true },
            { name: "📋 Canal", value: channel.toString(), inline: true },
            { name: "📅 Criado em", value: `<t:${Math.floor(Date.now() / 1000)}>` , inline: true }
          ],
          user: interaction.user
        });
      }

      // Notificação para staff
      if (ticketConfig.settings.enableNotifications && ticketConfig.settings.enableMentions) {
        const staffMentions = ticketConfig.staffRoles.priority.map(roleId => `<@&${roleId}>`).join(" ");
        
        const notificationEmbed = createEmbed({
          title: categoryConfig.notificationMessage,
          description: `**${interaction.user.tag}** abriu um ticket e precisa de atendimento.\n\nCanal: ${channel}`,
          color: categoryConfig.color,
          footer: { text: "WDA - Todos os direitos reservados" }
        });

        const logChannel = interaction.guild.channels.cache.get(guildConfig.logChannelId);
        if (logChannel) {
          await logChannel.send({ 
            content: staffMentions, 
            embeds: [notificationEmbed] 
          });
        }
      }

      const embed = createEmbed({
        title: `Ticket de ${interaction.user.tag}`,
        description: "Descreva seu problema aqui. A equipe de suporte chegará em breve.",
        color: 0x2ecc71,
        footer: "Use /ticket close para fechar • WDA - Todos os direitos reservados"
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close_ticket_btn")
          .setLabel("Fechar Ticket")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🔒")
      );

      await channel.send({ content: `${interaction.user}`, embeds: [embed], components: [row] });
      await interaction.reply({ content: `Ticket criado: ${channel}`, ephemeral: true });
    }

    // Handler para fechar ticket
    if (interaction.customId === "close_ticket_btn") {
      const tickets = await ticketStore.load();
      const ticketInfo = tickets[interaction.channelId];
      
      if (!ticketInfo) {
        return interaction.reply({ 
          embeds: [createErrorEmbed("Este não é um ticket válido.")], 
          ephemeral: true 
        });
      }

      // Verificação de staff
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!isStaff(member, ticketConfig.staffRoles) && ticketInfo.userId !== interaction.user.id) {
        return interaction.reply({ 
          embeds: [createErrorEmbed("Apenas staff ou o criador do ticket pode fechá-lo.")], 
          ephemeral: true 
        });
      }

      // Log do fechamento
      if (logService) {
        await logService.log(interaction.guild, {
          title: "🔒 Ticket Fechado",
          description: `Ticket **${interaction.channel.name}** foi fechado por **${interaction.user.tag}**.`,
          color: 0xe67e22,
          fields: [
            { name: "👤 Fechado por", value: interaction.user.tag, inline: true },
            { name: "📅 Aberto em", value: `<t:${Math.floor(ticketInfo.openedAt / 1000)}>` , inline: true },
            { name: "👥 Criador", value: `<@${ticketInfo.userId}>`, inline: true }
          ],
          user: interaction.user
        });
      }

      delete tickets[interaction.channelId];
      await ticketStore.save(tickets);

      await interaction.reply({ 
        embeds: [createEmbed({ description: "🔒 Ticket será fechado em 5 segundos...", color: 0xF1C40F, footer: { text: "WDA - Todos os direitos reservados" } })] 
      });
      
      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 5000);
    }
  }
};
