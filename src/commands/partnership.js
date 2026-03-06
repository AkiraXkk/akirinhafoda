const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");

const partnersStore = createDataStore("partners.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("partnership")
    .setDescription("Sistema de parcerias entre servidores")
    .addSubcommand((sub) =>
      sub
        .setName("solicitar")
        .setDescription("Solicite uma parceria com nosso servidor")
        .addStringOption((opt) =>
          opt.setName("servidor")
            .setDescription("Nome do seu servidor")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("convite")
            .setDescription("Link de convite do seu servidor")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("descricao")
            .setDescription("Descrição do seu servidor")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName("membros")
            .setDescription("Número de membros do seu servidor")
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Verifique o status da sua parceria")
    )
    .addSubcommand((sub) =>
      sub
        .setName("aceitar")
        .setDescription("Aceite uma solicitação de parceria")
        .addStringOption((opt) =>
          opt.setName("servidor")
            .setDescription("ID do servidor para aceitar")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("canal")
            .setDescription("ID do canal de parceria")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("recusar")
        .setDescription("Recuse uma solicitação de parceria")
        .addStringOption((opt) =>
          opt.setName("servidor")
            .setDescription("ID do servidor para recusar")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remover")
        .setDescription("Remova uma parceria existente")
        .addStringOption((opt) =>
          opt.setName("servidor")
            .setDescription("ID do servidor para remover")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("listar")
        .setDescription("Liste todas as parcerias ativas")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (sub === "solicitar") {
      const serverName = interaction.options.getString("servidor");
      const inviteLink = interaction.options.getString("convite");
      const description = interaction.options.getString("descricao");
      const memberCount = interaction.options.getInteger("membros");

      // Validar link de convite
      if (!inviteLink.includes("discord.gg") && !inviteLink.includes("discord.com/invite")) {
        return interaction.reply({
          embeds: [createErrorEmbed("Link de convite inválido! Use um link do Discord.")],
          ephemeral: true
        });
      }

      // Verificar se já existe solicitação
      const partners = await partnersStore.load();
      const existingRequest = Object.values(partners).find(p => p.requesterId === userId);
      
      if (existingRequest) {
        return interaction.reply({
          embeds: [createErrorEmbed("Você já tem uma solicitação de parceria pendente!")],
          ephemeral: true
        });
      }

      // Criar solicitação
      const requestId = `${guildId}_${Date.now()}`;
      await partnersStore.update(requestId, (current) => ({
        requesterId: userId,
        requesterGuild: guildId,
        serverName,
        inviteLink,
        description,
        memberCount,
        status: "pending",
        requestedAt: new Date().toISOString()
      }));

      const embed = createSuccessEmbed(
        `🤝 **Solicitação de Parceria Enviada!**\n\n` +
        `**Servidor:** ${serverName}\n` +
        `**Membros:** ${memberCount}\n` +
        `**Descrição:** ${description}\n\n` +
        `Sua solicitação será analisada e você receberá uma resposta em breve!`
      );

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "status") {
      const partners = await partnersStore.load();
      const userRequest = Object.values(partners).find(p => p.requesterId === userId);
      
      if (!userRequest) {
        return interaction.reply({
          embeds: [createErrorEmbed("Você não tem solicitações de parceria.")],
          ephemeral: true
        });
      }

      const statusColors = {
        pending: 0xffff00,
        accepted: 0x00ff00,
        rejected: 0xff0000,
        removed: 0xff6600
      };

      const statusTexts = {
        pending: "⏳ Aguardando análise",
        accepted: "✅ Aceita",
        rejected: "❌ Recusada",
        removed: "🚫 Removida"
      };

      const embed = createEmbed({
        title: "📊 Status da Parceria",
        description: `**Status:** ${statusTexts[userRequest.status]}\n\n` +
        `**Servidor:** ${userRequest.serverName}\n` +
        `**Membros:** ${userRequest.memberCount}\n` +
        `**Solicitado em:** ${new Date(userRequest.requestedAt).toLocaleDateString('pt-BR')}`,
        color: statusColors[userRequest.status],
        footer: { text: "WDA - Todos os direitos reservados" }
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "aceitar") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem aceitar parcerias!")],
          ephemeral: true
        });
      }

      const targetGuildId = interaction.options.getString("servidor");
      const channelId = interaction.options.getString("canal");
      const partners = await partnersStore.load();
      
      const partnership = Object.values(partners).find(p => p.requesterGuild === targetGuildId && p.status === "pending");
      
      if (!partnership) {
        return interaction.reply({
          embeds: [createErrorEmbed("Solicitação de parceria não encontrada!")],
          ephemeral: true
        });
      }

      // Atualizar status
      const requestId = Object.keys(partners).find(key => partners[key].requesterGuild === targetGuildId);
      await partnersStore.update(requestId, {
        ...partners[requestId],
        status: "accepted",
        acceptedAt: new Date().toISOString(),
        acceptedBy: userId,
        partnerChannelId: channelId
      });

      // Enviar confirmação
      const embed = createSuccessEmbed(
        `✅ **Parceria Aceita!**\n\n` +
        `**Servidor:** ${partnership.serverName}\n` +
        `**Aceita por:** ${interaction.user.username}\n\n` +
        `O canal de parceria foi configurado e a parceria está ativa!`
      );

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "recusar") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem recusar parcerias!")],
          ephemeral: true
        });
      }

      const targetGuildId = interaction.options.getString("servidor");
      const partners = await partnersStore.load();
      
      const partnership = Object.values(partners).find(p => p.requesterGuild === targetGuildId && p.status === "pending");
      
      if (!partnership) {
        return interaction.reply({
          embeds: [createErrorEmbed("Solicitação de parceria não encontrada!")],
          ephemeral: true
        });
      }

      // Atualizar status
      const requestId = Object.keys(partners).find(key => partners[key].requesterGuild === targetGuildId);
      await partnersStore.update(requestId, {
        ...partners[requestId],
        status: "rejected",
        rejectedAt: new Date().toISOString(),
        rejectedBy: userId
      });

      const embed = createSuccessEmbed(
        `❌ **Parceria Recusada!**\n\n` +
        `**Servidor:** ${partnership.serverName}\n` +
        `**Recusada por:** ${interaction.user.username}\n\n` +
        `A solicitação foi recusada e o servidor foi notificado.`
      );

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "remover") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem remover parcerias!")],
          ephemeral: true
        });
      }

      const targetGuildId = interaction.options.getString("servidor");
      const partners = await partnersStore.load();
      
      const partnership = Object.values(partners).find(p => p.requesterGuild === targetGuildId && p.status === "accepted");
      
      if (!partnership) {
        return interaction.reply({
          embeds: [createErrorEmbed("Parceria ativa não encontrada!")],
          ephemeral: true
        });
      }

      // Atualizar status
      const requestId = Object.keys(partners).find(key => partners[key].requesterGuild === targetGuildId);
      await partnersStore.update(requestId, {
        ...partners[requestId],
        status: "removed",
        removedAt: new Date().toISOString(),
        removedBy: userId
      });

      const embed = createSuccessEmbed(
        `🚫 **Parceria Removida!**\n\n` +
        `**Servidor:** ${partnership.serverName}\n` +
        `**Removida por:** ${interaction.user.username}\n\n` +
        `A parceria foi removida com sucesso.`
      );

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "listar") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem listar parcerias!")],
          ephemeral: true
        });
      }

      const partners = await partnersStore.load();
      const activePartnerships = Object.values(partners).filter(p => p.status === "accepted");
      
      if (activePartnerships.length === 0) {
        return interaction.reply({
          embeds: [createEmbed({
            title: "📋 Parcerias Ativas",
            description: "Nenhuma parceria ativa no momento.",
            color: 0x95a5a6,
            footer: { text: "WDA - Todos os direitos reservados" }
          })],
          ephemeral: true
        });
      }

      const embed = createEmbed({
        title: "📋 Parcerias Ativas",
        description: activePartnerships.map((partner, index) => 
          `**${index + 1}.** ${partner.serverName}\n` +
          `👥 ${partner.memberCount} membros\n` +
          `📅 Aceita em: ${new Date(partner.acceptedAt).toLocaleDateString('pt-BR')}\n` +
          `📝 ${partner.description}\n`
        ).join("\n"),
        color: 0x00ff00,
        footer: { text: "WDA - Todos os direitos reservados" }
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};
