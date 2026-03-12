const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const { createEmbed } = require("../embeds");
const { logger } = require("../logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipinfo")
    .setDescription("Ver benefícios ativos e painel VIP"),

  async execute(interaction) {
    try {
      const { vip: vipService, vipChannel, vipConfig } = interaction.client.services;

      const tier = await vipService.getMemberTier(interaction.member);
      if (!tier) {
        return interaction.reply({ content: "❌ Você não é VIP.", ephemeral: true });
      }

      await vipChannel.ensureVipChannels(interaction.user.id, { guildId: interaction.guildId }).catch((err) => {
        logger.warn({ err, userId: interaction.user.id }, "Falha ao garantir canais VIP no /vipinfo");
      });

      const data = await vipService.getVipData(interaction.guildId, interaction.user.id);
      const settings = (await vipService.getSettings(interaction.guildId, interaction.user.id)) || {};
      const cotasUsadas = settings.cotasUsadas || {};
      const tierConfig = await vipConfig.getTierConfig(interaction.guildId, tier.id);

      const regras = Array.isArray(tierConfig?.cotasConfig)
        ? tierConfig.cotasConfig
        : tierConfig?.cotasConfig
        ? [tierConfig.cotasConfig]
        : [];

      let cotasText = regras
        .map((r) => {
          if (r.modo === "A") return `🔹 **Modo A:** ${r.quantidade} cota(s) de tiers inferiores`;
          if (r.modo === "B") {
            const used = cotasUsadas[r.targetTierId] || 0;
            return `🔸 **Modo B:** ${used}/${r.quantidade} cota(s) do tier \`${r.targetTierId}\``;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");

      if (!cotasText) cotasText = "Nenhuma cota configurada para o seu plano.";

      const embed = createEmbed({
        title: "💎 Painel VIP",
        color: "Gold",
        fields: [
          { name: "👑 Seu Plano", value: `\`${tier.name || tier.id}\``, inline: true },
          {
            name: "⏳ Expiração",
            value: data?.expiresAt ? `<t:${Math.floor(data.expiresAt / 1000)}:R>` : "Permanente",
            inline: true,
          },
          { name: "🎁 Minhas Cotas", value: cotasText, inline: false },
        ],
      });

      // customIds use the "vip_" prefix so the interactionCreate router forwards
      // button and select-menu interactions to the existing vip.js handlers.
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`vip_action_${interaction.guildId}_${interaction.user.id}`)
        .setPlaceholder("Escolha uma ação")
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel("Criar/Sincronizar Canais").setValue("create_channels").setEmoji("🗂️"),
          new StringSelectMenuOptionBuilder().setLabel("Renomear Call Privada").setValue("call_rename").setEmoji("✏️"),
          new StringSelectMenuOptionBuilder().setLabel("Customizar Cargo Pessoal").setValue("custom_role").setEmoji("🎨"),
          new StringSelectMenuOptionBuilder().setLabel("Dar VIP da sua cota").setValue("give_quota").setEmoji("🎁"),
          new StringSelectMenuOptionBuilder().setLabel("Gerenciar cotas dadas").setValue("manage_quota").setEmoji("⚙️"),
          new StringSelectMenuOptionBuilder().setLabel("Compartilhar Cargo Personalizado").setValue("share_role").setEmoji("🤝")
        );

      const btnPrimeiraDama = new ButtonBuilder()
        .setCustomId(`vip_btn_primeiradama_${interaction.guildId}_${interaction.user.id}`)
        .setLabel("Primeira Dama")
        .setEmoji("👑")
        .setStyle(ButtonStyle.Secondary);

      return interaction.reply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(menu),
          new ActionRowBuilder().addComponents(btnPrimeiraDama),
        ],
        ephemeral: true,
      });
    } catch (err) {
      logger.error({ err }, "Erro no comando /vipinfo");
      const payload = { content: "❌ Ocorreu um erro ao abrir o painel VIP.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp(payload).catch(() => {});
      }
      return interaction.reply(payload).catch(() => {});
    }
  },
};
