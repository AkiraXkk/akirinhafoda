const { 
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, 
  ButtonStyle, EmbedBuilder 
} = require("discord.js");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig } = require("../config/guildConfig");

const partnersStore = createDataStore("partners.json");
const staffStatsStore = createDataStore("staff_stats.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("partnership")
    .setDescription("Sistema de parcerias para membros")
    .addSubcommand(sub =>
      sub.setName("solicitar")
        .setDescription("Solicite uma parceria (Mínimo 350 membros)")
        .addStringOption(o => o.setName("servidor").setDescription("Nome do seu servidor").setRequired(true))
        .addStringOption(o => o.setName("convite").setDescription("Link de convite").setRequired(true))
        .addStringOption(o => o.setName("descricao").setDescription("Descrição do servidor").setRequired(true))
        .addIntegerOption(o => o.setName("membros").setDescription("Número de membros").setRequired(true).setMinValue(350))
        .addStringOption(o => o.setName("banner").setDescription("Link da imagem/banner (opcional)"))
    )
    .addSubcommand(sub =>
      sub.setName("listar")
        .setDescription("Lista todas as parcerias ativas")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guildId, user, guild } = interaction;
    const guildConfig = await getGuildConfig(guildId) || {};
    const pConfig = guildConfig.partnership || { enabledForAll: false };

    if (sub === "solicitar") {
      if (!pConfig.enabledForAll) return interaction.reply({ embeds: [createErrorEmbed("O sistema está desativado no momento.")], ephemeral: true });
      if (!pConfig.logChannelId) return interaction.reply({ embeds: [createErrorEmbed("Configuração pendente pela Staff.")], ephemeral: true });

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
        .setTitle("📩 Nova Solicitação")
        .setColor(0xFFFF00)
        .addFields(
            { name: "ID", value: `\`${data.id}\``, inline: true },
            { name: "Servidor", value: data.serverName, inline: true },
            { name: "Membros", value: `${data.memberCount}`, inline: true }
        )
        .setDescription(`**Descrição:**\n${data.description}`);

      if (data.banner) embed.setImage(data.banner);
      await logChan.send({ content: pConfig.staffRoles?.map(id => `<@&${id}>`).join(" ") || "Staff", embeds: [embed], components: [row] });
      return interaction.reply({ embeds: [createSuccessEmbed("Solicitação enviada com sucesso!")], ephemeral: true });
    }

    if (sub === "listar") {
      const partners = await partnersStore.load();
      const active = Object.values(partners).filter(p => p.status === "accepted");
      if (active.length === 0) return interaction.reply({ content: "Nenhuma parceria ativa.", ephemeral: true });
      return interaction.reply({ content: `**Parcerias Ativas:**\n${active.map(p => `\`${p.id}\` - ${p.serverName}`).join("\n")}`, ephemeral: true });
    }
  },

  async handleButton(interaction) {
    const [command, action, id] = interaction.customId.split("_");
    if (command !== "partnership") return;

    const partners = await partnersStore.load();
    const data = partners[id];
    const guildConfig = await getGuildConfig(interaction.guildId);
    const pConfig = guildConfig.partnership || {};

    if (!data || data.status !== "pending") return interaction.reply({ content: "Já processado.", ephemeral: true });

    if (action === "reject") {
        await partnersStore.update(id, c => ({ ...c, status: "rejected", processedBy: interaction.user.id }));
        return interaction.update({ content: `❌ Recusada por: <@${interaction.user.id}>`, components: [], embeds: [interaction.message.embeds[0].setColor(0xFF0000)] });
    }

    if (action === "approve") {
      await interaction.reply({ content: "Mencione o canal de postagem:", ephemeral: true });
      const collector = interaction.channel.createMessageCollector({ filter: m => m.author.id === interaction.user.id, max: 1, time: 20000 });

      collector.on('collect', async m => {
        const targetChan = m.mentions.channels.first();
        if (!targetChan) return;

        let rId = data.memberCount >= 1000 ? pConfig.ranks?.ouro : (data.memberCount >= 750 ? pConfig.ranks?.prata : pConfig.ranks?.bronze);
        const memberReq = await interaction.guild.members.fetch(data.requesterId).catch(() => null);
        if (memberReq && rId) await memberReq.roles.add(rId).catch(() => null);
        
        await partnersStore.update(id, c => ({ ...c, status: "accepted", processedBy: interaction.user.id, acceptedAt: new Date().toISOString() }));
        await staffStatsStore.update(interaction.user.id, c => ({ ...c, approved: (c?.approved || 0) + 1 }));

        const postEmbed = new EmbedBuilder().setColor(0x00FF00).setDescription(data.description);
        if (data.banner) postEmbed.setImage(data.banner);

        await targetChan.send({ content: `✅ **Parceria:** ${data.serverName}\n🔗 **Link:** ${data.inviteLink}`, embeds: [postEmbed] });
        await interaction.message.edit({ content: `✅ Aprovada por: <@${interaction.user.id}>`, components: [] });
        m.delete().catch(() => null);
      });
    }
  }
};