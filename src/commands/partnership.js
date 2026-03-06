const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");

const partnersStore = createDataStore("partners.json");
const staffStatsStore = createDataStore("staff_stats.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("partnership")
    .setDescription("Sistema de parcerias e rankings")

    // SOLICITAR (Público se ativo)
    .addSubcommand((sub) =>
      sub
        .setName("solicitar")
        .setDescription("Solicite uma parceria (Mínimo 350 membros)")
        .addStringOption((opt) => opt.setName("servidor").setDescription("Nome do seu servidor").setRequired(true))
        .addStringOption((opt) => opt.setName("convite").setDescription("Link de convite").setRequired(true))
        .addStringOption((opt) => opt.setName("descricao").setDescription("Descrição (links e @ serão removidos)").setRequired(true))
        .addIntegerOption((opt) => opt.setName("membros").setDescription("Número total de membros").setRequired(true).setMinValue(350))
    )

    // STATUS (Público se ativo)
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Verifique sua solicitação")
    )

    // CONFIGURAÇÃO (Staff e Ativação)
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Configurar staffs e visibilidade do sistema")
        .addRoleOption((opt) => opt.setName("cargo").setDescription("Cargo para adicionar/remover da staff autorizada").setRequired(false))
        .addBooleanOption((opt) => opt.setName("ativo").setDescription("Sistema aberto para todos solicitarem?").setRequired(false))
    )

    // SETUP RANKINGS
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Configurar cargos de Ranking")
        .addRoleOption((opt) => opt.setName("bronze").setDescription("Cargo Bronze (350+)").setRequired(true))
        .addRoleOption((opt) => opt.setName("prata").setDescription("Cargo Prata (750+)").setRequired(true))
        .addRoleOption((opt) => opt.setName("ouro").setDescription("Cargo Ouro (1000+)").setRequired(true))
    )

    // COMANDOS DE GESTÃO
    .addSubcommand((sub) =>
      sub
        .setName("aceitar")
        .setDescription("Aceitar e atribuir ranking")
        .addStringOption((opt) => opt.setName("id").setDescription("ID PARCXXXXX").setRequired(true))
        .addChannelOption((opt) => opt.setName("canal").setDescription("Canal de postagem").setRequired(true))
        .addUserOption((opt) => opt.setName("representante").setDescription("Representante do servidor").setRequired(true))
        .addStringOption((opt) =>
          opt.setName("ping")
            .setDescription("Menção na postagem")
            .addChoices({ name: "@everyone", value: "everyone" }, { name: "@here", value: "here" })
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("recusar")
        .setDescription("Recusar solicitação")
        .addStringOption((opt) => opt.setName("id").setDescription("ID PARCXXXXX").setRequired(true))
        .addStringOption((opt) => opt.setName("motivo").setDescription("Motivo da recusa").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("stats")
        .setDescription("Veja o desempenho de um staff")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Staff para consultar"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("pendentes")
        .setDescription("Lista todas as solicitações aguardando")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const partners = await partnersStore.load();
    const guildConfig = await getGuildConfig(guildId) || {};
    
    const pConfig = guildConfig.partnership || {};
    const staffRoles = pConfig.staffRoles || [];
    const isEnabledForAll = pConfig.enabledForAll ?? false;

    // --- VERIFICAÇÃO DE ACESSO ---
    const isPublicCommand = ["solicitar", "status"].includes(sub);
    const hasStaffRole = interaction.member.roles.cache.some(role => staffRoles.includes(role.id));
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

    // Se não for público e o usuário não for staff/admin, bloqueia
    if (!isPublicCommand) {
      if (!hasStaffRole && !isAdmin) {
        return interaction.reply({ embeds: [createErrorEmbed("Acesso restrito à Staff de Parcerias!")], ephemeral: true });
      }
    } else {
      // Se for público mas o sistema estiver desligado (enabledForAll = false)
      if (!isEnabledForAll && !hasStaffRole && !isAdmin) {
        return interaction.reply({ embeds: [createErrorEmbed("O sistema de parcerias está temporariamente desativado para o público.")], ephemeral: true });
      }
    }

    // --- CONFIG (ADD/REM STAFF E ATIVAR SISTEMA) ---
    if (sub === "config") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ embeds: [createErrorEmbed("Apenas administradores podem usar o /config!")], ephemeral: true });
      }

      const role = interaction.options.getRole("cargo");
      const activeStatus = interaction.options.getBoolean("ativo");
      
      let updatedPConfig = { ...pConfig };

      if (role) {
        let updatedRoles = [...staffRoles];
        if (updatedRoles.includes(role.id)) {
          updatedRoles = updatedRoles.filter(id => id !== role.id);
        } else {
          updatedRoles.push(role.id);
        }
        updatedPConfig.staffRoles = updatedRoles;
      }

      if (activeStatus !== null) {
        updatedPConfig.enabledForAll = activeStatus;
      }

      await setGuildConfig(guildId, { partnership: updatedPConfig });

      return interaction.reply({ 
        content: `✅ Configurações atualizadas!\n**Sistema Público:** ${updatedPConfig.enabledForAll ? "Sim" : "Não"}\n**Staffs:** ${updatedPConfig.staffRoles?.length || 0} cargo(s) configurado(s).`, 
        ephemeral: true 
      });
    }

    // --- SOLICITAR ---
    if (sub === "solicitar") {
      let description = interaction.options.getString("descricao");
      const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|(discord\.(gg|com\/invite)\/[^\s]+)/gi;
      description = description.replace(urlRegex, "`[LINK REMOVIDO]`").replace(/@/g, "(at)");

      const requestId = `PARC${Math.floor(Math.random() * 90000) + 10000}`;

      await partnersStore.update(requestId, (current) => ({
        id: requestId,
        requesterId: userId,
        serverName: interaction.options.getString("servidor"),
        inviteLink: interaction.options.getString("convite"),
        description,
        memberCount: interaction.options.getInteger("membros"),
        status: "pending",
        requestedAt: new Date().toISOString()
      }));

      return interaction.reply({ embeds: [createSuccessEmbed(`✅ **Solicitação enviada!**\nID: \`${requestId}\``)] });
    }

    // --- STATUS ---
    if (sub === "status") {
      const userRequest = Object.values(partners).find(p => p.requesterId === userId);
      if (!userRequest) return interaction.reply({ content: "Você não tem solicitações.", ephemeral: true });
      
      return interaction.reply({ 
        embeds: [createEmbed({ 
          title: "Status da Parceria", 
          description: `ID: \`${userRequest.id}\`\nStatus: **${userRequest.status}**\nServidor: ${userRequest.serverName}`,
          color: userRequest.status === "accepted" ? 0x00FF00 : 0xFFFF00
        })], 
        ephemeral: true 
      });
    }

    // --- ACEITAR ---
    if (sub === "aceitar") {
      const requestId = interaction.options.getString("id").toUpperCase();
      const representative = interaction.options.getUser("representante");
      const channel = interaction.options.getChannel("canal");
      const partnership = partners[requestId];

      if (!partnership || partnership.status !== "pending") {
        return interaction.reply({ embeds: [createErrorEmbed("ID inválido ou já processado.")], ephemeral: true });
      }

      let rankingName = "Bronze";
      let rankingRoleId = pConfig.ranks?.bronze;
      const members = partnership.memberCount;

      if (members >= 1000) {
        rankingName = "Ouro";
        rankingRoleId = pConfig.ranks?.ouro;
      } else if (members >= 750) {
        rankingName = "Prata";
        rankingRoleId = pConfig.ranks?.prata;
      }

      if (rankingRoleId) {
        const member = await interaction.guild.members.fetch(representative.id).catch(() => null);
        if (member) await member.roles.add(rankingRoleId).catch(() => null);
      }

      await partnersStore.update(requestId, (curr) => ({ ...curr, status: "accepted", processedBy: userId }));
      await staffStatsStore.update(userId, (curr) => ({
        ...curr,
        approved: (curr?.approved || 0) + 1,
        name: interaction.user.username
      }));

      const dmEmbed = createSuccessEmbed(`Sua parceria (**${partnership.serverName}**) foi **ACEITA**! 🎉`);
      await representative.send({ embeds: [dmEmbed] }).catch(() => null);

      const pingChoice = interaction.options.getString("ping");
      const announce = new EmbedBuilder()
        .setColor(0x00FF00)
        .setDescription(
          `--- ❴✠❵ NOVA PARCERIA FECHADA! ❴✠❵ ---\n\n` +
          `🤝 **Conexão Estabelecida!**\n\n` +
          `✅ **Server:** ${partnership.serverName}\n` +
          `👤 **Representante:** <@${representative.id}>\n` +
          `📡 **𝑷𝒊𝒏𝒈:** ${pingChoice ? "@" + pingChoice : "Nenhum"}\n\n` +
          `${partnership.description}\n\n` +
          `🔗 **Convite:** ${partnership.inviteLink}\n\n` +
          `⚠️ *Ranking: **${rankingName}***\n\n` +
          `❴✠❵┅━━━━╍⊶⊰ 🤝 ⊱⊷╍━━━━┅❴✠❵`
        );

      await channel.send({ content: pingChoice ? `@${pingChoice}` : null, embeds: [announce] });
      return interaction.reply({ content: "Aprovada!", ephemeral: true });
    }

    // --- RECUSAR / STATS / SETUP / PENDENTES ---
    if (sub === "recusar") {
        const requestId = interaction.options.getString("id").toUpperCase();
        const partnership = partners[requestId];
        if (!partnership) return interaction.reply({ content: "ID não encontrado.", ephemeral: true });
        await partnersStore.update(requestId, (curr) => ({ ...curr, status: "rejected" }));
        await staffStatsStore.update(userId, (curr) => ({ ...curr, rejected: (curr?.rejected || 0) + 1 }));
        const requester = await interaction.client.users.fetch(partnership.requesterId).catch(() => null);
        if (requester) await requester.send({ embeds: [createErrorEmbed(`Sua parceria (**${partnership.serverName}**) foi recusada.\nMotivo: ${interaction.options.getString("motivo")}`)] }).catch(() => null);
        return interaction.reply({ content: "Recusada.", ephemeral: true });
    }

    if (sub === "stats") {
      const target = interaction.options.getUser("usuario") || interaction.user;
      const stats = await staffStatsStore.load();
      const userStats = stats[target.id] || { approved: 0, rejected: 0 };
      return interaction.reply({ 
        embeds: [new EmbedBuilder().setTitle(`📊 Staff: ${target.username}`).setColor(0x5865F2)
        .addFields({ name: "✅ Aprovadas", value: `${userStats.approved}`, inline: true }, { name: "❌ Recusadas", value: `${userStats.rejected}`, inline: true })]
      });
    }

    if (sub === "setup") {
      const ranks = {
        bronze: interaction.options.getRole("bronze").id,
        prata: interaction.options.getRole("prata").id,
        ouro: interaction.options.getRole("ouro").id
      };
      await setGuildConfig(guildId, { partnership: { ...pConfig, ranks } });
      return interaction.reply({ content: "Rankings configurados!", ephemeral: true });
    }

    if (sub === "pendentes") {
        const pending = Object.values(partners).filter(p => p.status === "pending");
        if (pending.length === 0) return interaction.reply({ content: "Nenhuma pendente.", ephemeral: true });
        const embed = new EmbedBuilder().setTitle("📋 Pendentes").setColor(0xFFFF00);
        pending.forEach(p => embed.addFields({ name: p.serverName, value: `ID: \`${p.id}\` | Membros: ${p.memberCount}` }));
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};