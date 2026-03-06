const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
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
        .addStringOption((opt) => opt.setName("servidor").setDescription("Nome do seu servidor").setRequired(true))
        .addStringOption((opt) => opt.setName("convite").setDescription("Link de convite do seu servidor").setRequired(true))
        .addStringOption((opt) => opt.setName("descricao").setDescription("Descrição do seu servidor").setRequired(true))
        .addIntegerOption((opt) => opt.setName("membros").setDescription("Número de membros no seu servidor").setRequired(true).setMinValue(1))
    )

    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Verifique o status da sua solicitação de parceria")
    )

    .addSubcommand((sub) =>
      sub
        .setName("aceitar")
        .setDescription("Aceite uma solicitação de parceria")
        .addStringOption((opt) => opt.setName("id").setDescription("ID da solicitação (ex: PARC12345)").setRequired(true))
        .addChannelOption((opt) => opt.setName("canal").setDescription("Canal onde a parceria será postada").setRequired(true))
        .addUserOption((opt) => opt.setName("representante").setDescription("Quem é o representante do servidor?").setRequired(true))
        .addRoleOption((opt) => opt.setName("ping_cargo").setDescription("Cargo específico para mencionar").setRequired(false))
        .addStringOption((opt) =>
          opt.setName("ping_geral")
            .setDescription("Menção geral (sobrepõe o cargo se usado)")
            .setRequired(false)
            .addChoices(
              { name: "@everyone", value: "everyone" },
              { name: "@here", value: "here" }
            )
        )
    )

    .addSubcommand((sub) =>
      sub
        .setName("recusar")
        .setDescription("Recuse uma solicitação de parceria")
        .addStringOption((opt) => opt.setName("id").setDescription("ID da solicitação (ex: PARC12345)").setRequired(true))
        .addStringOption((opt) => opt.setName("motivo").setDescription("Motivo da recusa").setRequired(false))
    )

    .addSubcommand((sub) =>
      sub
        .setName("remover")
        .setDescription("Remova uma parceria ativa")
        .addStringOption((opt) => opt.setName("id").setDescription("ID da parceria (ex: PARC12345)").setRequired(true))
    )

    .addSubcommand((sub) =>
      sub
        .setName("recusar_todas")
        .setDescription("Recuse todas as solicitações pendentes")
        .addStringOption((opt) => opt.setName("motivo").setDescription("Motivo da recusa em massa").setRequired(false))
    )

    .addSubcommand((sub) =>
      sub
        .setName("pendentes")
        .setDescription("Lista todas as solicitações pendentes")
    )

    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Configure quem pode usar o sistema de parcerias")
        .addRoleOption((opt) => opt.setName("cargo").setDescription("Cargo que pode usar comandos de parceria").setRequired(false))
        .addBooleanOption((opt) => opt.setName("ativo").setDescription("Sistema de parcerias ativo para todos?").setRequired(false))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const partners = await partnersStore.load();
    const guildConfig = await getGuildConfig(guildId);

    if (sub !== "solicitar" && sub !== "status") {
      const partnershipConfig = guildConfig?.partnership || {};
      if (!partnershipConfig.enabledForAll && partnershipConfig.allowedRole) {
        if (!interaction.member.roles.cache.has(partnershipConfig.allowedRole)) {
          return interaction.reply({ embeds: [createErrorEmbed("Você não tem permissão para usar comandos de gestão de parceria!")], ephemeral: true });
        }
      }
    }

    if (sub === "solicitar") {
      const serverName = interaction.options.getString("servidor");
      const inviteLink = interaction.options.getString("convite");
      const description = interaction.options.getString("descricao");
      const memberCount = interaction.options.getInteger("membros");

      if (!inviteLink.includes("discord.gg") && !inviteLink.includes("discord.com/invite")) {
        return interaction.reply({ embeds: [createErrorEmbed("O link de convite deve ser do Discord!")], ephemeral: true });
      }

      if (memberCount < 50) {
        return interaction.reply({ embeds: [createErrorEmbed("Seu servidor precisa ter pelo menos 50 membros para solicitar parceria!")], ephemeral: true });
      }

      const existingRequest = Object.values(partners).find(p => p.requesterId === userId && p.status === "pending");
      if (existingRequest) {
        return interaction.reply({ embeds: [createErrorEmbed("Você já tem uma solicitação de parceria pendente!")], ephemeral: true });
      }

      const randomId = Math.floor(Math.random() * 90000) + 10000;
      const requestId = `PARC${randomId}`;

      await partnersStore.update(requestId, (current) => ({
        id: requestId,
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
        `**ID:** \`${requestId}\`\n**Servidor:** ${serverName}\n**Membros:** ${memberCount}\n\n` +
        `📋 Guarde o ID para acompanhar o status.`
      );

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "status") {
      const userRequest = Object.values(partners).find(p => p.requesterId === userId);
      if (!userRequest) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não tem solicitações de parceria.")], ephemeral: true });
      }

      const statusColors = { pending: 0xffff00, accepted: 0x00ff00, rejected: 0xff0000, removed: 0xff6600 };
      const statusTexts = { pending: "⏳ Aguardando análise", accepted: "✅ Aceita", rejected: "❌ Recusada", removed: "🚫 Removida" };

      const embed = createEmbed({
        title: "📊 Status da Parceria",
        description: `**ID:** \`${userRequest.id}\`\n**Status:** ${statusTexts[userRequest.status]}\n**Servidor:** ${userRequest.serverName}\n**Membros:** ${userRequest.memberCount}`,
        color: statusColors[userRequest.status],
        footer: { text: "Sistema de Parcerias" }
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "pendentes") {
      const pendingPartnerships = Object.entries(partners).filter(([key, p]) => p.status === "pending");

      if (pendingPartnerships.length === 0) {
        return interaction.reply({ embeds: [createEmbed({ title: "📋 Pendentes", description: "Não há solicitações pendentes.", color: 0xffff00 })] });
      }

      const embed = createEmbed({ title: "📋 Solicitações Pendentes", description: `**${pendingPartnerships.length}** aguardando análise:`, color: 0xffff00 });

      pendingPartnerships.forEach(([id, p], index) => {
        embed.addFields({
          name: `${index + 1}. ${p.serverName}`,
          value: `**ID:** \`${p.id}\` | **Membros:** ${p.memberCount} | **Solicitante:** <@${p.requesterId}>`,
          inline: false
        });
      });

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "aceitar") {
      const requestId = interaction.options.getString("id").toUpperCase();
      const channel = interaction.options.getChannel("canal");
      const representante = interaction.options.getUser("representante");
      const pingGeral = interaction.options.getString("ping_geral");
      const pingCargo = interaction.options.getRole("ping_cargo");

      const partnership = partners[requestId] || Object.values(partners).find(p => p.id === requestId);

      if (!partnership) {
        return interaction.reply({ embeds: [createErrorEmbed(`Solicitação \`${requestId}\` não encontrada! Use /partnership pendentes para conferir os IDs.`)], ephemeral: true });
      }

      if (partnership.status !== "pending") {
        return interaction.reply({ embeds: [createErrorEmbed("Esta solicitação já foi processada!")], ephemeral: true });
      }

      let textPing = "";
      if (pingGeral === "everyone") textPing = "@everyone";
      else if (pingGeral === "here") textPing = "@here";
      else if (pingCargo) textPing = `<@&${pingCargo.id}>`;

      const displayPing = textPing !== "" ? textPing : "Nenhum";

      await partnersStore.update(partnership.id, (current) => ({
        ...current,
        status: "accepted",
        acceptedAt: new Date().toISOString(),
        acceptedBy: userId,
        partnerChannelId: channel.id
      }));

      const announcementEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setDescription(
          `--- ❴✠❵ NOVA PARCERIA FECHADA! ❴✠❵ ---\n\n` +
          `🤝 **Temos o prazer de anunciar uma nova conexão!**\n\n` +
          `✅ **Server:** ${partnership.serverName}\n` +
          `👤 **𝑹𝒆𝒑𝒓𝒆𝒔𝒆𝒏𝒕𝒂𝒏𝒕𝒆:** <@${representante.id}>\n` +
          `📡 **𝑷𝒊𝒏𝒈:** ${displayPing}\n\n` +
          `${partnership.description}\n\n` +
          `**Link:** ${partnership.inviteLink}\n\n` +
          `⚠️ *Lembramos que todos os nossos parceiros seguem nossas diretrizes de segurança*\n\n` +
          `❴✠❵┅━━━━╍⊶⊰ 🤝 ⊱⊷╍━━━━┅❴✠❵`
        );

      await channel.send({
        content: textPing ? textPing : null,
        embeds: [announcementEmbed]
      });

      return interaction.reply({ embeds: [createSuccessEmbed(`✅ Parceria \`${partnership.id}\` aceita e enviada no canal ${channel}!`)], ephemeral: true });
    }

    if (sub === "recusar") {
      const requestId = interaction.options.getString("id").toUpperCase();
      const reason = interaction.options.getString("motivo") || "Sem motivo especificado";

      const partnership = partners[requestId] || Object.values(partners).find(p => p.id === requestId);

      if (!partnership) {
        return interaction.reply({ embeds: [createErrorEmbed("Solicitação não encontrada!")], ephemeral: true });
      }

      await partnersStore.update(partnership.id, (current) => ({
        ...current,
        status: "rejected",
        rejectedAt: new Date().toISOString(),
        rejectedBy: userId,
        rejectionReason: reason
      }));

      return interaction.reply({ embeds: [createEmbed({ title: "❌ Parceria Recusada", description: `**ID:** \`${partnership.id}\`\n**Servidor:** ${partnership.serverName}\n**Motivo:** ${reason}`, color: 0xff0000 })] });
    }

    if (sub === "recusar_todas") {
      const reason = interaction.options.getString("motivo") || "Limite de parcerias atingido";
      const pendingPartnerships = Object.entries(partners).filter(([key, p]) => p.status === "pending");

      if (pendingPartnerships.length === 0) {
        return interaction.reply({ embeds: [createErrorEmbed("Não há solicitações pendentes para recusar!")], ephemeral: true });
      }

      const confirmEmbed = createEmbed({
        title: "⚠️ Confirmar Recusa em Massa",
        description: `Você está prestes a recusar **${pendingPartnerships.length}** solicitação(ões) de parceria.\n\n` +
        `**Motivo:** ${reason}\n\n` +
        `Esta ação não pode ser desfeita!`,
        color: 0xff6600
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

      return interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });
    }

    if (sub === "remover") {
      const requestId = interaction.options.getString("id").toUpperCase();

      const partnership = partners[requestId] || Object.values(partners).find(p => p.id === requestId);

      if (!partnership) {
        return interaction.reply({ embeds: [createErrorEmbed("Parceria não encontrada! Verifique o ID.")], ephemeral: true });
      }

      if (partnership.status !== "accepted") {
        return interaction.reply({ embeds: [createErrorEmbed("Apenas parcerias ativas podem ser removidas!")], ephemeral: true });
      }

      await partnersStore.update(partnership.id, (current) => ({
        ...current,
        status: "removed",
        removedAt: new Date().toISOString(),
        removedBy: userId
      }));

      return interaction.reply({ embeds: [createEmbed({ title: "🚫 Parceria Removida", description: `**ID:** \`${partnership.id}\`\n**Servidor:** ${partnership.serverName}\n**Removida por:** ${interaction.user.username}`, color: 0xff6600 })] });
    }

    if (sub === "config") {
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