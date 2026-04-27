const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");

const partnersStore = createDataStore("partners.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verifique e gerencie parcerias")
    .addSubcommand((sub) =>
      sub
        .setName("servidor")
        .setDescription("Verifique se um servidor é parceiro")
        .addStringOption((opt) =>
          opt.setName("id")
            .setDescription("ID do servidor para verificar")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("canal")
        .setDescription("Configure o canal de parcerias")
        .addChannelOption((opt) =>
          opt.setName("canal")
            .setDescription("Canal de parcerias")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("cargo")
        .setDescription("Configure o cargo de parceiros")
        .addRoleOption((opt) =>
          opt.setName("cargo")
            .setDescription("Cargo para parceiros")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("mensagem")
        .setDescription("Configure a mensagem de boas-vindas para parceiros")
        .addStringOption((opt) =>
          opt.setName("mensagem")
            .setDescription("Mensagem para novos parceiros")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("listar")
        .setDescription("Liste todos os servidores parceiros")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "servidor") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem verificar servidores!")],
          flags: MessageFlags.Ephemeral
        });
      }

      const targetGuildId = interaction.options.getString("id");
      const partners = await partnersStore.load();
      
      const partnership = Object.values(partners).find(p => 
        (p.requesterGuild === targetGuildId || p.partnerGuild === targetGuildId) && 
        (p.status === "accepted" || p.status === "ACTIVE")
      );
      
      if (!partnership) {
        return interaction.reply({
          embeds: [createErrorEmbed("Servidor não encontrado ou não é parceiro!")],
          flags: MessageFlags.Ephemeral
        });
      }

      const embed = createSuccessEmbed(
        `✅ **Servidor Verificado!**\n\n` +
        `**Status:** Parceiro Ativo\n` +
        `**Servidor:** ${partnership.serverName}\n` +
        `**Membros:** ${partnership.memberCount}\n` +
        `**Início da parceria:** ${new Date(partnership.acceptedAt).toLocaleDateString('pt-BR')}\n\n` +
        `Este servidor é oficialmente parceiro e tem acesso aos benefícios!`
      );

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === "canal") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem configurar canais!")],
          flags: MessageFlags.Ephemeral
        });
      }

      const channel = interaction.options.getChannel("canal");
      
      const config = await getGuildConfig(guildId);
      config.partnerChannelId = channel.id;
      await setGuildConfig(guildId, config);

      const embed = createSuccessEmbed(
        `📢 **Canal de Parcerias Configurado!**\n\n` +
        `**Canal:** ${channel}\n` +
        `**ID:** ${channel.id}\n\n` +
        `Todas as mensagens de parceria serão enviadas para este canal!`
      );

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === "cargo") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem configurar cargos!")],
          flags: MessageFlags.Ephemeral
        });
      }

      const role = interaction.options.getRole("cargo");
      
      const config = await getGuildConfig(guildId);
      config.partnerRoleId = role.id;
      await setGuildConfig(guildId, config);

      const embed = createSuccessEmbed(
        `🏷️ **Cargo de Parceiros Configurado!**\n\n` +
        `**Cargo:** ${role}\n` +
        `**ID:** ${role.id}\n\n` +
        `Todos os membros de servidores parceiros receberão este cargo!`
      );

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === "mensagem") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem configurar mensagens!")],
          flags: MessageFlags.Ephemeral
        });
      }

      const message = interaction.options.getString("mensagem");
      
      const config = await getGuildConfig(guildId);
      config.partnerWelcomeMessage = message;
      await setGuildConfig(guildId, config);

      const embed = createSuccessEmbed(
        `💬 **Mensagem de Boas-Vindas Configurada!**\n\n` +
        `**Mensagem:** ${message}\n\n` +
        `Esta mensagem será enviada quando novos servidores se tornarem parceiros!`
      );

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === "listar") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem listar parceiros!")],
          flags: MessageFlags.Ephemeral
        });
      }

      const partners = await partnersStore.load();
      const activePartnerships = Object.values(partners).filter(p => p.status === "accepted" || p.status === "ACTIVE");
      
      if (activePartnerships.length === 0) {
        return interaction.reply({
          embeds: [createEmbed({
            title: "🤝 Servidores Parceiros",
            description: "Nenhum servidor parceiro no momento.",
            color: 0x95a5a6,
            footer: { text: "WDA - Todos os direitos reservados" }
          })],
          flags: MessageFlags.Ephemeral
        });
      }

      const embed = createEmbed({
        title: "🤝 Servidores Parceiros",
        description: activePartnerships.map((partner, index) => 
          `**${index + 1}.** ${partner.serverName}\n` +
          `🆔 ID: ${partner.requesterGuild}\n` +
          `👥 Membros: ${partner.memberCount}\n` +
          `📅 Parceria desde: ${new Date(partner.acceptedAt).toLocaleDateString('pt-BR')}\n` +
          `📝 ${partner.description}\n`
        ).join("\n"),
        color: 0x00ff00,
        footer: { text: "WDA - Todos os direitos reservados" }
      });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};
