const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType } = require("discord.js");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig } = require("../config/guildConfig");

const partnersStore = createDataStore("partners.json");
const staffStatsStore = createDataStore("staff_stats.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("partnership")
    .setDescription("sistema de parcerias para membros")
    .addSubcommand(sub =>
      sub.setName("solicitar")
        .setDescription("solicite uma parceria (Bronze 350+ | Prata 500+ | Ouro 1000+)")
        .addStringOption(o => o.setName("servidor").setDescription("nome do seu servidor").setRequired(true))
        .addStringOption(o => o.setName("convite").setDescription("link de convite").setRequired(true))
        .addStringOption(o => o.setName("descricao").setDescription("descricao do servidor").setRequired(true))
        .addStringOption(o => o.setName("banner").setDescription("link da imagem opcional"))
    )
    .addSubcommand(sub =>
      sub.setName("list")
        .setDescription("lista suas parcerias ativas")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guildId, user, guild } = interaction;

    // ==========================================
    // SUBCOMANDO: SOLICITAR
    // ==========================================
    if (sub === "solicitar") {
      await interaction.deferReply({ ephemeral: true });

      const guildConfig = await getGuildConfig(guildId) || {};
      const pConfig = guildConfig.partnership || { enabledForAll: false };

      if (!pConfig.enabledForAll) {
        return interaction.editReply({ embeds: [createErrorEmbed("O sistema de parcerias está desativado.")] });
      }

      const conviteInput = interaction.options.getString("convite");
      let inviteData;
      let tier = "Bronze";
      let membros = 0;

      try {
        inviteData = await interaction.client.fetchInvite(conviteInput);
        membros = inviteData.memberCount;
        if (membros < 350) return interaction.editReply({ embeds: [createErrorEmbed(`Seu servidor tem **${membros}** membros. O mínimo para o Tier Bronze é **350**.`)] });
        if (membros >= 1000) tier = "Ouro";
        else if (membros >= 500) tier = "Prata";
      } catch (error) {
        return interaction.editReply({ embeds: [createErrorEmbed("Link de convite inválido ou expirado. Certifique-se de que é um link válido do Discord.")] });
      }

      const allPartners = await partnersStore.load();
      const userRequests = Object.values(allPartners).filter(p => p.requesterId === user.id);
      if (userRequests.length > 0) {
        const lastReq = userRequests.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        const cooldown = 24 * 60 * 60 * 1000;
        if (Date.now() - new Date(lastReq.date).getTime() < cooldown) {
          return interaction.editReply({ embeds: [createErrorEmbed("Aguarde 24h para enviar uma nova solicitação.")] });
        }
      }

      const cleanDescEntrada = interaction.options.getString("descricao").replace(/@/g, "");

      const data = {
        id: `PARC${Math.floor(Math.random() * 90000) + 10000}`,
        requesterId: user.id,
        serverName: interaction.options.getString("servidor"),
        inviteLink: conviteInput,
        description: cleanDescEntrada,
        memberCount: membros,
        tier: tier,
        banner: interaction.options.getString("banner"),
        status: "pending",
        date: new Date().toISOString()
      };

      await partnersStore.update(data.id, () => data);
      const logChan = guild.channels.cache.get(pConfig.logChannelId);

      const embedLog = new EmbedBuilder()
        .setTitle("Nova Solicitação de Parceria")
        .setColor(0xFFFF00)
        .addFields(
          { name: "ID", value: data.id, inline: true },
          { name: "Representante", value: `<@${user.id}>`, inline: true },
          { name: "Tier Detectado", value: `**${data.tier}** (${data.memberCount} membros)`, inline: true },
          { name: "Link", value: data.inviteLink, inline: false }
        )
        .setDescription(`**Descrição:**\n${data.description}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`partnership_approve_${data.id}`).setLabel("Aprovar").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`partnership_reject_${data.id}`).setLabel("Recusar").setStyle(ButtonStyle.Danger)
      );

      const pingStaff = pConfig.staffPingRoleId ? `<@&${pConfig.staffPingRoleId}>` : "";
      if (logChan) await logChan.send({ content: pingStaff, embeds: [embedLog], components: [row] });
      return interaction.editReply({ embeds: [createSuccessEmbed(`Solicitação enviada! Detectamos Tier **${data.tier}**.`)] });
    }

    // ==========================================
    // SUBCOMANDO: LIST (Visão Pessoal do Membro)
    // ==========================================
    if (sub === "list") {
      await interaction.deferReply({ ephemeral: true });

      const allPartners = await partnersStore.load();
      // FILTRA APENAS AS DO USUÁRIO QUE DIGITOU
      const myPartners = Object.values(allPartners).filter(p => p.status === "accepted" && p.requesterId === interaction.user.id);

      if (myPartners.length === 0) {
        return interaction.editReply({ embeds: [createErrorEmbed("Você não possui nenhuma parceria ativa no momento.")] });
      }

      const embedList = new EmbedBuilder()
        .setTitle("🤝 Suas Parcerias")
        .setColor(0x2ecc71)
        .setDescription(`Você tem **${myPartners.length}** parceria(s) ativa(s) no nosso servidor!`);

      myPartners.slice(0, 25).forEach(p => {
        const partnerDate = Math.floor(new Date(p.date).getTime() / 1000); // Data para exibir o "há X tempo"
        
        embedList.addFields({
          name: `🔰 ${p.serverName} (ID: ${p.id})`,
          value: `🔗 [Link de Convite](${p.inviteLink})\n⏳ Parceiro desde: <t:${partnerDate}:R>`,
          inline: false
        });
      });

      return interaction.editReply({ embeds: [embedList] });
    }
  },

  // ==========================================
  // BOTÕES E MODAIS (Não precisaram de alteração)
  // ==========================================
  async handleButton(interaction) {
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const id = parts[2];

    const partners = await partnersStore.load();
    const data = partners[id];

    if (!data || data.status !== "pending") return interaction.reply({ content: "Pedido expirado ou já processado.", ephemeral: true });

    if (action === "reject") {
      const modal = new ModalBuilder().setCustomId(`partnership_modal_reject_${id}`).setTitle("Recusar Parceria");
      const input = new TextInputBuilder().setCustomId("reason").setLabel("Motivo").setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return await interaction.showModal(modal);
    }

    if (action === "approve") {
      const rowChannel = new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(`sel_chan_${id}`).setPlaceholder("Selecione o canal de postagem").addChannelTypes(ChannelType.GuildText));
      const promptMsg = await interaction.reply({ content: "Selecione o canal para postar a parceria:", components: [rowChannel], ephemeral: true, fetchReply: true });

      try {
        const chanInter = await promptMsg.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 60000 });
        const targetChan = interaction.guild.channels.cache.get(chanInter.values[0]);

        const rowRole = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`sel_role_${id}`).setPlaceholder("Menção de Cargo..."));
        const rowButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ping_everyone_${id}`).setLabel("@everyone").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`ping_here_${id}`).setLabel("@here").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`ping_none_${id}`).setLabel("Sem menção").setStyle(ButtonStyle.Danger));

        await chanInter.update({ content: `Canal ${targetChan} ok! Agora defina o Ping:`, components: [rowRole, rowButtons] });
        const mentionInter = await promptMsg.awaitMessageComponent({ filter: i => i.user.id === interaction.user.id, time: 60000 });

        let pingText = "";
        if (mentionInter.isRoleSelectMenu()) pingText = `<@&${mentionInter.values[0]}>`;
        else if (mentionInter.isButton()) {
          if (mentionInter.customId.includes("everyone")) pingText = "@everyone";
          else if (mentionInter.customId.includes("here")) pingText = "@here";
          else pingText = "Sem menção";
        }

        let finalLink = data.inviteLink.trim();
        if (!finalLink.startsWith('http')) finalLink = `https://${finalLink}`;

        const regexLinks = /(https?:\/\/[^\s]+)|([-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*))/gi;
        const cleanDesc = data.description.replace(regexLinks, "[Link Removido]");

        const textoFora = `**Servidor:** ${data.serverName}\n**Tier:** ${data.tier}\n**Representante:** <@${data.requesterId}>\n**Responsável:** <@${interaction.user.id}>\n**Ping:** ${pingText}\n**Link:** ${finalLink}`;
        const embedPost = new EmbedBuilder().setColor(0x2ecc71).setDescription(`--- {☩} NOVA PARCERIA FECHADA! {☩} ---\n\n${cleanDesc}\n\n{☩}----------{🤝}----------{☩}`);
        if (data.banner?.startsWith("http")) embedPost.setImage(data.banner);

        const sentMessage = await targetChan.send({ content: textoFora, embeds: [embedPost] });

        await partnersStore.update(id, c => ({ ...c, status: "accepted", processedBy: interaction.user.id, messageId: sentMessage.id, channelId: targetChan.id }));
        await staffStatsStore.update(interaction.user.id, c => ({ ...c, approved: (c?.approved || 0) + 1 }));

        const guildConfig = await getGuildConfig(interaction.guildId);
        const ranks = guildConfig?.partnership?.ranks;
        if (ranks) {
          let roleToGiveId = null;
          if (data.tier === "Bronze") roleToGiveId = ranks.bronze;
          else if (data.tier === "Prata") roleToGiveId = ranks.prata;
          else if (data.tier === "Ouro") roleToGiveId = ranks.ouro;
          if (roleToGiveId) {
            const member = await interaction.guild.members.fetch(data.requesterId).catch(() => null);
            if (member) await member.roles.add(roleToGiveId).catch(() => null);
          }
        }

        const repUser = await interaction.client.users.fetch(data.requesterId).catch(() => null);
        if (repUser) {
          const embedDm = new EmbedBuilder().setTitle("🤝 Parceria Aprovada!").setColor(0x00FF00).setDescription(`Sua parceria para o servidor **${data.serverName}** (Tier ${data.tier}) foi aceita e seu cargo de representação foi entregue!`).addFields({ name: "⚠️ Aviso Importante", value: "Caso você saia do nosso servidor, a parceria será encerrada e a mensagem de divulgação será apagada automaticamente." });
          await repUser.send({ embeds: [embedDm] }).catch(() => null);
        }

        const logEmbedAprovada = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x00FF00).addFields({ name: "Responsável (Staff)", value: `<@${interaction.user.id}>`, inline: true }, { name: "Canal de Postagem", value: `${targetChan}`, inline: true });
        await interaction.message.edit({ content: `✅ Parceria processada!`, components: [], embeds: [logEmbedAprovada] });
        await mentionInter.update({ content: "🚀 Concluído! Parceria postada e cargo entregue.", components: [] });

      } catch (e) {
        await interaction.editReply({ content: "⏳ Tempo esgotado para configuração.", components: [] }).catch(() => null);
      }
    }
  },

  async handleModal(interaction) {
    const id = interaction.customId.split("_")[3];
    await interaction.deferUpdate();
    const reason = interaction.fields.getTextInputValue("reason");
    const partners = await partnersStore.load();
    const data = partners[id];

    await partnersStore.update(id, c => ({ ...c, status: "rejected", processedBy: interaction.user.id, reason }));

    const user = await interaction.client.users.fetch(data.requesterId).catch(() => null);
    if (user) await user.send(`Sua parceria com **${data.serverName}** foi recusada.\n**Motivo:** ${reason}`).catch(() => null);

    const logEmbedRecusada = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xFF0000).addFields({ name: "Responsável (Staff)", value: `<@${interaction.user.id}>`, inline: true }, { name: "Motivo da Recusa", value: reason, inline: false });
    return interaction.editReply({ content: `❌ Parceria recusada.`, components: [], embeds: [logEmbedRecusada] });
  }
};
