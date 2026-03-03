const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vip")
    .setDescription("Gerencie seus benefícios VIP")
    .addSubcommand(s => s.setName("info").setDescription("Ver seus benefícios e validade"))
    .addSubcommand(s => s.setName("call").setDescription("Renomeia sua Call VIP").addStringOption(o => o.setName("nome").setDescription("Novo nome").setRequired(true)))
    .addSubcommand(s => s.setName("dar").setDescription("Dá um VIP da sua cota para alguém (Dama)").addUserOption(o => o.setName("membro").setDescription("Quem recebe").setRequired(true)))
    .addSubcommand(s => s.setName("customizar").setDescription("Edita seu cargo exclusivo").addStringOption(o => o.setName("nome").setDescription("Nome")).addStringOption(o => o.setName("cor").setDescription("Cor HEX (Ex: #FF0000)"))),

  async execute(interaction) {
    const { vip: vipService, vipRole, vipChannel } = interaction.client.services;
    const tier = await vipService.getMemberTier(interaction.member);

    if (!tier) return interaction.reply({ content: "❌ Você não possui um VIP ativo.", ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === "info") {
      const data = await vipService.getVipData(interaction.guildId, interaction.user.id);
      const embed = new EmbedBuilder().setTitle(`💎 Seu VIP: ${tier.name}`).setColor("Gold")
        .addFields(
            { name: "⏳ Expiração", value: `<t:${Math.floor(data.expiresAt/1000)}:R>`, inline: true },
            { name: "👨‍👩‍👧 Cotas de VIP", value: `${(data.vipsDados || []).length}/${tier.primeiras_damas}`, inline: true },
            { name: "💰 Bônus Daily", value: `+${tier.daily_bonus} moedas`, inline: true }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "call") {
      if (!tier.canCall) return interaction.reply("❌ Seu VIP não permite call privada.");
      await interaction.deferReply({ ephemeral: true });
      await vipChannel.ensureVipChannels(interaction.user.id, { guildId: interaction.guildId });
      await vipChannel.updateChannelName(interaction.user.id, interaction.options.getString("nome"), { guildId: interaction.guildId });
      return interaction.editReply("✅ Nome da call atualizado!");
    }

    if (sub === "dar") {
      const target = interaction.options.getMember("membro");
      const settings = await vipService.getSettings(interaction.guildId, interaction.user.id);
      const dados = settings.vipsDados || [];

      if (dados.length >= tier.primeiras_damas) return interaction.reply("❌ Você já atingiu seu limite de cotas.");
      if (!tier.cotaRoleId) return interaction.reply("❌ Erro: Cargo de cota não configurado pela Staff.");

      await target.roles.add(tier.cotaRoleId).catch(() => {});
      dados.push(target.id);
      await vipService.setSettings(interaction.guildId, interaction.user.id, { vipsDados: dados });
      return interaction.reply(`✅ Você deu um VIP para ${target}!`);
    }

    if (sub === "customizar") {
      await interaction.deferReply({ ephemeral: true });
      const res = await vipRole.updatePersonalRole(interaction.user.id, { 
        roleName: interaction.options.getString("nome"), 
        roleColor: interaction.options.getString("cor") 
      }, { guildId: interaction.guildId });
      return interaction.editReply(res.ok ? "✅ Cargo atualizado!" : "❌ Benefício não disponível.");
    }
  }
};
