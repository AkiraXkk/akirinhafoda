const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { createErrorEmbed, createSuccessEmbed } = require("../embeds");

const PREFIX = "loja_vip";

function buildShopEmbed(tiers) {
  const sorted = Object.values(tiers).sort((a, b) => a.price - b.price);
  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle("🛒 Loja VIP Dinâmica")
    .setDescription("Selecione um tier VIP abaixo e confirme a compra.")
    .addFields(
      sorted.length
        ? sorted.map((tier) => ({
            name: `${tier.name} • ${tier.price} 🪙`,
            value: `Cargo: <@&${tier.roleId}>\nXP: ${tier.multiplicadorXp}x\nDaily: +${tier.bonusDaily}%`,
            inline: true,
          }))
        : [{ name: "Sem tiers", value: "Use /vipadmin tier para cadastrar ao menos um tier VIP." }],
    )
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("loja")
    .setDescription("Loja dinâmica de tiers VIP")
    .addSubcommand((sub) => sub.setName("vip").setDescription("Abre o painel da loja VIP")),

  async execute(interaction, services) {
    const sub = interaction.options.getSubcommand();
    if (sub !== "vip") return;

    const vipConfig = services?.vipConfig;
    if (!vipConfig) {
      return interaction.reply({ embeds: [createErrorEmbed("Serviço VIP indisponível no momento.")], ephemeral: true });
    }

    const tiers = await vipConfig.getGuildTiers(interaction.guildId);
    const tierList = Object.values(tiers);
    if (!tierList.length) {
      return interaction.reply({ embeds: [buildShopEmbed(tiers)], ephemeral: true });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(`${PREFIX}:select`)
      .setPlaceholder("Escolha um tier VIP")
      .addOptions(
        tierList.slice(0, 25).map((tier) => ({
          label: `${tier.name} (${tier.price} moedas)`,
          description: `XP ${tier.multiplicadorXp}x | Daily +${tier.bonusDaily}%`,
          value: tier.roleId,
        })),
      );

    const row = new ActionRowBuilder().addComponents(select);
    return interaction.reply({ embeds: [buildShopEmbed(tiers)], components: [row], ephemeral: true });
  },

  async handleSelectMenu(interaction) {
    if (!interaction.customId.startsWith(`${PREFIX}:select`)) return;

    const services = interaction.client.services;
    const tierId = interaction.values[0];
    const vipConfig = services?.vipConfig;
    const tiers = await vipConfig.getGuildTiers(interaction.guildId);
    const tier = tiers[tierId];

    if (!tier) {
      return interaction.reply({ embeds: [createErrorEmbed("Tier inválido ou removido." )], ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}:buy:${tierId}`)
        .setLabel(`Comprar ${tier.name} (${tier.price} 🪙)`)
        .setStyle(ButtonStyle.Success),
    );

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("Confirmar compra VIP")
          .setDescription(`Você selecionou o tier **${tier.name}**. Clique no botão para confirmar.`)
          .addFields(
            { name: "Preço", value: `${tier.price} 🪙`, inline: true },
            { name: "XP", value: `${tier.multiplicadorXp}x`, inline: true },
            { name: "Daily", value: `+${tier.bonusDaily}%`, inline: true },
          ),
      ],
      components: [row],
      ephemeral: true,
    });
  },

  async handleButton(interaction) {
    if (!interaction.customId.startsWith(`${PREFIX}:buy:`)) return;

    const [, , tierId] = interaction.customId.split(":");
    const services = interaction.client.services;
    const vipConfig = services?.vipConfig;
    const economyService = services?.economy;
    const vipService = services?.vip;

    if (!vipConfig || !economyService || !vipService) {
      return interaction.reply({ embeds: [createErrorEmbed("Serviços necessários para compra não estão disponíveis.")], ephemeral: true });
    }

    const tiers = await vipConfig.getGuildTiers(interaction.guildId);
    const tier = tiers[tierId];
    if (!tier) {
      return interaction.reply({ embeds: [createErrorEmbed("Tier não encontrado. Atualize a loja.")], ephemeral: true });
    }

    const balance = await economyService.getBalance(interaction.user.id);
    const price = Number(tier.price || 0);
    if ((balance.coins || 0) < price) {
      return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente. Necessário: ${price} 🪙 | Atual: ${balance.coins || 0} 🪙`)], ephemeral: true });
    }

    const spent = await economyService.spendCoins(interaction.user.id, price);
    if (!spent) {
      return interaction.reply({ embeds: [createErrorEmbed("Falha ao debitar moedas. Tente novamente.")], ephemeral: true });
    }

    await vipService.addVip(interaction.user.id, { tierId, days: 30 });
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (member) {
      await member.roles.add(tierId).catch(() => null);
      const guildConfig = vipService.getGuildConfig(interaction.guildId);
      if (guildConfig?.vipRoleId) {
        await member.roles.add(guildConfig.vipRoleId).catch(() => null);
      }
    }

    return interaction.reply({ embeds: [createSuccessEmbed(`Compra confirmada! Tier **${tier.name}** ativado por 30 dias.`)], ephemeral: true });
  },
};
