const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  MessageFlags,
} = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");

const boostStore = createDataStore("boosts.json");
const bumpsStore = createDataStore("serverbumps.json");
const partnersStore = createDataStore("partners.json");

function normalizeInviteLink(link) {
  let normalized = link.trim();
  if (!normalized.startsWith("http")) normalized = `https://${normalized}`;
  return normalized;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("boost")
    .setDescription("Super Hub de Impulsos, Bumps e Parcerias")
    .addSubcommandGroup(group =>
      group.setName("premium").setDescription("Promova seu servidor temporariamente no bot")
        .addSubcommand(sub =>
          sub.setName("promover").setDescription("Promova seu servidor temporariamente")
            .addStringOption(opt => opt.setName("mensagem").setDescription("Mensagem de promoção").setRequired(true))
            .addIntegerOption(opt => opt.setName("duracao").setDescription("Duração em horas").setRequired(true).setMinValue(1).setMaxValue(24))
        )
        .addSubcommand(sub => sub.setName("status").setDescription("Verifique o status do seu boost"))
        .addSubcommand(sub => sub.setName("lista").setDescription("Veja a lista de servidores promovidos"))
    )
    .addSubcommandGroup(group =>
      group.setName("parceria").setDescription("Gerencie os bumps das parcerias ativas")
        .addSubcommand(sub =>
          sub.setName("cobrar").setDescription("Admin: Notifica um parceiro na DM para ele dar bump")
            .addStringOption(opt => opt.setName("id").setDescription("ID da Parceria (ex: PARC12345)").setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName("autobump").setDescription("Admin: Ativa a cobrança a cada 3 dias e dá o cargo VIP")
            .addStringOption(opt => opt.setName("id").setDescription("ID da Parceria (ex: PARC12345)").setRequired(true))
            .addBooleanOption(opt => opt.setName("ativo").setDescription("Ligar cobrança e dar Cargo VIP?").setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName("bump").setDescription("Representante: Dê bump manual na sua parceria")
            .addStringOption(opt => opt.setName("id").setDescription("ID da Parceria (ex: PARC12345)").setRequired(true))
        )
    )
    .addSubcommandGroup(group =>
      group.setName("server").setDescription("Sistema geral de Bump do seu servidor")
        .addSubcommand(sub =>
          sub.setName("config").setDescription("Configura o sistema de bump (admin)")
            .addChannelOption(opt => opt.setName("canal").setDescription("Canal de bumps").addChannelTypes(ChannelType.GuildText))
            .addIntegerOption(opt => opt.setName("cooldown").setDescription("Cooldown em horas").setMinValue(1).setMaxValue(24))
            .addStringOption(opt => opt.setName("convite").setDescription("Link de convite padrão"))
        )
        .addSubcommand(sub =>
          sub.setName("bump").setDescription("Dê bump no servidor para divulgá-lo")
            .addStringOption(opt => opt.setName("descricao").setDescription("Descrição do servidor").setRequired(true))
            .addStringOption(opt => opt.setName("convite").setDescription("Link de convite").setRequired(false))
        )
        .addSubcommand(sub => sub.setName("info").setDescription("Veja as estatísticas de bump do servidor"))
        .addSubcommand(sub => sub.setName("top").setDescription("Ranking dos servidores mais bumpados"))
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (group === "premium") {
      if (sub === "promover") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ embeds: [createErrorEmbed("Apenas administradores podem promover o servidor!")], flags: MessageFlags.Ephemeral });
        const message = interaction.options.getString("mensagem");
        const duration = interaction.options.getInteger("duracao");
        const boosts = await boostStore.load();
        const existingBoost = Object.values(boosts).find(b => b.guildId === guildId && b.status === "active");
        if (existingBoost) return interaction.reply({ embeds: [createErrorEmbed("Seu servidor já está sendo promovido!")], flags: MessageFlags.Ephemeral });

        const userLastBoost = Object.values(boosts).filter(b => b.requesterId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        if (userLastBoost) {
          const timeSinceLastBoost = Date.now() - new Date(userLastBoost.createdAt).getTime();
          const cooldownTime = 24 * 60 * 60 * 1000;
          if (timeSinceLastBoost < cooldownTime) return interaction.reply({ embeds: [createErrorEmbed(`Aguarde ${Math.ceil((cooldownTime - timeSinceLastBoost) / 3600000)} horas para promover novamente!`)], flags: MessageFlags.Ephemeral });
        }
        const boostId = `${guildId}_${Date.now()}`;
        const expiresAt = new Date(Date.now() + (duration * 60 * 60 * 1000));
        await boostStore.update(boostId, () => ({ requesterId: userId, guildId, guildName: interaction.guild.name, guildIcon: interaction.guild.iconURL(), message, duration, status: "active", createdAt: new Date().toISOString(), expiresAt: expiresAt.toISOString() }));
        return interaction.reply({ embeds: [createSuccessEmbed(`🚀 **Servidor Promovido!**\n\n**Duração:** ${duration} horas\n**Expira em:** ${expiresAt.toLocaleString('pt-BR')}\n\n**Mensagem:** ${message}`)] });
      }

      if (sub === "status") {
        const boosts = await boostStore.load();
        const activeBoost = Object.values(boosts).find(b => b.guildId === guildId && b.status === "active");
        if (!activeBoost) return interaction.reply({ embeds: [createErrorEmbed("Seu servidor não está sendo promovido no momento.")], flags: MessageFlags.Ephemeral });
        const timeRemaining = Math.max(0, new Date(activeBoost.expiresAt).getTime() - Date.now());
        return interaction.reply({ embeds: [createEmbed({ title: "📊 Status do Boost", description: `**Status:** 🟢 Ativo\n**Duração:** ${activeBoost.duration} horas\n**Restante:** ${Math.ceil(timeRemaining / 3600000)} horas\n\n**Mensagem:** ${activeBoost.message}`, color: 0x00ff00 })], flags: MessageFlags.Ephemeral });
      }

      if (sub === "lista") {
        const boosts = await boostStore.load();
        const activeBoosts = Object.values(boosts).filter(b => b.status === "active").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        if (activeBoosts.length === 0) return interaction.reply({ embeds: [createEmbed({ title: "🚀 Servidores Promovidos", description: "Nenhum no momento.", color: 0x95a5a6 })], flags: MessageFlags.Ephemeral });
        const desc = activeBoosts.map((b, i) => `**${i + 1}.** ${b.guildName}\n⏰ Restante: ${Math.ceil(Math.max(0, new Date(b.expiresAt).getTime() - Date.now()) / 3600000)}h\n💬 ${b.message}`).join("\n\n");
        return interaction.reply({ embeds: [createEmbed({ title: "🚀 Servidores Promovidos", description: desc, color: 0x00ff00 })], flags: MessageFlags.Ephemeral });
      }
    }

    if (group === "parceria") {
      const searchId = interaction.options.getString("id").toUpperCase();
      const partners = await partnersStore.load();
      const pData = partners[searchId];

      if (!pData) return interaction.reply({ embeds: [createErrorEmbed("❌ Parceria não encontrada. Verifique o ID.")], flags: MessageFlags.Ephemeral });
      if (pData.status !== "accepted") return interaction.reply({ embeds: [createErrorEmbed("❌ Esta parceria não está ativa/aceita.")], flags: MessageFlags.Ephemeral });

      if (sub === "cobrar") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ embeds: [createErrorEmbed("Apenas administradores podem cobrar parcerias.")], flags: MessageFlags.Ephemeral });
        const repUser = await interaction.client.users.fetch(pData.requesterId).catch(() => null);
        if (!repUser) return interaction.reply({ embeds: [createErrorEmbed("Representante não encontrado ou com DM fechada.")], flags: MessageFlags.Ephemeral });
        const embedDM = new EmbedBuilder().setTitle("🚀 Hora de renovar nossa Parceria!").setColor(0x3498db).setDescription(`Olá! É hora de dar um **UP** na nossa parceria com o **${pData.serverName}** no nosso servidor.\n\nClique no botão abaixo para postar sua parceria novamente.`);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`boost_parceria_${searchId}`).setLabel("Dar Bump na Parceria").setStyle(ButtonStyle.Success).setEmoji("🚀"));
        try {
          await repUser.send({ embeds: [embedDM], components: [row] });
          return interaction.reply({ embeds: [createSuccessEmbed(`✅ Notificação enviada na DM de <@${pData.requesterId}>!`)], flags: MessageFlags.Ephemeral });
        } catch (e) { return interaction.reply({ embeds: [createErrorEmbed("❌ Falha ao enviar DM.")], flags: MessageFlags.Ephemeral }); }
      }

      // 👇 ENTREGA DO CARGO E PRIMEIRA DM INSTANTÂNEA 👇
      if (sub === "autobump") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ embeds: [createErrorEmbed("Apenas administradores podem gerenciar isso.")], flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const ativo = interaction.options.getBoolean("ativo");
        const guildConfig = await getGuildConfig(interaction.guildId);
        const boostRole = guildConfig?.partnership?.boostRole;
        const member = await interaction.guild.members.fetch(pData.requesterId).catch(() => null);
        const repUser = await interaction.client.users.fetch(pData.requesterId).catch(() => null);

        await partnersStore.update(searchId, (p) => {
          if (p) {
              p.autoBump = ativo;
              if (ativo) p.lastNotified = Date.now(); // Reseta o relógio pra não mandar spam hoje
          }
          return p;
        });

        if (ativo) {
          if (member && boostRole) await member.roles.add(boostRole).catch(() => null);
          if (repUser) {
            const embedDM = new EmbedBuilder().setTitle("🎉 Parceria VIP Ativada!").setColor(0xf1c40f).setDescription(`Sua parceria **${pData.serverName}** recebeu o status de **AutoBump Premium**!\n\nVocê ganhou o cargo exclusivo no servidor e receberá alertas aqui para dar bump a cada 3 dias.\n\n⚠️ Mantenha-se ativo! **Se ficar mais de 3 dias sem dar boost, você perderá sua permissão e o seu cargo VIP.**\n\n👉 **Dê o seu primeiro Bump Premium agora mesmo:**`);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`boost_parceria_${searchId}`).setLabel("Dar Bump na Parceria").setStyle(ButtonStyle.Success).setEmoji("🚀"));
            await repUser.send({ embeds: [embedDM], components: [row] }).catch(() => null);
          }
          return interaction.editReply({ embeds: [createSuccessEmbed(`AutoBump **ATIVADO** para **${pData.serverName}**!\nCargo VIP entregue e primeira DM enviada ao parceiro.`)] });
        } else {
          if (member && boostRole) await member.roles.remove(boostRole).catch(() => null);
          return interaction.editReply({ embeds: [createSuccessEmbed(`AutoBump **DESATIVADO** para **${pData.serverName}**.\nCargo VIP foi retirado.`)] });
        }
      }

      if (sub === "bump") return _processPartnerBump(interaction, searchId, pData);
    }

    if (group === "server") {
      if (sub === "config") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ embeds: [createErrorEmbed("Apenas administradores!")], flags: MessageFlags.Ephemeral });
        const canal = interaction.options.getChannel("canal");
        const cooldown = interaction.options.getInteger("cooldown");
        const convite = interaction.options.getString("convite");
        const currentConfig = await getGuildConfig(guildId);
        const sbConfig = currentConfig.serverbpost || {};

        if (!canal && cooldown == null && !convite) {
          return interaction.reply({ embeds: [createEmbed({ title: "⚙️ Configuração", description: `**Canal:** ${sbConfig.channelId ? `<#${sbConfig.channelId}>` : "❌"}\n**Cooldown:** ${sbConfig.cooldownHours || 2} horas\n**Convite:** ${sbConfig.defaultInvite || "❌"}`, color: 0x3498db })], flags: MessageFlags.Ephemeral });
        }
        const patch = { ...sbConfig };
        if (canal) patch.channelId = canal.id;
        if (cooldown != null) patch.cooldownHours = cooldown;
        if (convite) patch.defaultInvite = normalizeInviteLink(convite);
        await setGuildConfig(guildId, { serverbpost: patch });
        return interaction.reply({ embeds: [createSuccessEmbed(`**✅ Sistema de Bump atualizado!**`)], flags: MessageFlags.Ephemeral });
      }

      if (sub === "bump") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const guildConfig = await getGuildConfig(guildId);
        const sbConfig = guildConfig.serverbpost || {};
        if (!sbConfig.channelId) return interaction.editReply({ embeds: [createErrorEmbed("O sistema de bump não foi configurado.")] });
        const bumpChannel = interaction.guild.channels.cache.get(sbConfig.channelId);
        if (!bumpChannel) return interaction.editReply({ embeds: [createErrorEmbed("Canal não encontrado.")] });

        const cooldownMs = (sbConfig.cooldownHours || 2) * 60 * 60 * 1000;
        const allBumps = await bumpsStore.load();
        const guildBumps = Object.values(allBumps).filter(b => b.guildId === guildId && b.userId === userId);
        if (guildBumps.length > 0) {
          const lastBump = guildBumps.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
          const elapsed = Date.now() - new Date(lastBump.createdAt).getTime();
          if (elapsed < cooldownMs) return interaction.editReply({ embeds: [createErrorEmbed(`Aguarde **${Math.ceil((cooldownMs - elapsed) / 3600000)}h** para dar bump novamente!`)] });
        }

        const descricao = (interaction.options.getString("descricao") || "").replace(/@/g, "");
        let convite = interaction.options.getString("convite") || sbConfig.defaultInvite;
        if (!convite) return interaction.editReply({ embeds: [createErrorEmbed("Nenhum link de convite fornecido ou configurado.")] });
        if (!convite.startsWith("http")) convite = normalizeInviteLink(convite);
        const bumpId = `${guildId}_${userId}_${Date.now()}`;
        await bumpsStore.update(bumpId, () => ({ guildId, userId, guildName: interaction.guild.name, guildIcon: interaction.guild.iconURL(), memberCount: interaction.guild.memberCount, description: descricao, inviteLink: convite, createdAt: new Date().toISOString() }));
        const totalGuildBumps = Object.values(await bumpsStore.load()).filter(b => b.guildId === guildId).length;
        const bumpEmbed = new EmbedBuilder().setColor(0x00d166).setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL() || undefined }).setDescription(`🔔 **Server Bump!**\n\n${descricao}\n\n👥 **Membros:** ${interaction.guild.memberCount}\n🔗 **Convite:** ${convite}\n📊 **Bumps:** ${totalGuildBumps}`).setTimestamp();
        await bumpChannel.send({ embeds: [bumpEmbed] });
        return interaction.editReply({ embeds: [createSuccessEmbed(`**Bump realizado com sucesso!** 🎉\nPostado em <#${sbConfig.channelId}>.`)] });
      }

      if (sub === "info") {
        const allBumps = await bumpsStore.load();
        const guildBumps = Object.values(allBumps).filter(b => b.guildId === guildId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        if (guildBumps.length === 0) return interaction.reply({ embeds: [createEmbed({ title: "📊 Estatísticas", description: "Nenhum bump recebido.", color: 0x95a5a6 })], flags: MessageFlags.Ephemeral });
        const userCounts = {};
        for (const b of guildBumps) userCounts[b.userId] = (userCounts[b.userId] || 0) + 1;
        const topBumpers = Object.entries(userCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([uid, count], i) => `**${i + 1}.** <@${uid}> — ${count} bumps`).join("\n");
        return interaction.reply({ embeds: [createEmbed({ title: "📊 Estatísticas de Bump", description: `**Servidor:** ${interaction.guild.name}\n**Total:** ${guildBumps.length}\n\n**🏆 Top Bumpers:**\n${topBumpers}`, color: 0x3498db })], flags: MessageFlags.Ephemeral });
      }

      if (sub === "top") {
        const allBumps = await bumpsStore.load();
        const bumpValues = Object.values(allBumps);
        if (bumpValues.length === 0) return interaction.reply({ embeds: [createEmbed({ title: "🏆 Ranking", description: "Vazio.", color: 0x95a5a6 })], flags: MessageFlags.Ephemeral });
        const serverCounts = {};
        for (const b of bumpValues) {
          if (!serverCounts[b.guildId]) serverCounts[b.guildId] = { guildName: b.guildName, count: 0, lastBump: b.createdAt };
          serverCounts[b.guildId].count++;
        }
        const ranking = Object.values(serverCounts).sort((a, b) => b.count - a.count).slice(0, 10);
        const list = ranking.map((s, i) => `**${i + 1}.** **${s.guildName}** — ${s.count} bumps`).join("\n");
        return interaction.reply({ embeds: [createEmbed({ title: "🏆 Ranking de Bumps", description: list, color: 0xf1c40f })], flags: MessageFlags.Ephemeral });
      }
    }
  },

  async handleButton(interaction) {
    if (!interaction.customId.startsWith("boost_parceria_")) return;
    const searchId = interaction.customId.replace("boost_parceria_", "");
    const partners = await partnersStore.load();
    const pData = partners[searchId];
    if (!pData) return interaction.reply({ content: "❌ Parceria não encontrada no sistema.", flags: MessageFlags.Ephemeral });
    return _processPartnerBump(interaction, searchId, pData);
  }
};

async function _processPartnerBump(interaction, searchId, pData) {
  if (interaction.user.id !== pData.requesterId) return interaction.reply({ content: "❌ Apenas o representante registrado pode dar bump nesta parceria.", flags: MessageFlags.Ephemeral });

  const cooldownMs = 4 * 60 * 60 * 1000;
  const lastBump = pData.lastBump || 0;
  if (Date.now() - lastBump < cooldownMs) {
    const hours = Math.ceil((cooldownMs - (Date.now() - lastBump)) / 3600000);
    return interaction.reply({ content: `⏳ Aguarde mais **${hours}h** para dar bump novamente nesta parceria.`, flags: MessageFlags.Ephemeral });
  }

  const channel = interaction.client.channels.cache.get(pData.channelId);
  if (!channel) return interaction.reply({ content: "❌ Canal de parceria não encontrado.", flags: MessageFlags.Ephemeral });

  let oldMessage = null;
  if (pData.messageId) oldMessage = await channel.messages.fetch(pData.messageId).catch(() => null);

  let newContent, newEmbeds;
  if (oldMessage) {
    newContent = oldMessage.content;
    newEmbeds = oldMessage.embeds;
  } else {
    let finalLink = pData.inviteLink.trim();
    if (!finalLink.startsWith('http')) finalLink = `https://${finalLink}`;
    const regexLinks = /(https?:\/\/[^\s]+)|([-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*))/gi;
    const cleanDesc = pData.description.replace(regexLinks, "[Link Removido]");
    newContent = `**Servidor:** ${pData.serverName}\n**Tier:** ${pData.tier}\n**Representante:** <@${pData.requesterId}>\n**Link:** ${finalLink}`;
    const embedPost = new EmbedBuilder().setColor(0x2ecc71).setDescription(`--- {☩} PARCERIA FECHADA! {☩} ---\n\n${cleanDesc}\n\n{☩}----------multimap 🤝 multimap----------{☩}`);
    if (pData.banner?.startsWith("http")) embedPost.setImage(pData.banner);
    newEmbeds = [embedPost];
  }

  if (oldMessage) await oldMessage.delete().catch(() => null);
  const sentMsg = await channel.send({ content: newContent, embeds: newEmbeds });

  await partnersStore.update(searchId, (p) => {
    if (!p) return p;
    p.messageId = sentMsg.id;
    p.lastBump = Date.now();
    return p;
  });

  return interaction.reply({ embeds: [createSuccessEmbed("✅ **Bump da parceria realizado!**\nSua mensagem antiga foi apagada e a nova está no topo do canal de parcerias.")], flags: MessageFlags.Ephemeral });
}
