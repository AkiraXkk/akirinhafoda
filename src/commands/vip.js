const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vip")
    .setDescription("Gerencie seus benefícios VIP")
    // Subcomando Info
    .addSubcommand(sub => 
      sub.setName("info")
         .setDescription("Ver seus status e validade do VIP"))
    // Subcomando Call
    .addSubcommand(sub => 
      sub.setName("call")
         .setDescription("Renomear sua call VIP")
         .addStringOption(opt => 
            opt.setName("nome")
               .setDescription("Novo nome da call")
               .setRequired(true)))
    // Subcomando Dar
    .addSubcommand(sub => 
      sub.setName("dar")
         .setDescription("Dar um VIP da sua cota para alguém")
         .addUserOption(opt => 
            opt.setName("membro")
               .setDescription("Quem receberá o VIP")
               .setRequired(true)))
    // Subcomando Customizar
    .addSubcommand(sub => 
      sub.setName("customizar")
         .setDescription("Editar seu cargo personalizado")
         .addStringOption(opt => 
            opt.setName("nome")
               .setDescription("Novo nome do cargo"))
         .addStringOption(opt => 
            opt.setName("cor")
               .setDescription("Cor em HEX (Ex: #FF0000)"))),

  async execute(interaction) {
    const { vip: vipService, vipRole, vipChannel } = interaction.client.services;
    const tier = await vipService.getMemberTier(interaction.member);

    if (!tier) return interaction.reply({ content: "❌ Você não possui um VIP ativo.", ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === "info") {
      const data = await vipService.getVipData(interaction.guildId, interaction.user.id);
      const embed = new EmbedBuilder()
        .setTitle(`💎 Seu VIP: ${tier.name}`)
        .setColor("Gold")
        .addFields(
            { name: "⏳ Expiração", value: `<t:${Math.floor(data.expiresAt/1000)}:R>`, inline: true },
            { name: "👨‍👩‍👧 Cotas Usadas", value: `${(data.vipsDados || []).length}/${tier.primeiras_damas || 0}`, inline: true }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "call") {
      if (!tier.canCall) return interaction.reply({ content: "❌ Seu VIP não permite call privada.", ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      const res = await vipChannel.updateChannelName(interaction.user.id, interaction.options.getString("nome"), { guildId: interaction.guildId });
      return interaction.editReply(res.ok ? "✅ Nome da call atualizado!" : `❌ ${res.reason}`);
    }

    if (sub === "dar") {
      const target = interaction.options.getMember("membro");
      const settings = await vipService.getSettings(interaction.guildId, interaction.user.id) || {};
      const dados = settings.vipsDados || [];

      if (dados.length >= (tier.primeiras_damas || 0)) return interaction.reply("❌ Você atingiu seu limite de cotas.");
      if (!tier.cotaRoleId) return interaction.reply("❌ Cargo de cota não configurado pela Staff.");

      await target.roles.add(tier.cotaRoleId).catch(() => {});
      dados.push(target.id);
      await vipService.setSettings(interaction.guildId, interaction.user.id, { vipsDados: dados });
      return interaction.reply(`✅ Você deu um VIP para ${target}!`);
    }

    if (sub === "customizar") {
      if (!tier.hasCustomRole) return interaction.reply({ content: "❌ Seu VIP não permite cargo personalizado.", ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      const res = await vipRole.updatePersonalRole(interaction.user.id, { 
        roleName: interaction.options.getString("nome"), 
        roleColor: interaction.options.getString("cor") 
      }, { guildId: interaction.guildId });
      return interaction.editReply(res.ok ? "✅ Cargo atualizado!" : "❌ Erro ao atualizar cargo.");
    }
  }
};
