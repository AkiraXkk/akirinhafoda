const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { getGuildConfig } = require("../config/guildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Sistema de Tickets")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Envia o painel de tickets para o canal atual")
    )
    .addSubcommand((sub) =>
      sub
        .setName("close")
        .setDescription("Fecha o ticket atual (apenas em canais de ticket)")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "setup") {
        const embed = createEmbed({
            title: "🎫 Central de Ajuda",
            description: "Clique no botão abaixo para abrir um ticket de suporte.\nNossa equipe irá atendê-lo em breve.",
            color: 0x3498db, // Blue
            footer: "Suporte VIP e Geral"
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("open_ticket")
                .setLabel("Abrir Ticket")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("📩")
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: "Painel de tickets enviado!", ephemeral: true });
    }

    if (sub === "close") {
        // Verifica se é um canal de ticket (pode verificar nome ou tópico, ou banco de dados)
        // Por simplicidade, verifica se começa com "ticket-"
        if (!interaction.channel.name.startsWith("ticket-")) {
            return interaction.reply({ embeds: [createErrorEmbed("Este comando só pode ser usado em canais de ticket.")], ephemeral: true });
        }

        await interaction.reply({ embeds: [createEmbed({ description: "🔒 Ticket será fechado em 5 segundos...", color: 0xF1C40F })] });
        
        setTimeout(() => {
            interaction.channel.delete().catch(() => {});
        }, 5000);
    }
  },

  // Handler para o botão (chamado no index.js)
  async handleButton(interaction) {
      if (interaction.customId === "open_ticket") {
          const guildConfig = await getGuildConfig(interaction.guildId);
          const categoryId = guildConfig.ticketCategoryId;
          
          if (!categoryId) {
              return interaction.reply({ content: "O sistema de tickets não está configurado (falta categoria). Peça a um admin para usar `/config ticket_category`.", ephemeral: true });
          }

          // Verifica se já tem ticket aberto
          const existing = interaction.guild.channels.cache.find(c => c.name === `ticket-${interaction.user.username.toLowerCase().replace(/\s+/g, '-')}`);
          if (existing) {
              return interaction.reply({ content: `Você já tem um ticket aberto: ${existing}`, ephemeral: true });
          }

          const channel = await interaction.guild.channels.create({
              name: `ticket-${interaction.user.username}`,
              type: ChannelType.GuildText,
              parent: categoryId,
              permissionOverwrites: [
                  { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                  { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                  { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] }
                  // Adicionar permissão para cargo de suporte se tiver
              ]
          });

          const embed = createEmbed({
              title: `Ticket de ${interaction.user.tag}`,
              description: "Descreva seu problema aqui. A equipe de suporte chegará em breve.",
              color: 0x2ecc71, // Green
              footer: "Use /ticket close para fechar"
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

      if (interaction.customId === "close_ticket_btn") {
          await interaction.reply({ embeds: [createEmbed({ description: "🔒 Ticket será fechado em 5 segundos...", color: 0xF1C40F })] });
          setTimeout(() => {
              interaction.channel.delete().catch(() => {});
          }, 5000);
      }
  }
};
