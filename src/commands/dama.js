const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
// Nota: Certifique-se que esses helpers de embed existem no seu projeto
// Se não existirem, o bot vai dar erro de 'module not found'.

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dama")
    .setDescription("Sistema de Primeira Dama")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Define sua primeira dama")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Sua dama").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove uma dama específica")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Dama específica").setRequired(true))
    ),

  async execute(interaction) {
    const { vip: vipService } = interaction.client.services;
    const sub = interaction.options.getSubcommand();
    const user = interaction.user;
    const guildId = interaction.guildId;

    // Pega o Tier do usuário para saber o limite
    const tier = await vipService.getMemberTier(interaction.member);
    if (!tier) {
      return interaction.reply({ content: "❌ Apenas membros VIP podem ter damas.", ephemeral: true });
    }

    const maxDamas = tier.primeiras_damas || 0;

    if (sub === "set") {
      const alvo = interaction.options.getMember("usuario");
      const settings = await vipService.getSettings(guildId, user.id) || {};
      const damasAtuais = settings.vipsDados || [];

      if (maxDamas <= 0) {
        return interaction.reply({ content: "❌ Seu plano VIP não inclui cotas de damas.", ephemeral: true });
      }

      if (damasAtuais.length >= maxDamas) {
        return interaction.reply({ content: `❌ Limite de **${maxDamas}** damas atingido.`, ephemeral: true });
      }

      if (alvo.id === user.id) return interaction.reply({ content: "❌ Você não pode ser sua própria dama.", ephemeral: true });
      if (alvo.user.bot) return interaction.reply({ content: "❌ Bots não podem ser damas.", ephemeral: true });

      // Adiciona o cargo de cota definido no Tier
      if (tier.cotaRoleId) {
        await alvo.roles.add(tier.cotaRoleId).catch(() => {});
      }

      damasAtuais.push(alvo.id);
      await vipService.setSettings(guildId, user.id, { vipsDados: damasAtuais });

      return interaction.reply({ content: `✅ ${alvo} agora é sua dama! (${damasAtuais.length}/${maxDamas})`, ephemeral: true });
    }

    if (sub === "remove") {
      const alvo = interaction.options.getMember("usuario");
      const settings = await vipService.getSettings(guildId, user.id) || {};
      let damasAtuais = settings.vipsDados || [];

      if (!damasAtuais.includes(alvo.id)) {
        return interaction.reply({ content: "❌ Este usuário não está na sua lista de damas.", ephemeral: true });
      }

      // Remove o cargo
      if (tier.cotaRoleId) {
        await alvo.roles.remove(tier.cotaRoleId).catch(() => {});
      }

      damasAtuais = damasAtuais.filter(id => id !== alvo.id);
      await vipService.setSettings(guildId, user.id, { vipsDados: damasAtuais });

      return interaction.reply({ content: `✅ ${alvo} removida da sua lista.`, ephemeral: true });
    }
  }
};
