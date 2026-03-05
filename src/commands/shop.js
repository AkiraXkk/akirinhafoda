const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

function parseCustomId(customId) {
  const parts = String(customId || "").split("_");
  return parts;
}

async function buildCatalogItems(shopService, guildId) {
  const items = (await shopService.listItems(guildId)).filter((i) => i && i.enabled !== false);
  items.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return items;
}

function formatCatalogLine(item) {
  const durationText = item.durationDays && item.durationDays > 0 ? `${item.durationDays}d` : "permanente";
  return `• **${item.id}** (${item.type}) - **${item.priceCoins} 🪙** - ${durationText}`;
}

async function renderCatalogPage({ interaction, shopService, guildId, page = 0 }) {
  const items = await buildCatalogItems(shopService, guildId);
  if (!items.length) {
    return { ok: false, payload: { embeds: [createErrorEmbed("Catálogo vazio.")], components: [] } };
  }

  const perPage = 25;
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const slice = items.slice(safePage * perPage, safePage * perPage + perPage);

  const embed = createEmbed({
    title: "🛒 Catálogo da Loja",
    description: slice.slice(0, 10).map(formatCatalogLine).join("\n"),
    color: 0x9b59b6,
    footer: { text: `Página ${safePage + 1}/${totalPages} • WDA - Todos os direitos reservados` },
    user: interaction.user,
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`shop_catalog_select_${guildId}_${safePage}`)
    .setPlaceholder("Selecione um item para comprar")
    .addOptions(
      slice.map((i) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${i.id} - ${i.priceCoins} 🪙`.substring(0, 80))
          .setValue(i.id)
      )
    );

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_catalog_prev_${guildId}_${safePage}`)
      .setLabel("Anterior")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0),
    new ButtonBuilder()
      .setCustomId(`shop_catalog_next_${guildId}_${safePage}`)
      .setLabel("Próxima")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1)
  );

  return {
    ok: true,
    payload: {
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu), nav],
      ephemeral: true,
    },
  };
}

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
        .setName("catalog")
        .setDescription("Ver catálogo de itens da loja")
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
              { name: "custom_name", value: "custom_name" },
              { name: "catalog", value: "catalog" }
            )
        )
        .addIntegerOption((opt) => 
          opt.setName("quantity")
            .setDescription("Quantidade")
            .setMinValue(1)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("id")
            .setDescription("ID do item do catálogo (quando item=catalog)")
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const economyService = interaction.client.services.economy;
    const vipService = interaction.client.services.vip;
    const vipConfig = interaction.client.services.vipConfig;
    const shopService = interaction.client.services.shop;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    function getTierFixedPrice(tier) {
      if (!tier) return 0;
      if (Number.isFinite(tier.shop_fixed_price) && tier.shop_fixed_price > 0) return tier.shop_fixed_price;
      if (Number.isFinite(tier.preco_shop) && tier.preco_shop > 0) return tier.preco_shop;
      return 0;
    }

    function getTierDefaultDays(tier) {
      if (!tier) return 0;
      if (Number.isFinite(tier.shop_default_days) && tier.shop_default_days > 0) return tier.shop_default_days;
      if (Number.isFinite(tier.days) && tier.days > 0) return tier.days;
      return 0;
    }

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
        if (tier.shop_enabled === false) continue;
        const fixedPrice = getTierFixedPrice(tier);
        const hasPerDay = Number.isFinite(tier.shop_price_per_day) && tier.shop_price_per_day > 0;
        if ((!fixedPrice || fixedPrice <= 0) && !hasPerDay) continue;
        tierEntries.push(tier);
      }

      if (tierEntries.length === 0) {
        return interaction.reply({
          embeds: [createErrorEmbed("Nenhum Tier com `preco_shop > 0` foi configurado ainda. Use /vipadmin tier para configurar.")],
          ephemeral: true,
        });
      }

      tierEntries.sort((a, b) => (getTierFixedPrice(a) || 0) - (getTierFixedPrice(b) || 0));

      const fields = tierEntries.map((t) => ({
        name: `💎 ${t.name || t.id}`,
        value: [
          `Preço: **${getTierFixedPrice(t) || "N/A"} 🪙**`,
          `Daily Extra: **+${t.valor_daily_extra || 0} 🪙**`,
          `Bônus Inicial: **+${t.bonus_inicial || 0} 🪙**`,
          `Limites: Família **${t.limite_familia ?? t.maxFamilyMembers ?? 0}** | Damas **${t.limite_damas ?? t.maxDamas ?? 1}**`,
          `Presentear: ${t.pode_presentear ? "✅" : "❌"}`,
          `Ignorar Slowmode: ${t.ignorar_slowmode ? "✅" : "❌"}`,
          `Criar Call VIP: ${t.criar_call_vip ? "✅" : "❌"}`,
          `Comprar por dia: ${(Number.isFinite(t.shop_price_per_day) && t.shop_price_per_day > 0) ? `✅ (${t.shop_price_per_day} 🪙/dia)` : "❌"}`,
        ].join("\n"),
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`shop_vip_buy_${guildId}`)
        .setPlaceholder("Selecione um VIP para comprar")
        .addOptions(
          tierEntries.slice(0, 25).map((t) =>
            new StringSelectMenuOptionBuilder()
              .setLabel((t.name || t.id).substring(0, 80))
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
          footer: { text: "Compra via /shop vip • WDA - Todos os direitos reservados" }
        })],
        components: [row],
        ephemeral: true,
      });
    }

    if (sub === "catalog") {
      if (!shopService) {
        return interaction.reply({ embeds: [createErrorEmbed("Serviço de loja indisponível.")], ephemeral: true });
      }
      const rendered = await renderCatalogPage({ interaction, shopService, guildId, page: 0 });
      return interaction.reply(rendered.payload);
    }

    if (sub === "buy") {
      const item = interaction.options.getString("item");
      const quantity = interaction.options.getInteger("quantity");
      const catalogId = interaction.options.getString("id");

      if (item === "catalog") {
        if (!shopService) {
          return interaction.reply({ embeds: [createErrorEmbed("Serviço de loja indisponível.")], ephemeral: true });
        }

        if (!catalogId) {
          const items = (await shopService.listItems(guildId)).filter((i) => i.enabled !== false);
          if (!items.length) {
            return interaction.reply({ embeds: [createErrorEmbed("Catálogo vazio.")], ephemeral: true });
          }
          const lines = items.slice(0, 15).map((i) => `• **${i.id}** (${i.type}) - **${i.priceCoins} 🪙** - ${i.durationDays ? `${i.durationDays}d` : "permanente"}`).join("\n");
          return interaction.reply({
            embeds: [createEmbed({
              title: "🛒 Catálogo",
              description: `Use \`/shop buy item:catalog id:<id> quantity:1\`\n\n${lines}`,
              color: 0x9b59b6,
            })],
            ephemeral: true,
          });
        }

        const catalogItem = await shopService.getItem(guildId, catalogId);
        if (!catalogItem || catalogItem.enabled === false) {
          return interaction.reply({ embeds: [createErrorEmbed("Item do catálogo não encontrado ou desativado.")], ephemeral: true });
        }

        const unitPrice = Number(catalogItem.priceCoins || 0);
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
          return interaction.reply({ embeds: [createErrorEmbed("Preço inválido para este item.")], ephemeral: true });
        }

        const total = unitPrice * quantity;
        const balance = await economyService.getBalance(guildId, userId);
        if ((balance.coins || 0) < total) {
          return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente. Você precisa de **${total} 🪙** e tem **${balance.coins || 0} 🪙**.`)], ephemeral: true });
        }

        const ok = await economyService.removeCoins(guildId, userId, total);
        if (!ok) {
          return interaction.reply({ embeds: [createErrorEmbed("Falha ao cobrar moedas.")], ephemeral: true });
        }

        await shopService.deposit(guildId, total, { by: userId, source: "shop", itemId: catalogItem.id, qty: quantity });

        const member = interaction.member;
        const durationDays = Number(catalogItem.durationDays || 0);
        const expiresAt = durationDays > 0 ? Date.now() + (durationDays * 24 * 60 * 60 * 1000) : null;

        // Aplicar item
        if (catalogItem.type === "temporary_role") {
          if (!catalogItem.roleId) {
            return interaction.reply({ embeds: [createErrorEmbed("Item inválido (roleId ausente).")], ephemeral: true });
          }
          await member.roles.add(catalogItem.roleId).catch(() => {});
          if (expiresAt) {
            await shopService.registerGrant(guildId, {
              type: "temporary_role",
              userId,
              roleId: catalogItem.roleId,
              itemId: catalogItem.id,
              quantity,
              expiresAt,
            });
          }
          return interaction.reply({ embeds: [createSuccessEmbed(`Você comprou **${catalogItem.id}** por **${total} 🪙**.`)], ephemeral: true });
        }

        if (catalogItem.type === "channel_access") {
          if (!catalogItem.channelId) {
            return interaction.reply({ embeds: [createErrorEmbed("Item inválido (channelId ausente).")], ephemeral: true });
          }
          const ch = await interaction.guild.channels.fetch(catalogItem.channelId).catch(() => null);
          if (!ch) {
            return interaction.reply({ embeds: [createErrorEmbed("Canal do item não encontrado.")], ephemeral: true });
          }
          await ch.permissionOverwrites.edit(userId, { ViewChannel: true }).catch(() => {});
          if (expiresAt) {
            await shopService.registerGrant(guildId, {
              type: "channel_access",
              userId,
              channelId: catalogItem.channelId,
              itemId: catalogItem.id,
              quantity,
              expiresAt,
            });
          }
          return interaction.reply({ embeds: [createSuccessEmbed(`Acesso ao canal concedido pelo item **${catalogItem.id}** por **${total} 🪙**.`)], ephemeral: true });
        }

        return interaction.reply({ embeds: [createErrorEmbed("Tipo de item ainda não suportado.")], ephemeral: true });
      }

      if (item === "vip_days") {
        // Compra de VIP por dias dentro do /shop (unificado)
        const tiers = await vipConfig.getGuildTiers(guildId);
        if (!tiers || Object.keys(tiers).length === 0) {
          return interaction.reply({ embeds: [createErrorEmbed("Não há planos VIP disponíveis neste servidor.")], ephemeral: true });
        }

        const tierEntries = [];
        for (const tierId of Object.keys(tiers)) {
          const tier = await vipConfig.getTierConfig(guildId, tierId);
          if (!tier) continue;
          if (tier.shop_enabled === false) continue;
          if (!(Number.isFinite(tier.shop_price_per_day) && tier.shop_price_per_day > 0)) continue;
          tierEntries.push(tier);
        }

        if (tierEntries.length === 0) {
          return interaction.reply({ embeds: [createErrorEmbed("Nenhum Tier com compra por dia foi configurado ainda.")], ephemeral: true });
        }

        const menu = new StringSelectMenuBuilder()
          .setCustomId(`shop_vip_days_${guildId}_${quantity}`)
          .setPlaceholder("Selecione um VIP para comprar")
          .addOptions(
            tierEntries.slice(0, 25).map((t) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(`${t.name || t.id} - ${t.shop_price_per_day} 🪙/dia`.substring(0, 80))
                .setValue(t.id)
            )
          );

        return interaction.reply({
          embeds: [createEmbed({
            title: "💳 Comprar VIP por dias",
            description: `Selecione o plano VIP desejado para **${quantity}** dia(s).`,
            color: 0x3498db
          })],
          components: [new ActionRowBuilder().addComponents(menu)],
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
    if (!(interaction.customId.startsWith("shop_vip_buy_") || interaction.customId.startsWith("shop_vip_days_") || interaction.customId.startsWith("shop_catalog_select_"))) return;
    if (!interaction.inGuild()) {
      return interaction.reply({ embeds: [createErrorEmbed("Use este menu em um servidor.")], ephemeral: true });
    }

    if (interaction.customId.startsWith("shop_catalog_select_")) {
      const parts = parseCustomId(interaction.customId);
      const guildIdFromId = parts[3];
      if (interaction.guildId !== guildIdFromId) {
        return interaction.reply({ embeds: [createErrorEmbed("Este menu pertence a outro servidor.")], ephemeral: true });
      }
      const itemId = interaction.values?.[0];
      const shopService = interaction.client.services.shop;
      if (!shopService) {
        return interaction.reply({ embeds: [createErrorEmbed("Serviço de loja indisponível.")], ephemeral: true });
      }
      const item = await shopService.getItem(interaction.guildId, itemId);
      if (!item || item.enabled === false) {
        return interaction.reply({ embeds: [createErrorEmbed("Item inválido ou desativado.")], ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId(`shop_catalog_buy_${interaction.guildId}_${item.id}`)
        .setTitle(`Comprar: ${item.id}`);

      const qtyInput = new TextInputBuilder()
        .setCustomId("quantity")
        .setLabel("Quantidade")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue("1");

      modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
      return interaction.showModal(modal);
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
    const fixedPrice = (Number.isFinite(tier?.shop_fixed_price) ? tier.shop_fixed_price : tier?.preco_shop);
    const hasPerDay = (Number.isFinite(tier?.shop_price_per_day) && tier.shop_price_per_day > 0);
    if (!tier || tier.shop_enabled === false || ((!fixedPrice || fixedPrice <= 0) && !hasPerDay)) {
      return interaction.reply({ embeds: [createErrorEmbed("Tier inválido ou não está à venda.")], ephemeral: true });
    }

    const member = interaction.member;
    const currentTier = await vipService.getMemberTier(member);
    const currentPrice = (Number.isFinite(currentTier?.shop_fixed_price) ? currentTier.shop_fixed_price : currentTier?.preco_shop);
    const tierComparable = (fixedPrice && fixedPrice > 0)
      ? fixedPrice
      : (hasPerDay ? tier.shop_price_per_day : 0);
    const currentComparable = (currentPrice && currentPrice > 0)
      ? currentPrice
      : ((Number.isFinite(currentTier?.shop_price_per_day) && currentTier.shop_price_per_day > 0) ? currentTier.shop_price_per_day : 0);
    if (currentComparable && tierComparable && currentComparable > tierComparable) {
      return interaction.reply({
        embeds: [createErrorEmbed(`Você já possui um VIP superior (**${currentTier.name || currentTier.id}**).`) ],
        ephemeral: true,
      });
    }

    // Se este menu veio do /shop buy vip_days, a quantidade (dias) vem no customId
    if (interaction.customId.startsWith("shop_vip_days_")) {
      const parts = interaction.customId.split("_");
      const daysFromCmd = Number(parts[4]);
      if (!Number.isFinite(daysFromCmd) || daysFromCmd <= 0) {
        return interaction.reply({ embeds: [createErrorEmbed("Quantidade de dias inválida.")], ephemeral: true });
      }
      if (!hasPerDay) {
        return interaction.reply({ embeds: [createErrorEmbed("Este tier não suporta compra por dia.")], ephemeral: true });
      }

      const total = tier.shop_price_per_day * daysFromCmd;
      const balance = await economyService.getBalance(guildId, interaction.user.id);
      if ((balance.coins || 0) < total) {
        return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente. Você precisa de **${total} 🪙** e tem **${balance.coins || 0} 🪙**.`)], ephemeral: true });
      }
      const ok = await economyService.removeCoins(guildId, interaction.user.id, total);
      if (!ok) {
        return interaction.reply({ embeds: [createErrorEmbed("Falha ao cobrar moedas.")], ephemeral: true });
      }

      await vipService.addVip(guildId, interaction.user.id, { days: daysFromCmd, tierId: tier.id, source: "shop" });
      return interaction.reply({ embeds: [createSuccessEmbed(`VIP **${tier.name || tier.id}** comprado por **${daysFromCmd}** dia(s) por **${total} 🪙**.`)], ephemeral: true });
    }

    // Menu padrão do /shop vip:
    // Se o tier suporta compra por dia, abrir modal para o usuário escolher dias.
    if (hasPerDay) {
      const modal = new ModalBuilder()
        .setCustomId(`shop_vip_modal_${guildId}_${tier.id}`)
        .setTitle(`Comprar VIP: ${tier.name || tier.id}`);

      const defaultDays = Number.isFinite(tier.shop_default_days)
        ? tier.shop_default_days
        : (Number.isFinite(tier.days) ? tier.days : 30);

      const daysInput = new TextInputBuilder()
        .setCustomId("days")
        .setLabel(`Dias (preço: ${tier.shop_price_per_day} 🪙/dia)`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(String(defaultDays));

      modal.addComponents(new ActionRowBuilder().addComponents(daysInput));
      return interaction.showModal(modal);
    }

    // Caso contrário, compra pacote fixo
    const tierPrice = fixedPrice;
    const balance = await economyService.getBalance(guildId, interaction.user.id);
    if ((balance.coins || 0) < tierPrice) {
      return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente. Você precisa de **${tierPrice} 🪙** e tem **${balance.coins || 0} 🪙**.`)], ephemeral: true });
    }

    const ok = await economyService.removeCoins(guildId, interaction.user.id, tierPrice);
    if (!ok) {
      return interaction.reply({ embeds: [createErrorEmbed("Falha ao cobrar moedas.")], ephemeral: true });
    }

    const days = Number.isFinite(tier.shop_default_days)
      ? tier.shop_default_days
      : (Number.isFinite(tier.days) ? tier.days : 0);
    await vipService.addVip(guildId, interaction.user.id, { days: days > 0 ? days : undefined, tierId: tier.id, source: "shop" });

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

    return interaction.reply({ embeds: [createSuccessEmbed(`VIP **${tier.name || tier.id}** comprado com sucesso por **${tierPrice} 🪙**.`)], ephemeral: true });
  }

  ,

  async handleModal(interaction) {
    if (!(interaction.customId?.startsWith("shop_vip_modal_") || interaction.customId?.startsWith("shop_catalog_buy_"))) return;
    if (!interaction.inGuild()) {
      return interaction.reply({ embeds: [createErrorEmbed("Use este modal em um servidor.")], ephemeral: true });
    }

    if (interaction.customId.startsWith("shop_catalog_buy_")) {
      const parts = parseCustomId(interaction.customId);
      const guildIdFromId = parts[3];
      const itemId = parts.slice(4).join("_");
      if (interaction.guildId !== guildIdFromId) {
        return interaction.reply({ embeds: [createErrorEmbed("Este modal pertence a outro servidor.")], ephemeral: true });
      }

      const shopService = interaction.client.services.shop;
      const economyService = interaction.client.services.economy;
      if (!shopService || !economyService) {
        return interaction.reply({ embeds: [createErrorEmbed("Serviços indisponíveis.")], ephemeral: true });
      }

      const catalogItem = await shopService.getItem(interaction.guildId, itemId);
      if (!catalogItem || catalogItem.enabled === false) {
        return interaction.reply({ embeds: [createErrorEmbed("Item do catálogo não encontrado ou desativado.")], ephemeral: true });
      }

      const qtyRaw = (interaction.fields.getTextInputValue("quantity") || "").trim();
      const quantity = Number(qtyRaw);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return interaction.reply({ embeds: [createErrorEmbed("Quantidade inválida.")], ephemeral: true });
      }

      const unitPrice = Number(catalogItem.priceCoins || 0);
      const total = unitPrice * quantity;
      const balance = await economyService.getBalance(interaction.guildId, interaction.user.id);
      if ((balance.coins || 0) < total) {
        return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente. Você precisa de **${total} 🪙** e tem **${balance.coins || 0} 🪙**.`)], ephemeral: true });
      }

      const ok = await economyService.removeCoins(interaction.guildId, interaction.user.id, total);
      if (!ok) {
        return interaction.reply({ embeds: [createErrorEmbed("Falha ao cobrar moedas.")], ephemeral: true });
      }

      await shopService.deposit(interaction.guildId, total, { by: interaction.user.id, source: "shop", itemId: catalogItem.id, qty: quantity });

      const member = interaction.member;
      const durationDays = Number(catalogItem.durationDays || 0);
      const expiresAt = durationDays > 0 ? Date.now() + (durationDays * 24 * 60 * 60 * 1000) : null;

      if (catalogItem.type === "temporary_role") {
        await member.roles.add(catalogItem.roleId).catch(() => {});
        if (expiresAt) {
          await shopService.registerGrant(interaction.guildId, {
            type: "temporary_role",
            userId: interaction.user.id,
            roleId: catalogItem.roleId,
            itemId: catalogItem.id,
            quantity,
            expiresAt,
          });
        }
        return interaction.reply({ embeds: [createSuccessEmbed(`Você comprou **${catalogItem.id}** por **${total} 🪙**.`)], ephemeral: true });
      }

      if (catalogItem.type === "channel_access") {
        const ch = await interaction.guild.channels.fetch(catalogItem.channelId).catch(() => null);
        if (!ch) {
          return interaction.reply({ embeds: [createErrorEmbed("Canal do item não encontrado.")], ephemeral: true });
        }
        await ch.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true }).catch(() => {});
        if (expiresAt) {
          await shopService.registerGrant(interaction.guildId, {
            type: "channel_access",
            userId: interaction.user.id,
            channelId: catalogItem.channelId,
            itemId: catalogItem.id,
            quantity,
            expiresAt,
          });
        }
        return interaction.reply({ embeds: [createSuccessEmbed(`Acesso ao canal concedido pelo item **${catalogItem.id}** por **${total} 🪙**.`)], ephemeral: true });
      }

      return interaction.reply({ embeds: [createErrorEmbed("Tipo de item ainda não suportado.")], ephemeral: true });
    }

    const parts = interaction.customId.split("_");
    const guildId = parts[3];
    const tierId = parts.slice(4).join("_");

    if (interaction.guildId !== guildId) {
      return interaction.reply({ embeds: [createErrorEmbed("Este modal pertence a outro servidor.")], ephemeral: true });
    }

    const vipConfig = interaction.client.services.vipConfig;
    const vipService = interaction.client.services.vip;
    const economyService = interaction.client.services.economy;

    const tier = await vipConfig.getTierConfig(guildId, tierId);
    if (!tier || tier.shop_enabled === false) {
      return interaction.reply({ embeds: [createErrorEmbed("Tier inválido ou não está à venda.")], ephemeral: true });
    }
    if (!(Number.isFinite(tier.shop_price_per_day) && tier.shop_price_per_day > 0)) {
      return interaction.reply({ embeds: [createErrorEmbed("Este tier não suporta compra por dias.")], ephemeral: true });
    }

    const daysRaw = (interaction.fields.getTextInputValue("days") || "").trim();
    const days = Number(daysRaw);
    if (!Number.isFinite(days) || days <= 0) {
      return interaction.reply({ embeds: [createErrorEmbed("Quantidade de dias inválida.")], ephemeral: true });
    }

    const total = tier.shop_price_per_day * days;
    const balance = await economyService.getBalance(guildId, interaction.user.id);
    if ((balance.coins || 0) < total) {
      return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente. Você precisa de **${total} 🪙** e tem **${balance.coins || 0} 🪙**.`)], ephemeral: true });
    }

    const ok = await economyService.removeCoins(guildId, interaction.user.id, total);
    if (!ok) {
      return interaction.reply({ embeds: [createErrorEmbed("Falha ao cobrar moedas.")], ephemeral: true });
    }

    await vipService.addVip(guildId, interaction.user.id, { days, tierId: tier.id, source: "shop" });

    return interaction.reply({ embeds: [createSuccessEmbed(`VIP **${tier.name || tier.id}** comprado por **${days}** dia(s) por **${total} 🪙**.`)], ephemeral: true });
  }

  ,

  async handleButton(interaction) {
    if (!interaction.customId?.startsWith("shop_catalog_")) return;
    if (!interaction.inGuild()) {
      return interaction.reply({ embeds: [createErrorEmbed("Use este botão em um servidor.")], ephemeral: true });
    }

    const shopService = interaction.client.services.shop;
    if (!shopService) {
      return interaction.reply({ embeds: [createErrorEmbed("Serviço de loja indisponível.")], ephemeral: true });
    }

    const parts = parseCustomId(interaction.customId);
    const action = parts[2];
    const guildIdFromId = parts[3];
    const page = Number(parts[4] || 0);
    if (interaction.guildId !== guildIdFromId) {
      return interaction.reply({ embeds: [createErrorEmbed("Este botão pertence a outro servidor.")], ephemeral: true });
    }

    const nextPage = action === "next" ? page + 1 : page - 1;
    const rendered = await renderCatalogPage({ interaction, shopService, guildId: interaction.guildId, page: nextPage });
    return interaction.update(rendered.payload);
  }
};
