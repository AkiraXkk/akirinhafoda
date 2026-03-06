const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configurações do servidor")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("ticket_category")
        .setDescription("Define a categoria para tickets")
        .addChannelOption((opt) =>
          opt
            .setName("categoria")
            .setDescription("Categoria onde os tickets serão criados")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("log_channel")
        .setDescription("Define o canal de logs")
        .addChannelOption((opt) =>
          opt
            .setName("canal")
            .setDescription("Canal onde os logs serão enviados")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("staff_role")
        .setDescription("Define o cargo de staff")
        .addRoleOption((opt) =>
          opt
            .setName("cargo")
            .setDescription("Cargo que terá acesso aos tickets")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("partnership_mentions")
        .setDescription("Configura os cargos de menção de parcerias")
        .addRoleOption((opt) =>
          opt
            .setName("parcerias")
            .setDescription("Cargo para menção de parcerias")
            .setRequired(false)
        )
        .addRoleOption((opt) =>
          opt
            .setName("atualizacoes")
            .setDescription("Cargo para menção de atualizações")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("Mostra as configurações atuais")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "ticket_category") {
      const category = interaction.options.getChannel("categoria");
      
      await setGuildConfig(guildId, {
        ticketCategoryId: category.id
      });

      return interaction.reply({
        embeds: [createSuccessEmbed(
          `✅ Categoria de tickets definida para **${category.name}**!\n\n` +
          `Agora use \`/ticket setup\` para enviar o painel de tickets.`
        )],
        ephemeral: true
      });
    }

    if (sub === "log_channel") {
      const channel = interaction.options.getChannel("canal");
      
      await setGuildConfig(guildId, {
        logChannelId: channel.id
      });

      return interaction.reply({
        embeds: [createSuccessEmbed(
          `✅ Canal de logs definido para **${channel.name}**!\n\n` +
          `Os logs do sistema serão enviados para este canal.`
        )],
        ephemeral: true
      });
    }

    if (sub === "staff_role") {
      const role = interaction.options.getRole("cargo");
      
      await setGuildConfig(guildId, {
        staffRoleId: role.id
      });

      return interaction.reply({
        embeds: [createSuccessEmbed(
          `✅ Cargo de staff definido para **${role.name}**!\n\n` +
          `Membros com este cargo terão acesso administrativo.`
        )],
        ephemeral: true
      });
    }

    if (sub === "partnership_mentions") {
      const parceriasRole = interaction.options.getRole("parcerias");
      const atualizacoesRole = interaction.options.getRole("atualizacoes");
      
      const currentConfig = await getGuildConfig(guildId);
      const partnershipConfig = currentConfig?.partnership || {};
      
      await setGuildConfig(guildId, {
        partnership: {
          ...partnershipConfig,
          mentionRoles: {
            parcerias: parceriasRole?.id || null,
            atualizacoes: atualizacoesRole?.id || null
          }
        }
      });

      const embed = createSuccessEmbed(
        `⚙️ **Cargos de Menção Configurados!**\n\n` +
        `**@parcerias:** ${parceriasRole ? `<@&${parceriasRole.id}>` : "❌ Não configurado"}\n` +
        `**@atualizacoes:** ${atualizacoesRole ? `<@&${atualizacoesRole.id}>` : "❌ Não configurado"}\n\n` +
        `Esses cargos agora estarão disponíveis para menção no sistema de parcerias!`
      );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "view") {
      const config = await getGuildConfig(guildId);
      
      const fields = [];
      
      if (config.ticketCategoryId) {
        const category = interaction.guild.channels.cache.get(config.ticketCategoryId);
        fields.push({
          name: "🎫 Categoria de Tickets",
          value: category ? category.name : "Não encontrada",
          inline: true
        });
      } else {
        fields.push({
          name: "🎫 Categoria de Tickets",
          value: "❌ Não configurada",
          inline: true
        });
      }

      if (config.logChannelId) {
        const channel = interaction.guild.channels.cache.get(config.logChannelId);
        fields.push({
          name: "📋 Canal de Logs",
          value: channel ? channel.name : "Não encontrado",
          inline: true
        });
      } else {
        fields.push({
          name: "📋 Canal de Logs",
          value: "❌ Não configurado",
          inline: true
        });
      }

      if (config.staffRoleId) {
        const role = interaction.guild.roles.cache.get(config.staffRoleId);
        fields.push({
          name: "👨‍💼 Cargo de Staff",
          value: role ? role.name : "Não encontrado",
          inline: true
        });
      } else {
        fields.push({
          name: "👨‍💼 Cargo de Staff",
          value: "❌ Não configurado",
          inline: true
        });
      }

      // Configurações de welcome
      if (config.welcomeChannelId) {
        const channel = interaction.guild.channels.cache.get(config.welcomeChannelId);
        fields.push({
          name: "👋 Canal de Boas-vindas",
          value: channel ? channel.name : "Não encontrado",
          inline: true
        });
      }

      if (config.welcomeMessage) {
        fields.push({
          name: "📝 Mensagem de Boas-vindas",
          value: config.welcomeMessage.substring(0, 100) + (config.welcomeMessage.length > 100 ? "..." : ""),
          inline: false
        });
      }

      return interaction.reply({
        embeds: [createEmbed({
          title: "⚙️ Configurações do Servidor",
          description: "Configurações atuais do sistema WDA:",
          fields,
          color: 0x3498db,
          footer: { text: "WDA - Todos os direitos reservados" }
        })],
        ephemeral: true
      });
    }
  }
};
