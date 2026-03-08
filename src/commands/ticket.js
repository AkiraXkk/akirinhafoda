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
              { name: "Sugestão", value: "sugestao" },
              { name: "👑 Seja VIP", value: "vip" } // <-- ADICIONADO AQUI
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
    const logService = interaction.client.services?.log;
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
          embeds: [createErrorEmbed("Tipo de ticket inválido ou não configurado no JSON.")], 
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
        footer: { text: categoryConfig.footer || "WDA - Todos os direitos reservados" }
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`open_ticket_${tipo}`)
          .setLabel(categoryConfig.buttonLabel)
          .setStyle(categoryConfig.buttonStyle || ButtonStyle.Primary)
          .setEmoji(categoryConfig.buttonEmoji || "🎫")
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: "Painel de tickets enviado com sucesso!", ephemeral: true });
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
      await ticketStore.update("global", () => tickets); // Adaptação segura para o dataStore

      await interaction.reply({ 
        embeds: [createEmbed({ description: "🔒 Ticket será fechado em 5 segundos...", color: 0xF1C40F, footer: { text: "WDA - Todos os direitos reservados" } })] 
      });

      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 5000);
    }

    if (sub === "list") {
      const tickets = await ticketStore.load();
      // Ajuste para pegar do escopo 'global' se o seu DataStore usar keys
      const allTickets = tickets["global"] || tickets; 
      
      const openTickets = Object.entries(allTickets)
        .filter(([id, info]) => info && !info.closedAt && info.openedAt)
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
    const logService = interaction.client.services?.log;
    const ticketConfig = loadTicketCategories();

    if (!ticketConfig) {
      return interaction.reply({ content: "Sistema de tickets não configurado.", ephemeral: true });
    }

    // Handler para abrir ticket
    if (interaction.customId.startsWith("open_ticket_")) {
      const ticketType = interaction.customId.replace("open_ticket_", "");
      const categoryConfig = ticketConfig.categories[ticketType];

      if (!categoryConfig) {
        return interaction.reply({ content: "Tipo de ticket inválido.", ephemeral: true });
      }

      const guildConfig = await getGuildConfig(interaction.guildId);
      const categoryId = guildConfig.ticketCategoryId;

      if (!categoryId) {
        return interaction.reply({ content: "O sistema de tickets não está configurado (falta categoria).", ephemeral: true });
      }

      const tickets = await ticketStore.load();
      const allTickets = tickets["global"] || tickets;
      
      const existingTicket = Object.entries(allTickets).find(([id, info]) => 
        info && info.userId === interaction.user.id && !info.closedAt
      );

      if (existingTicket) {
        return interaction.reply({ content: `Você já tem um ticket aberto: <#${existingTicket[0]}>`, ephemeral: true });
      }

      const ticketName = await generateTicketName(interaction.guild, categoryConfig.prefix, interaction.user.username);

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

      if (ticketConfig.staffRoles && ticketConfig.staffRoles.allowed) {
          for (const roleId of ticketConfig.staffRoles.allowed) {
            const role = interaction.guild.roles.cache.get(roleId);
            if (role) {
              await channel.permissionOverwrites.create(role, {
                ViewChannel: true,
                SendMessages: true,
                AttachFiles: true
              });
            }
          }
      }

      const ticketData = {
        userId: interaction.user.id,
        channelName: channel.name,
        channelId: channel.id,
        ticketType: ticketType,
        openedAt: Date.now(),
        closedAt: null
      };
      
      await ticketStore.update(channel.id, () => ticketData);

      if (logService) {
        await logService.log(interaction.guild, {
          title: "🎫 Ticket Criado",
          description: `**${interaction.user.tag}** abriu um novo ticket do tipo **${ticketType}**.`,
          color: categoryConfig.color || 0x2ecc71,
          fields: [
            { name: "👤 Usuário", value: interaction.user.tag, inline: true },
            { name: "📋 Canal", value: channel.toString(), inline: true }
          ],
          user: interaction.user
        });
      }

      const embed = createEmbed({
        title: `Atendimento: ${categoryConfig.title}`,
        description: "Descreva sua dúvida ou solicitação. A equipe responsável chegará em breve.",
        color: categoryConfig.color || 0x2ecc71,
        footer: { text: "Use o botão abaixo para encerrar o atendimento." }
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close_ticket_btn")
          .setLabel("Fechar Ticket")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🔒")
      );

      await channel.send({ content: `${interaction.user}`, embeds: [embed], components: [row] });
      await interaction.reply({ content: `Ticket criado com sucesso: ${channel}`, ephemeral: true });
    }

    // Handler para fechar ticket
    if (interaction.customId === "close_ticket_btn") {
      const tickets = await ticketStore.load();
      const ticketInfo = tickets[interaction.channelId] || (tickets["global"] && tickets["global"][interaction.channelId]);

      if (!ticketInfo) {
        return interaction.reply({ embeds: [createErrorEmbed("Este não é um ticket válido.")], ephemeral: true });
      }

      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!isStaff(member, ticketConfig.staffRoles) && ticketInfo.userId !== interaction.user.id) {
        return interaction.reply({ embeds: [createErrorEmbed("Apenas staff ou o criador do ticket pode fechá-lo.")], ephemeral: true });
      }

      await interaction.reply({ 
        embeds: [createEmbed({ description: "🔒 Ticket será fechado em 5 segundos...", color: 0xF1C40F })] 
      });

      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
  }
};
