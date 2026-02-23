const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configurações gerais do servidor (Logs, Welcome, Ticket)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("logs")
        .setDescription("Define o canal de logs")
        .addChannelOption((opt) => opt.setName("canal").setDescription("Canal para enviar logs").addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("welcome")
        .setDescription("Configura mensagens de boas-vindas")
        .addChannelOption((opt) => opt.setName("canal").setDescription("Canal de boas-vindas").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption((opt) => opt.setName("mensagem").setDescription("Mensagem (use {user} para mencionar)").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("ticket_category")
        .setDescription("Define a categoria onde os tickets serão criados")
        .addChannelOption((opt) => opt.setName("categoria").setDescription("Categoria dos tickets").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "logs") {
        const channel = interaction.options.getChannel("canal");
        await setGuildConfig(guildId, { logsChannelId: channel.id });
        await interaction.reply({ embeds: [createSuccessEmbed(`Canal de logs definido para ${channel}`)] });
    }

    if (sub === "welcome") {
        const channel = interaction.options.getChannel("canal");
        const message = interaction.options.getString("mensagem") || "Bem-vindo ao servidor, {user}!";
        
        await setGuildConfig(guildId, { 
            welcomeChannelId: channel.id,
            welcomeMessage: message
        });
        
        await interaction.reply({ embeds: [createSuccessEmbed(`Boas-vindas configuradas em ${channel}.\nMensagem: "${message}"`)] });
    }

    if (sub === "ticket_category") {
        const category = interaction.options.getChannel("categoria");
        await setGuildConfig(guildId, { ticketCategoryId: category.id });
        await interaction.reply({ embeds: [createSuccessEmbed(`Tickets serão criados na categoria **${category.name}**`)] });
    }
  }
};
