const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Loja do servidor")
    .addSubcommand((sub) =>
      sub
        .setName("vip")
        .setDescription("Ver planos VIP disponíveis")
    )
    .addSubcommand((sub) =>
      sub
        .setName("buy")
        .setDescription("Comprar item da loja")
        .addStringOption((opt) => 
          opt.setName("item")
            .setDescription("Item para comprar")
            .setRequired(true)
            .addChoices(
              { name: "vip_days", value: "vip_days" },
              { name: "role_color", value: "role_color" },
              { name: "custom_name", value: "custom_name" }
            )
        )
        .addIntegerOption((opt) => 
          opt.setName("quantity")
            .setDescription("Quantidade")
            .setMinValue(1)
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const economyService = interaction.client.services.economy;
    const vipService = interaction.client.services.vip;
    const vipConfig = interaction.client.services.vipConfig;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    if (sub === "vip") {
      // Mostrar planos VIP disponíveis
      const tiers = await vipConfig.getGuildTiers(guildId);
      
      if (!tiers || Object.keys(tiers).length === 0) {
        return interaction.reply({
          embeds: [createErrorEmbed("Não há planos VIP disponíveis neste servidor.")],
          ephemeral: true,
        });
      }

      const tierEntries = [];
      for (const tierId of Object.keys(tiers)) {
        const tier = await vipConfig.getTierConfig(guildId, tierId);
        if (!tier) continue;
        if (!tier.preco_shop || tier.preco_shop <= 0) continue;
        tierEntries.push(tier);
      }

      if (tierEntries.length === 0) {
        return interaction.reply({
          embeds: [createErrorEmbed("Nenhum Tier com `preco_shop > 0` foi configurado ainda. Use /vipadmin tier para configurar.")],
          ephemeral: true,
        });
      }

      tierEntries.sort((a, b) => (a.preco_shop || 0) - (b.preco_shop || 0));

      const fields = tierEntries.map((t) => ({
        name: `💎 ${t.name || t.id}`,
        value: [
          `Preço: **${t.preco_shop} 🪙**`,
          `Daily Extra: **+${t.valor_daily_extra || 0} 🪙**`,
          `Bônus Inicial: **+${t.bonus_inicial || 0} 🪙**`,
          `Limites: Família **${t.limite_familia ?? t.maxFamilyMembers ?? 0}** | Damas **${t.limite_damas ?? t.maxDamas ?? 1}**`,
          `Presentear: ${t.pode_presentear ? "✅" : "❌"}`,
          `Ignorar Slowmode: ${t.ignorar_slowmode ? "✅" : "❌"}`,
          `Criar Call VIP: ${t.criar_call_vip ? "✅" : "❌"}`,
        ].join("\n"),
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`shop_vip_buy_${guildId}`)
        .setPlaceholder("Selecione um VIP para comprar")
        .addOptions(
          tierEntries.slice(0, 25).map((t) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(`${t.name || t.id} - ${t.preco_shop} 🪙`)
              .setValue(t.id)
          )
        );

      const row = new ActionRowBuilder().addComponents(menu);

      return interaction.reply({
        embeds: [createEmbed({
          title: "💎 Planos VIP Disponíveis",
          description: "Selecione no menu abaixo para comprar.",
          fields,
          color: 0x9b59b6,
          footer: { text: "Compra via /shop vip" }
        })],
        components: [row],
        ephemeral: true,
      });
    }

    if (sub === "buy") {
      const item = interaction.options.getString("item");
      const quantity = interaction.options.getInteger("quantity");

      if (item === "vip_days") {
        // Redirecionar para o comando vipbuy aprimorado
        return interaction.reply({
          embeds: [createEmbed({
            title: "💳 Compra de VIP",
            description: "Para comprar dias de VIP, use o comando `/vipbuy`.\n\n" +
                       "Ele oferece uma interface mais completa com todos os planos disponíveis e " +
                       "opções de pagamento em WDA Coins ou R$.",
            color: 0x3498db
          })],
          ephemeral: true
        });
      }

      if (item === "role_color") {
        const cost = quantity * 5000; // 5000 moedas por cor
        const balance = await economyService.getBalance(userId);
        
        if (balance.coins < cost) {
          return interaction.reply({
            embeds: [createErrorEmbed(`Saldo insuficiente! Você precisa de **${cost} 🪙** mas tem apenas **${balance.coins} 🪙**.`)],
            ephemeral: true
          });
        }

        await economyService.removeCoins(userId, cost);
        
        return interaction.reply({
          embeds: [createSuccessEmbed(`Você comprou **${quantity}** mudança(s) de cor de cargo por **${cost} 🪙**!\n\nUse \`/vip panel\` para personalizar seu cargo.`)],
          ephemeral: true
        });
      }

      if (item === "custom_name") {
        const cost = quantity * 10000; // 10000 moedas por nome personalizado
        const balance = await economyService.getBalance(userId);
        
        if (balance.coins < cost) {
          return interaction.reply({
            embeds: [createErrorEmbed(`Saldo insuficiente! Você precisa de **${cost} 🪙** mas tem apenas **${balance.coins} 🪙**.`)],
            ephemeral: true
          });
        }

        await economyService.removeCoins(userId, cost);
        
        return interaction.reply({
          embeds: [createSuccessEmbed(`Você comprou **${quantity}** alteração(ões) de nome personalizado por **${cost} 🪙**!\n\nUse \`/vip panel\` para personalizar seu nome.`)],
          ephemeral: true
        });
      }

      // Item não reconhecido
      return interaction.reply({
        embeds: [createErrorEmbed("Item não encontrado na loja.")],
        ephemeral: true
      });
    }
  }
  ,

  async handleSelectMenu(interaction) {
    if (!interaction.customId.startsWith("shop_vip_buy_")) return;
    if (!interaction.inGuild()) {
      return interaction.reply({ embeds: [createErrorEmbed("Use este menu em um servidor.")], ephemeral: true });
    }

    const guildId = interaction.guildId;
    const tierId = interaction.values?.[0];
    if (!tierId) {
      return interaction.reply({ embeds: [createErrorEmbed("Seleção inválida." )], ephemeral: true });
    }

    const economyService = interaction.client.services.economy;
    const vipService = interaction.client.services.vip;
    const vipConfig = interaction.client.services.vipConfig;
    if (!economyService || !vipService || !vipConfig) {
      return interaction.reply({ embeds: [createErrorEmbed("Serviços indisponíveis.")], ephemeral: true });
    }

    const tier = await vipConfig.getTierConfig(guildId, tierId);
    if (!tier || !tier.preco_shop || tier.preco_shop <= 0) {
      return interaction.reply({ embeds: [createErrorEmbed("Tier inválido ou não está à venda.")], ephemeral: true });
    }

    const member = interaction.member;
    const currentTier = await vipService.getUserTierConfig({ guildId, member });
    if (currentTier?.preco_shop && currentTier.preco_shop > tier.preco_shop) {
      return interaction.reply({
        embeds: [createErrorEmbed(`Você já possui um VIP superior (**${currentTier.name || currentTier.id}**).`) ],
        ephemeral: true,
      });
    }

    const balance = await economyService.getBalance(guildId, interaction.user.id);
    if ((balance.coins || 0) < tier.preco_shop) {
      return interaction.reply({
        embeds: [createErrorEmbed(`Saldo insuficiente. Você precisa de **${tier.preco_shop} 🪙** e tem **${balance.coins || 0} 🪙**.`)],
        ephemeral: true,
      });
    }

    const ok = await economyService.removeCoins(guildId, interaction.user.id, tier.preco_shop);
    if (!ok) {
      return interaction.reply({ embeds: [createErrorEmbed("Falha ao cobrar moedas.")], ephemeral: true });
    }

    const days = Number.isFinite(tier.days) ? tier.days : 0;
    await vipService.addVip(guildId, interaction.user.id, { days: days > 0 ? days : undefined, tierId: tier.id });

    // Roles
    try {
      const vipGuildConfig = vipService.getGuildConfig(guildId) || {};
      if (vipGuildConfig.vipRoleId) {
        await member.roles.add(vipGuildConfig.vipRoleId).catch(() => {});
      }
      if (tier.roleId) {
        await member.roles.add(tier.roleId).catch(() => {});
      }
    } catch {
      // ignore
    }

    // Bonus inicial
    if (tier.bonus_inicial && tier.bonus_inicial > 0) {
      await economyService.addCoins(guildId, interaction.user.id, tier.bonus_inicial);
    }

    return interaction.reply({
      embeds: [createSuccessEmbed(`VIP **${tier.name || tier.id}** comprado com sucesso por **${tier.preco_shop} 🪙**.`)],
      ephemeral: true,
    });
  }
};
