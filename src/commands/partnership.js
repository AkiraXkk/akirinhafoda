const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");

const partnersStore = createDataStore("partners.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("partnership")
    .setDescription("Sistema de parcerias entre servidores")
    
    // Solicitar parceria
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
            .setDescription("Número de membros no seu servidor")
            .setRequired(true)
            .setMinValue(1)
        )
    )
    
    // Verificar status
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Verifique o status da sua solicitação de parceria")
    )
    
    // Aceitar parceria (Admin)
    .addSubcommand((sub) =>
      sub
        .setName("aceitar")
        .setDescription("Aceite uma solicitação de parceria")
        .addStringOption((opt) =>
          opt.setName("id")
            .setDescription("ID da solicitação (ex: PARC123)")
            .setRequired(true)
        )
        .addChannelOption((opt) =>
          opt.setName("canal")
            .setDescription("Canal de parceria")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("mencao")
            .setDescription("Qual @ mencionar na aceitação?")
            .setRequired(false)
            .addChoices(
              { name: "@everyone", value: "everyone" },
              { name: "@here", value: "here" },
              { name: "@parcerias", value: "parcerias" },
              { name: "@atualizacoes", value: "atualizacoes" },
              { name: "Não mencionar", value: "none" }
            )
        )
    )
    
    // Recusar parceria (Admin)
    .addSubcommand((sub) =>
      sub
        .setName("recusar")
        .setDescription("Recuse uma solicitação de parceria")
        .addStringOption((opt) =>
          opt.setName("id")
            .setDescription("ID da solicitação (ex: PARC123)")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("motivo")
            .setDescription("Motivo da recusa")
            .setRequired(false)
        )
    )
    
    // Remover parceria (Admin)
    .addSubcommand((sub) =>
      sub
        .setName("remover")
        .setDescription("Remova uma parceria ativa")
        .addStringOption((opt) =>
          opt.setName("id")
            .setDescription("ID da parceria (ex: PARC123)")
            .setRequired(true)
        )
    )
    
    // Recusar todas (Admin)
    .addSubcommand((sub) =>
      sub
        .setName("recusar_todas")
        .setDescription("Recuse todas as solicitações pendentes")
        .addStringOption((opt) =>
          opt.setName("motivo")
            .setDescription("Motivo da recusa em massa")
            .setRequired(false)
        )
    )
    
    // Listar pendentes (Admin)
    .addSubcommand((sub) =>
      sub
        .setName("pendentes")
        .setDescription("Lista todas as solicitações pendentes")
    )
    
    // Configurar permissões (Admin)
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Configure quem pode usar o sistema de parcerias")
        .addRoleOption((opt) =>
          opt.setName("cargo")
            .setDescription("Cargo que pode usar comandos de parceria")
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt.setName("ativo")
            .setDescription("Sistema de parcerias ativo para todos?")
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const partners = await partnersStore.load();
    const guildConfig = await getGuildConfig(guildId);

    // Verificar permissões globais
    if (sub !== "solicitar" && sub !== "status") {
      const partnershipConfig = guildConfig?.partnership || {};
      
      // Se não estiver ativo para todos, verificar se tem cargo
      if (!partnershipConfig.enabledForAll && partnershipConfig.allowedRole) {
        const member = interaction.member;
        if (!member.roles.cache.has(partnershipConfig.allowedRole)) {
          return interaction.reply({
            embeds: [createErrorEmbed("Você não tem permissão para usar comandos de parceria!")],
            ephemeral: true
          });
        }
      }
    }

    if (sub === "solicitar") {
      const serverName = interaction.options.getString("servidor");
      const inviteLink = interaction.options.getString("convite");
      const description = interaction.options.getString("descricao");
      const memberCount = interaction.options.getInteger("membros");

      // Validações
      if (!inviteLink.includes("discord.gg") && !inviteLink.includes("discord.com/invite")) {
        return interaction.reply({
          embeds: [createErrorEmbed("O link de convite deve ser do Discord!")],
          ephemeral: true
        });
      }

      if (memberCount < 50) {
        return interaction.reply({
          embeds: [createErrorEmbed("Seu servidor precisa ter pelo menos 50 membros para solicitar parceria!")],
          ephemeral: true
        });
      }

      // Verificar se já tem solicitação
      const existingRequest = Object.values(partners).find(p => p.requesterId === userId && p.status === "pending");
      if (existingRequest) {
        return interaction.reply({
          embeds: [createErrorEmbed("Você já tem uma solicitação de parceria pendente!")],
          ephemeral: true
        });
      }

      // Gerar ID exclusivo simplificado
      const requestId = `PARC${String(Date.now()).slice(-3)}`;

      // Criar solicitação
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
        `**ID da Solicitação:** \`${requestId}\`\n` +
        `**Servidor:** ${serverName}\n` +
        `**Membros:** ${memberCount}\n` +
        `**Descrição:** ${description}\n\n` +
        `📋 **Guarde este ID!** Ele será necessário para acompanhamento.\n\n` +
        `Sua solicitação será analisada e você receberá uma resposta em breve!`
      );

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "status") {
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
        description: `**ID:** \`${userRequest.id || userRequest.requestId}\`\n\n` +
        `**Status:** ${statusTexts[userRequest.status]}\n\n` +
        `**Servidor:** ${userRequest.serverName}\n` +
        `**Membros:** ${userRequest.memberCount}\n` +
        `**Solicitado em:** ${new Date(userRequest.requestedAt).toLocaleDateString('pt-BR')}`,
        color: statusColors[userRequest.status],
        footer: { text: "WDA - Todos os direitos reservados" }
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "pendentes") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem listar solicitações pendentes!")],
          ephemeral: true
        });
      }

      const pendingPartnerships = Object.entries(partners).filter(([key, p]) => p.status === "pending");
      
      if (pendingPartnerships.length === 0) {
        return interaction.reply({
          embeds: [createEmbed({
            title: "📋 Solicitações Pendentes",
            description: "Não há solicitações de parceria pendentes no momento.",
            color: 0xffff00,
            footer: { text: "WDA - Todos os direitos reservados" }
          })]
        });
      }

      const embed = createEmbed({
        title: "📋 Solicitações Pendentes",
        description: `**${pendingPartnerships.length}** solicitação(ões) aguardando análise:`,
        color: 0xffff00,
        footer: { text: "WDA - Todos os direitos reservados" }
      });

      // Adicionar campos para cada solicitação
      pendingPartnerships.forEach(([requestId, partnership], index) => {
        embed.addFields({
          name: `${index + 1}. ${partnership.serverName}`,
          value: `**ID:** \`${requestId}\`\n` +
                 `**Membros:** ${partnership.memberCount}\n` +
                 `**Solicitado:** ${new Date(partnership.requestedAt).toLocaleDateString('pt-BR')}\n` +
                 `**Solicitante:** <@${partnership.requesterId}>`,
          inline: false
        });
      });

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "aceitar") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem aceitar parcerias!")],
          ephemeral: true
        });
      }

      const requestId = interaction.options.getString("id").toUpperCase();
      const channel = interaction.options.getChannel("canal");
      const mention = interaction.options.getString("mencao") || "none";
      
      const partnership = Object.values(partners).find(p => p.id === requestId || p.requestId === requestId);
      
      if (!partnership) {
        return interaction.reply({
          embeds: [createErrorEmbed("Solicitação de parceria não encontrada! Verifique o ID.")],
          ephemeral: true
        });
      }

      if (partnership.status !== "pending") {
        return interaction.reply({
          embeds: [createErrorEmbed("Esta solicitação já foi processada!")],
          ephemeral: true
        });
      }

      // Atualizar status
      await partnersStore.update(requestId, (current) => ({
        ...current,
        status: "accepted",
        acceptedAt: new Date().toISOString(),
        acceptedBy: userId,
        partnerChannelId: channel.id
      }));

      // Formatar menção
      let mentionText = "";
      switch (mention) {
        case "everyone":
          mentionText = "@everyone";
          break;
        case "here":
          mentionText = "@here";
          break;
        case "parcerias":
          mentionText = "<@&parcerias>";
          break;
        case "atualizacoes":
          mentionText = "<@&atualizacoes>";
          break;
        default:
          mentionText = "";
      }

      // Enviar confirmação
      const embed = createSuccessEmbed(
        `✅ **Parceria Aceita!**\n\n` +
        `**ID:** \`${requestId}\`\n` +
        `**Servidor:** ${partnership.serverName}\n` +
        `**Aceita por:** ${interaction.user.username}\n` +
        `**Canal de parceria:** ${channel}\n\n` +
        `A parceria está ativa!`
      );

      // Enviar mensagem no canal com menção
      await channel.send({
        content: mentionText ? `${mentionText} Nova parceria estabelecida!` : "Nova parceria estabelecida!",
        embeds: [embed]
      });

      // Confirmar para o admin
      return interaction.reply({
        embeds: [createSuccessEmbed(
          `✅ **Parceria Aceita com Sucesso!**\n\n` +
          `**ID:** \`${requestId}\`\n` +
          `**Servidor:** ${partnership.serverName}\n` +
          `**Canal:** ${channel}\n` +
          `**Menção:** ${mentionText || "Nenhuma"}\n\n` +
          `Mensagem enviada no canal com sucesso!`
        )],
        ephemeral: true
      });
    }

    if (sub === "recusar_todas") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem recusar parcerias em massa!")],
          ephemeral: true
        });
      }

      const reason = interaction.options.getString("motivo") || "Limite de parcerias atingido";
      const pendingPartnerships = Object.entries(partners).filter(([key, p]) => p.status === "pending");
      
      if (pendingPartnerships.length === 0) {
        return interaction.reply({
          embeds: [createErrorEmbed("Não há solicitações pendentes para recusar!")],
          ephemeral: true
        });
      }

      // Confirmar ação
      const confirmEmbed = createEmbed({
        title: "⚠️ Confirmar Recusa em Massa",
        description: `Você está prestes a recusar **${pendingPartnerships.length}** solicitação(ões) de parceria.\n\n` +
        `**Motivo:** ${reason}\n\n` +
        `Esta ação não pode ser desfeita!`,
        color: 0xff6600,
        footer: { text: "WDA - Todos os direitos reservados" }
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_reject_all_${userId}`)
          .setLabel("Confirmar Recusa")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`cancel_reject_all_${userId}`)
          .setLabel("Cancelar")
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });
      return;
    }

    if (sub === "recusar") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem recusar parcerias!")],
          ephemeral: true
        });
      }

      const requestId = interaction.options.getString("id").toUpperCase();
      const reason = interaction.options.getString("motivo") || "Sem motivo especificado";
      
      const partnership = Object.values(partners).find(p => p.id === requestId || p.requestId === requestId);
      
      if (!partnership) {
        return interaction.reply({
          embeds: [createErrorEmbed("Solicitação de parceria não encontrada! Verifique o ID.")],
          ephemeral: true
        });
      }

      if (partnership.status !== "pending") {
        return interaction.reply({
          embeds: [createErrorEmbed("Esta solicitação já foi processada!")],
          ephemeral: true
        });
      }

      // Atualizar status
      await partnersStore.update(requestId, (current) => ({
        ...current,
        status: "rejected",
        rejectedAt: new Date().toISOString(),
        rejectedBy: userId,
        rejectionReason: reason
      }));

      // Enviar confirmação
      const embed = createEmbed({
        title: "❌ Parceria Recusada",
        description: `**ID:** \`${requestId}\`\n\n` +
        `**Servidor:** ${partnership.serverName}\n` +
        `**Recusada por:** ${interaction.user.username}\n` +
        `**Motivo:** ${reason}`,
        color: 0xff0000,
        footer: { text: "WDA - Todos os direitos reservados" }
      });

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "remover") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem remover parcerias!")],
          ephemeral: true
        });
      }

      const requestId = interaction.options.getString("id").toUpperCase();
      
      const partnership = Object.values(partners).find(p => p.id === requestId || p.requestId === requestId);
      
      if (!partnership) {
        return interaction.reply({
          embeds: [createErrorEmbed("Parceria não encontrada! Verifique o ID.")],
          ephemeral: true
        });
      }

      if (partnership.status !== "accepted") {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas parcerias ativas podem ser removidas!")],
          ephemeral: true
        });
      }

      // Atualizar status
      await partnersStore.update(requestId, (current) => ({
        ...current,
        status: "removed",
        removedAt: new Date().toISOString(),
        removedBy: userId
      }));

      // Enviar confirmação
      const embed = createEmbed({
        title: "🚫 Parceria Removida",
        description: `**ID:** \`${requestId}\`\n\n` +
        `**Servidor:** ${partnership.serverName}\n` +
        `**Removida por:** ${interaction.user.username}`,
        color: 0xff6600,
        footer: { text: "WDA - Todos os direitos reservados" }
      });

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "config") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem configurar o sistema de parcerias!")],
          ephemeral: true
        });
      }

      const role = interaction.options.getRole("cargo");
      const enabledForAll = interaction.options.getBoolean("ativo") ?? false;

      await setGuildConfig(guildId, {
        partnership: {
          allowedRole: role?.id || null,
          enabledForAll: enabledForAll
        }
      });

      const embed = createSuccessEmbed(
        `⚙️ **Configurações de Parceria Atualizadas!**\n\n` +
        `**Cargo Permitido:** ${role ? `<@&${role.id}>` : "Qualquer um"}\n` +
        `**Ativo para Todos:** ${enabledForAll ? "✅ Sim" : "❌ Não"}\n\n` +
        `${enabledForAll ? "Todos podem usar comandos de parceria" : "Apenas o cargo especificado pode usar comandos de parceria"}`
      );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};
