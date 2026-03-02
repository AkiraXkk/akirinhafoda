const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const { createErrorEmbed, createSuccessEmbed } = require("../embeds");

const SHOP_SELECT_ID = "shop:vip:select";

function getTierBenefitsText(tier) {
  return [
    `Preço: **${tier.preco_shop || 0}** 🪙`,
    `Daily Extra: **+${tier.valor_daily_extra || 0}** 🪙`,
    `Bônus Inicial: **${tier.bonus_inicial || 0}** 🪙`,
    `Limite Família: **${tier.limite_familia || 0}**`,
    `Limite Damas: **${tier.limite_damas || 0}**`,
    `Pode Presentear: **${tier.pode_presentear ? "Sim" : "Não"}**`,
    `Ignorar Slowmode: **${tier.ignorar_slowmode ? "Sim" : "Não"}**`,
    `Criar Call VIP: **${tier.criar_call_vip ? "Sim" : "Não"}**`,
    `Cor Exclusiva: **${tier.cor_exclusiva || "Não definida"}**`,
  ].join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Loja dinâmica do servidor")
    .addSubcommand((sub) => sub.setName("vip").setDescription("Lista e compra tiers VIP disponíveis")),

  async execute(interaction, services) {
    const vipConfig = services?.vipConfig;
    if (!vipConfig) {
      return interaction.reply({ embeds: [createErrorEmbed("Serviço VIP indisponível.")], ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    if (sub !== "vip") return;

    const tiers = await vipConfig.getGuildTiers(interaction.guildId);
    const purchasable = Object.values(tiers).filter((tier) => Number(tier.preco_shop || 0) > 0);

    if (!purchasable.length) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("🛒 Loja VIP")
            .setDescription("Nenhum tier disponível para compra no momento.")
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(SHOP_SELECT_ID)
      .setPlaceholder("Selecione um tier VIP")
      .addOptions(
        purchasable.slice(0, 25).map((tier) => ({
          label: `${tier.name || tier.id} - ${tier.preco_shop} moedas`,
          description: `Daily +${tier.valor_daily_extra || 0} | Família ${tier.limite_familia || 0} | Damas ${tier.limite_damas || 0}`,
          value: tier.id,
        })),
      );

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle("🛒 Loja VIP")
          .setDescription("Escolha um tier no menu para ver os benefícios e concluir a compra.")
          .addFields(
            purchasable.map((tier) => ({
              name: `💎 ${tier.name || tier.id}`,
              value: getTierBenefitsText(tier),
              inline: false,
            })),
          )
          .setTimestamp(),
      ],
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true,
    });
  },

  async handleSelectMenu(interaction, services) {
    if (interaction.customId !== SHOP_SELECT_ID) return;

    const vipConfig = services?.vipConfig;
    if (!vipConfig) {
      return interaction.reply({ embeds: [createErrorEmbed("Serviço VIP indisponível para seleção.")], ephemeral: true });
    }

    const selectedTierId = interaction.values[0];
    const tiers = await vipConfig.getGuildTiers(interaction.guildId);
    const tier = tiers[selectedTierId];

    if (!tier) {
      return interaction.reply({ embeds: [createErrorEmbed("Tier selecionado não existe mais.")], ephemeral: true });
    }

    const button = new ButtonBuilder()
      .setCustomId(`shop:vip:buy:${selectedTierId}`)
      .setStyle(ButtonStyle.Success)
      .setLabel(`Comprar ${tier.name || tier.id} por ${tier.preco_shop} 🪙`);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle(`Confirmar compra: ${tier.name || tier.id}`)
          .setDescription(getTierBenefitsText(tier)),
      ],
      components: [new ActionRowBuilder().addComponents(button)],
      ephemeral: true,
    });
  },

  async handleButton(interaction, services) {
    if (!interaction.customId.startsWith("shop:vip:buy:")) return;

    const vipConfig = services?.vipConfig;
    const vipService = services?.vip;
    const economyService = services?.economy;

    if (!vipConfig || !vipService || !economyService) {
      return interaction.reply({ embeds: [createErrorEmbed("Serviços necessários para compra não estão disponíveis.")], ephemeral: true });
    }

    const tierId = interaction.customId.split(":")[3];
    const tiers = await vipConfig.getGuildTiers(interaction.guildId);
    const tier = tiers[tierId];

    if (!tier || Number(tier.preco_shop || 0) <= 0) {
      return interaction.reply({ embeds: [createErrorEmbed("Tier indisponível para compra.")], ephemeral: true });
    }

    const currentVip = vipService.getVip(interaction.user.id, { guildId: interaction.guildId });
    if (currentVip?.tierId && tiers[currentVip.tierId]) {
      const currentTier = tiers[currentVip.tierId];
      const currentPrice = Number(currentTier.preco_shop || 0);
      const targetPrice = Number(tier.preco_shop || 0);
      if (targetPrice < currentPrice) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não pode comprar um VIP inferior ao seu VIP atual.")], ephemeral: true });
      }
    }

    const balance = await economyService.getBalance(interaction.user.id);
    if ((balance.coins || 0) < Number(tier.preco_shop)) {
      return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente. Necessário: ${tier.preco_shop} | Atual: ${balance.coins || 0}`)], ephemeral: true });
    }

    const spent = await economyService.removeCoins(interaction.user.id, Number(tier.preco_shop));
    if (!spent) {
      return interaction.reply({ embeds: [createErrorEmbed("Não foi possível debitar o saldo. Tente novamente.")], ephemeral: true });
    }

    const activation = await vipService.addVip(interaction.user.id, {
      guildId: interaction.guildId,
      tierId,
      tierData: tier,
      days: 30,
      source: "shop",
      grantedBy: interaction.user.id,
    });

    if (Number(tier.bonus_inicial || 0) > 0) {
      await economyService.addCoins(interaction.user.id, Number(tier.bonus_inicial));
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (member && tier.roleId) {
      await member.roles.add(tier.roleId).catch(() => null);
    }

    return interaction.reply({
      embeds: [
        createSuccessEmbed(
          `Compra concluída! Tier **${tier.name || tier.id}** ativado${activation.vip.expiresAt ? ` até <t:${Math.floor(activation.vip.expiresAt / 1000)}:F>` : ""}.`,
        ),
      ],
      ephemeral: true,
    });
  },
};
