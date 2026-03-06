const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
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
      sub.setName("listar")
        .setDescription("lista todas as parcerias ativas")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guildId, user, guild } = interaction;
    const guildConfig = await getGuildConfig(guildId) || {};
    const pConfig = guildConfig.partnership || { enabledForAll: false, staffRoles: [] };

    if (sub === "solicitar") {
      if (!pConfig.enabledForAll) return interaction.reply({ embeds: [createErrorEmbed("O sistema de parcerias está desativado no momento.")], ephemeral: true });
      if (!pConfig.logChannelId) return interaction.reply({ embeds: [createErrorEmbed("O canal de logs não foi configurado pela staff.")], ephemeral: true });

      const data = {
        id: `PARC${Math.floor(Math.random() * 90000) + 10000}`,
        requesterId: user.id,
        serverName: interaction.options.getString("servidor"),
        inviteLink: interaction.options.getString("convite"),
        description: interaction.options.getString("descricao").replace(/@/g, ""),
        memberCount: interaction.options.getInteger("membros"),
        banner: interaction.options.getString("banner"),
        status: "pending",
        date: new Date().toISOString()
      };

      await partnersStore.update(data.id, () => data);
      const logChan = guild.channels.cache.get(pConfig.logChannelId);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`partnership_approve_${data.id}`).setLabel("Aprovar").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`partnership_reject_${data.id}`).setLabel("Recusar").setStyle(ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setTitle("Nova Solicitação de Parceria")
        .setColor(0xFFFF00)
        .addFields(
            { name: "ID", value: data.id, inline: true },
            { name: "Representante", value: `<@${user.id}>`, inline: true },
            { name: "Servidor", value: data.serverName, inline: true },
            { name: "Membros", value: `${data.memberCount}`, inline: true },
            { name: "Link", value: data.inviteLink, inline: false }
        )
        .setDescription(`**Descrição:**\n${data.description}`);

      if (data.banner && data.banner.startsWith("http")) embed.setImage(data.banner);

      const mention = Array.isArray(pConfig.staffRoles) && pConfig.staffRoles.length > 0 
        ? pConfig.staffRoles.map(id => `<@&${id}>`).join(" ") 
        : "Staff";

      if (logChan) {
        await logChan.send({ content: mention, embeds: [embed], components: [row] });
      }

      return interaction.reply({ embeds: [createSuccessEmbed("Sua solicitação foi enviada para análise.")], ephemeral: true });
    }

    if (sub === "listar") {
      const partners = await partnersStore.load();
      const active = Object.values(partners).filter(p => p.status === "accepted");
      if (active.length === 0) return interaction.reply({ content: "Não há parcerias ativas.", ephemeral: true });

      const list = active.map(p => `${p.id} - ${p.serverName}`).join("\n");
      return interaction.reply({ content: `Parcerias ativas:\n\n${list}`, ephemeral: true });
    }
  },

  async handleButton(interaction) {
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const id = parts[2];

    const partners = await partnersStore.load();
    const data = partners[id];
    const guildConfig = await getGuildConfig(interaction.guildId);
    const pConfig = guildConfig?.partnership || {};

    if (!data || data.status !== "pending") return interaction.reply({ content: "Esta solicitação já foi processada.", ephemeral: true });

    if (action === "reject") {
        await partnersStore.update(id, c => ({ ...c, status: "rejected", processedBy: interaction.user.id }));
        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xFF0000);
        return interaction.update({ content: `Recusada por: <@${interaction.user.id}>`, components: [], embeds: [originalEmbed] });
    }

    if (action === "approve") {
      await interaction.reply({ content: "Mencione o canal para postagem.", ephemeral: true });

      const filter = m => m.author.id === interaction.user.id && m.mentions.channels.size > 0;
      const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 30000 });

      collector.on('collect', async m => {
        const targetChan = m.mentions.channels.first();

        // Lógica de cargo de ranking (opcional conforme seu sistema)
        const memberReq = await interaction.guild.members.fetch(data.requesterId).catch(() => null);
        if (memberReq && pConfig.ranks) {
          let rank = data.memberCount >= 1000 ? pConfig.ranks.ouro : data.memberCount >= 750 ? pConfig.ranks.prata : pConfig.ranks.bronze;
          if (rank) await memberReq.roles.add(rank).catch(() => null);
        }

        await partnersStore.update(id, c => ({ ...c, status: "accepted", processedBy: interaction.user.id, acceptedAt: new Date().toISOString() }));
        await staffStatsStore.update(interaction.user.id, c => ({ ...c, approved: (c?.approved || 0) + 1 }));

        // Montagem da Embed idêntica à imagem enviada
        const postEmbed = new EmbedBuilder()
          .setColor(0x2ecc71) // Verde igual à imagem
          .setDescription(
            `--- {☩} NOVA PARCERIA FECHADA! {☩} ---\n\n` +
            `🤝 **Temos o prazer de anunciar uma nova conexão!**\n\n` +
            `✅ **Server:** ${data.serverName}\n` +
            `👤 **Representante:** <@${data.requesterId}>\n` +
            `🛡️ **Responsável:** <@${interaction.user.id}>\n\n` +
            `${data.description}\n\n` +
            `**Link:** ${data.inviteLink}\n\n` +
            `⚠️ *Lembramos que todos os nossos parceiros seguem nossas diretrizes de segurança*\n\n` +
            `{☩}----------multimap 🤝 multimap----------{☩}`
          );

        if (data.banner && data.banner.startsWith("http")) postEmbed.setImage(data.banner);

        await targetChan.send({ content: `<@&${pConfig.pingRole || interaction.guild.id}>`, embeds: [postEmbed] });

        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x00FF00);
        await interaction.message.edit({ content: `Aprovada por: <@${interaction.user.id}>`, components: [], embeds: [originalEmbed] });
        m.delete().catch(() => null);
      });
    }
  }
};
