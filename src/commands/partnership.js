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
        .setDescription("solicite uma parceria (minimo 350 membros)")
        .addStringOption(o => o.setName("servidor").setDescription("nome do seu servidor").setRequired(true))
        .addStringOption(o => o.setName("convite").setDescription("link de convite").setRequired(true))
        .addStringOption(o => o.setName("descricao").setDescription("descricao do servidor").setRequired(true))
        .addIntegerOption(o => o.setName("membros").setDescription("numero de membros").setRequired(true).setMinValue(350))
        .addStringOption(o => o.setName("banner").setDescription("link da imagem opcional"))
    )
    .addSubcommand(sub =>
      sub.setName("listar").setDescription("lista todas as parcerias ativas")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guildId, user, guild } = interaction;

    if (sub === "solicitar") {
      await interaction.deferReply({ ephemeral: true });

      const guildConfig = await getGuildConfig(guildId) || {};
      const pConfig = guildConfig.partnership || { enabledForAll: false };

      if (!pConfig.enabledForAll) {
        return interaction.editReply({ embeds: [createErrorEmbed("O sistema de parcerias está desativado.")] });
      }

      const allPartners = await partnersStore.load();
      const userRequests = Object.values(allPartners).filter(p => p.requesterId === user.id);
      if (userRequests.length > 0) {
        const lastReq = userRequests.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        const cooldown = 24 * 60 * 60 * 1000;
        if (Date.now() - new Date(lastReq.date).getTime() < cooldown) {
          return interaction.editReply({ embeds: [createErrorEmbed("Você já enviou uma solicitação recentemente. Tente novamente em 24h.")] });
        }
      }

      const data = {
        id: `PARC${Math.floor(Math.random() * 90000) + 10000}`,
        requesterId: user.id,
        serverName: interaction.options.getString("servidor"),
        inviteLink: interaction.options.getString("convite"),
        // Bloqueio de pings na entrada: substitui todos os "@" por vazio
        description: interaction.options.getString("descricao").replace(/@/g, ""),
        memberCount: interaction.options.getInteger("membros"),
        banner: interaction.options.getString("banner"),
        status: "pending",
        date: new Date().toISOString()
      };

      await partnersStore.update(data.id, () => data);
      const logChan = guild.channels.cache.get(pConfig.logChannelId);

      const embed = new EmbedBuilder()
        .setTitle("Nova Solicitação de Parceria")
        .setColor(0xFFFF00)
        .addFields(
          { name: "ID", value: data.id, inline: true },
          { name: "Representante", value: `<@${user.id}>`, inline: true },
          { name: "Servidor", value: data.serverName, inline: true },
          { name: "Link Enviado", value: data.inviteLink, inline: false }
        )
        .setDescription(`**Descrição:**\n${data.description}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`partnership_approve_${data.id}`).setLabel("Aprovar").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`partnership_reject_${data.id}`).setLabel("Recusar").setStyle(ButtonStyle.Danger)
      );

      if (logChan) await logChan.send({ embeds: [embed], components: [row] });
      return interaction.editReply({ embeds: [createSuccessEmbed("Solicitação enviada com sucesso!")] });
    }
  },

  async handleButton(interaction) {
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const id = parts[2];

    const partners = await partnersStore.load();
    const data = partners[id];

    if (!data || data.status !== "pending") return interaction.reply({ content: "Pedido não encontrado ou já processado.", ephemeral: true });

    if (action === "reject") {
      const modal = new ModalBuilder().setCustomId(`partnership_modal_reject_${id}`).setTitle("Recusar Parceria");
      const input = new TextInputBuilder().setCustomId("reason").setLabel("Motivo").setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return await interaction.showModal(modal);
    }

    if (action === "approve") {
      // 1. Painel de Seleção de Canal
      const rowChannel = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`sel_chan_${id}`)
          .setPlaceholder("Selecione o canal para postar")
          .addChannelTypes(ChannelType.GuildText)
      );

      const promptMsg = await interaction.reply({
        content: "✅ **Aprovação Iniciada!**\nPrimeiro, selecione o canal onde a parceria será postada:",
        components: [rowChannel],
        ephemeral: true,
        fetchReply: true
      });

      try {
        // Aguarda escolha do canal
        const chanInter = await promptMsg.awaitMessageComponent({
          filter: i => i.user.id === interaction.user.id && i.customId === `sel_chan_${id}`,
          time: 60000
        });
        const targetChan = interaction.guild.channels.cache.get(chanInter.values[0]);

        // 2. Painel de Seleção de Menção
        const rowRole = new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(`sel_role_${id}`)
            .setPlaceholder("Selecione um cargo para mencionar...")
        );
        const rowButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ping_everyone_${id}`).setLabel("@everyone").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`ping_here_${id}`).setLabel("@here").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`ping_none_${id}`).setLabel("Sem menção").setStyle(ButtonStyle.Danger)
        );

        await chanInter.update({
          content: `✅ Canal ${targetChan} selecionado!\nAgora, escolha quem será mencionado na postagem:`,
          components: [rowRole, rowButtons]
        });

        // Aguarda escolha do cargo ou botão
        const mentionInter = await promptMsg.awaitMessageComponent({
          filter: i => i.user.id === interaction.user.id,
          time: 60000
        });

        let pingText = "";
        if (mentionInter.isRoleSelectMenu()) {
          pingText = `<@&${mentionInter.values[0]}>`;
        } else if (mentionInter.isButton()) {
          if (mentionInter.customId.includes("everyone")) pingText = "@everyone";
          if (mentionInter.customId.includes("here")) pingText = "@here";
          if (mentionInter.customId.includes("none")) pingText = "Sem menção";
        }

        // 3. Formatação Final: Link e Remoção Severa
        let finalLink = data.inviteLink.trim();
        // Garante que o link oficial do parceiro tenha https://
        if (!finalLink.startsWith('http')) finalLink = `https://${finalLink}`;

        // Regex agressiva que detecta qualquer URL ou domínio (HTTP, HTTPS, WWW, ou domínios crus)
        const regexQualquerLink = /(https?:\/\/[^\s]+)|([-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*))/gi;
        
        // Remove literalmente qualquer link da descrição
        const cleanDesc = data.description.replace(regexQualquerLink, "[Link Removido]");

        // 4. Montando as Partes Separadas (Fora e Dentro da Embed)
        
        // DADOS FORA DA EMBED (Texto solto)
        const textoFora = `**Nome do Servidor:** ${data.serverName}\n**Representante:** <@${data.requesterId}>\n**Responsável:** <@${interaction.user.id}>\n**Ping:** ${pingText}\n**Link:** ${finalLink}`;

        // DADOS DENTRO DA EMBED (Apenas Descrição Limpa e Banner)
        const embedParceria = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setDescription(`--- {☩} NOVA PARCERIA FECHADA! {☩} ---\n\n${cleanDesc}\n\n{☩}----------multimap 🤝 multimap----------{☩}`);

        if (data.banner && data.banner.startsWith("http")) {
          embedParceria.setImage(data.banner);
        }

        // 5. Envio e Atualização
        await targetChan.send({ content: textoFora, embeds: [embedParceria] });

        await partnersStore.update(id, c => ({ ...c, status: "accepted", processedBy: interaction.user.id }));
        await staffStatsStore.update(interaction.user.id, c => ({ ...c, approved: (c?.approved || 0) + 1 }));

        await interaction.message.edit({ 
            content: `✅ Aprovada por <@${interaction.user.id}> e postada em ${targetChan}`, 
            components: [], 
            embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x00FF00)] 
        });

        await mentionInter.update({ content: "🚀 Parceria enviada com sucesso para o canal público!", components: [] });

      } catch (error) {
        await interaction.editReply({ content: "⏳ Tempo esgotado para selecionar o canal/menção. Clique em Aprovar novamente se quiser tentar de novo.", components: [] }).catch(() => null);
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
    if (user) await user.send(`Sua parceria com **${data.serverName}** foi recusada. Motivo: ${reason}`).catch(() => null);

    const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xFF0000).addFields({ name: "Motivo", value: reason });

    return interaction.editReply({ content: `❌ Recusada por <@${interaction.user.id}>`, components: [], embeds: [embed] });
  }
};