const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

function parseCustomId(customId) {
  return String(customId || "").split("_");
}

async function buildCatalogItems(shopService, guildId) {
  const items = (await shopService.listItems(guildId)).filter((i) => i && i.enabled !== false);
  items.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return items;
}

function formatCatalogLine(item) {
  const durationText = item.durationDays && item.durationDays > 0 ? `${item.durationDays}d` : "permanente";
  return `• **${item.name || item.id}** (${item.type}) - **${item.priceCoins} 🪙** - ${durationText}`;
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
    description: slice.slice(0, 15).map(formatCatalogLine).join("\n"),
    color: 0x9b59b6,
    footer: { text: `Página ${safePage + 1}/${totalPages} • Use /shop buy item:catalog id:<ID>` }
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`shop_catalog_select_${guildId}_${safePage}`)
    .setPlaceholder("Selecione um item para ver as opções")
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
    .addSubcommand((sub) => sub.setName("vip").setDescription("Ver planos VIP disponíveis"))
    .addSubcommand((sub) => sub.setName("catalog").setDescription("Ver catálogo de itens da loja"))
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
        .addIntegerOption((opt) => opt.setName("quantity").setDescription("Quantidade").setMinValue(1).setRequired(true))
        .addStringOption((opt) => opt.setName("id").setDescription("ID do item do catálogo").setRequired(false))
    ),

  async execute(interaction) {
    const { economy: economyService, shop: shopService, vipConfig } = interaction.client.services;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    if (sub === "vip") {
      const tiers = await vipConfig.getGuildTiers(guildId);
      if (!tiers || Object.keys(tiers).length === 0) {
        return interaction.reply({ embeds: [createErrorEmbed("Não há planos VIP disponíveis neste servidor.")], ephemeral: true });
      }

      const tierEntries = [];
      for (const tierId of Object.keys(tiers)) {
        const tier = await vipConfig.getTierConfig(guildId, tierId);
        if (tier && tier.shop_enabled !== false) tierEntries.push(tier);
      }

      if (tierEntries.length === 0) {
        return interaction.reply({ embeds: [createErrorEmbed("Nenhum VIP configurado na loja.")], ephemeral: true });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`shop_vip_buy_${guildId}`)
        .setPlaceholder("Selecione um VIP para comprar")
        .addOptions(tierEntries.slice(0, 25).map((t) => new StringSelectMenuOptionBuilder().setLabel(t.name || t.id).setValue(t.id)));

      return interaction.reply({
        embeds: [createEmbed({ title: "💎 Planos VIP", description: "Selecione no menu abaixo.", color: 0x9b59b6 })],
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true,
      });
    }

    if (sub === "catalog") {
      if (!shopService) return interaction.reply({ embeds: [createErrorEmbed("Serviço de loja indisponível.")], ephemeral: true });
      const rendered = await renderCatalogPage({ interaction, shopService, guildId, page: 0 });
      return interaction.reply(rendered.payload);
    }

    if (sub === "buy") {
      const item = interaction.options.getString("item");
      const quantity = interaction.options.getInteger("quantity");
      const catalogId = interaction.options.getString("id");

      if (item === "catalog") {
        if (!catalogId) return interaction.reply({ embeds: [createErrorEmbed("Você precisa informar o `id` do item do catálogo.")], ephemeral: true });

        const catalogItem = await shopService.getItem(guildId, catalogId);
        if (!catalogItem || catalogItem.enabled === false) return interaction.reply({ embeds: [createErrorEmbed("Item não encontrado ou desativado.")], ephemeral: true });

        const total = catalogItem.priceCoins * quantity;
        const balance = await economyService.getBalance(guildId, userId);
        
        if ((balance.coins || 0) < total) {
            return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente! Você precisa de **${total} 🪙** e tem **${balance.coins || 0} 🪙**.`)], ephemeral: true });
        }

        await economyService.removeCoins(guildId, userId, total);
        await shopService.deposit(guildId, total, { by: userId, source: "shop", itemId: catalogItem.id, qty: quantity });

        // INTEGRAÇÃO DOS CARDS
        if (catalogItem.type === "card") {
            const { createDataStore } = require("../store/dataStore");
            const userCardsStore = createDataStore("userCards.json");
            await userCardsStore.update(userId, (current) => {
                const uc = current || { owned: ["default"], selected: "default" };
                if (!uc.owned.includes(catalogItem.id)) uc.owned.push(catalogItem.id);
                return uc;
            });
            return interaction.reply({ embeds: [createSuccessEmbed(`Você comprou o card **${catalogItem.name || catalogItem.id}** por **${total} 🪙**! Equipe usando \`/rank cards\`.`)], ephemeral: true });
        }

        // CARGOS TEMPORÁRIOS E CANAIS
        const member = interaction.member;
        const durationDays = Number(catalogItem.durationDays || 0);
        const expiresAt = durationDays > 0 ? Date.now() + (durationDays * 24 * 60 * 60 * 1000) : null;

        if (catalogItem.type === "temporary_role") {
          if (!catalogItem.roleId) return interaction.reply({ embeds: [createErrorEmbed("Item inválido (roleId ausente).")], ephemeral: true });
          await member.roles.add(catalogItem.roleId).catch(() => {});
          if (expiresAt) {
            await shopService.registerGrant(guildId, { type: "temporary_role", userId, roleId: catalogItem.roleId, itemId: catalogItem.id, quantity, expiresAt });
          }
          return interaction.reply({ embeds: [createSuccessEmbed(`Você comprou o cargo **${catalogItem.id}** por **${total} 🪙**.` )], ephemeral: true });
        }

        if (catalogItem.type === "channel_access") {
          if (!catalogItem.channelId) return interaction.reply({ embeds: [createErrorEmbed("Item inválido (channelId ausente).")], ephemeral: true });
          const ch = await interaction.guild.channels.fetch(catalogItem.channelId).catch(() => null);
          if (!ch) return interaction.reply({ embeds: [createErrorEmbed("Canal do item não encontrado.")], ephemeral: true });
          
          await ch.permissionOverwrites.edit(userId, { ViewChannel: true }).catch(() => {});
          if (expiresAt) {
            await shopService.registerGrant(guildId, { type: "channel_access", userId, channelId: catalogItem.channelId, itemId: catalogItem.id, quantity, expiresAt });
          }
          return interaction.reply({ embeds: [createSuccessEmbed(`Acesso ao canal concedido pelo item **${catalogItem.id}** por **${total} 🪙**.` )], ephemeral: true });
        }

        return interaction.reply({ embeds: [createErrorEmbed("Tipo de item ainda não suportado no shop core.")], ephemeral: true });
      }

      if (item === "vip_days") {
        const tiers = await vipConfig.getGuildTiers(guildId);
        if (!tiers || Object.keys(tiers).length === 0) return interaction.reply({ embeds: [createErrorEmbed("Não há planos VIP disponíveis neste servidor.")], ephemeral: true });

        const tierEntries = [];
        for (const tierId of Object.keys(tiers)) {
          const tier = await vipConfig.getTierConfig(guildId, tierId);
          if (tier && tier.shop_enabled !== false && Number.isFinite(tier.shop_price_per_day) && tier.shop_price_per_day > 0) tierEntries.push(tier);
        }

        if (tierEntries.length === 0) return interaction.reply({ embeds: [createErrorEmbed("Nenhum Tier com compra por dia configurado.")], ephemeral: true });

        const menu = new StringSelectMenuBuilder()
          .setCustomId(`shop_vip_days_${guildId}_${quantity}`)
          .setPlaceholder("Selecione um VIP para comprar")
          .addOptions(tierEntries.slice(0, 25).map((t) => new StringSelectMenuOptionBuilder().setLabel(`${t.name || t.id} - ${t.shop_price_per_day} 🪙/dia`.substring(0, 80)).setValue(t.id)));

        return interaction.reply({
          embeds: [createEmbed({ title: "💳 Comprar VIP por dias", description: `Selecione o plano VIP desejado para **${quantity}** dia(s).`, color: 0x3498db })],
          components: [new ActionRowBuilder().addComponents(menu)],
          ephemeral: true
        });
      }

      if (item === "role_color") {
        const cost = quantity * 5000;
        const balance = await economyService.getBalance(guildId, userId);
        if (balance.coins < cost) return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente! Precisa de **${cost} 🪙**.` )], ephemeral: true });
        await economyService.removeCoins(guildId, userId, cost);
        return interaction.reply({ embeds: [createSuccessEmbed(`Você comprou **${quantity}** mudança(s) de cor de cargo! Use \`/vip panel\`.`)], ephemeral: true });
      }

      if (item === "custom_name") {
        const cost = quantity * 10000;
        const balance = await economyService.getBalance(guildId, userId);
        if (balance.coins < cost) return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente! Precisa de **${cost} 🪙**.` )], ephemeral: true });
        await economyService.removeCoins(guildId, userId, cost);
        return interaction.reply({ embeds: [createSuccessEmbed(`Você comprou **${quantity}** alteração(ões) de nome! Use \`/vip panel\`.`)], ephemeral: true });
      }

      return interaction.reply({ embeds: [createErrorEmbed("Item não encontrado.")], ephemeral: true });
    }
  },
  async handleSelectMenu(interaction) {
    if (!interaction.customId.startsWith("shop_")) return;
    if (!interaction.inGuild()) return interaction.reply({ embeds: [createErrorEmbed("Use este menu em um servidor.")], ephemeral: true });

    // LÓGICA DO MODAL (CATÁLOGO)
    if (interaction.customId.startsWith("shop_catalog_select_")) {
      const parts = parseCustomId(interaction.customId);
      const guildIdFromId = parts[3];
      if (interaction.guildId !== guildIdFromId) return interaction.reply({ embeds: [createErrorEmbed("Este menu pertence a outro servidor.")], ephemeral: true });
      
      const itemId = interaction.values?.[0];
      const shopService = interaction.client.services.shop;
      
      const item = await shopService.getItem(interaction.guildId, itemId);
      if (!item || item.enabled === false) return interaction.reply({ embeds: [createErrorEmbed("Item inválido ou desativado.")], ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`shop_catalog_buy_${interaction.guildId}_${item.id}`)
        .setTitle(`Comprar: ${item.id.substring(0, 30)}`);

      const qtyInput = new TextInputBuilder()
        .setCustomId("quantity")
        .setLabel("Quantidade")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue("1");

      modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
      return interaction.showModal(modal);
    }

    // COMPRA DE VIP POR DIAS COM MATEMÁTICA CORRIGIDA E ENTREGA DE CARGO
    if (interaction.customId.startsWith("shop_vip_days_")) {
      const parts = parseCustomId(interaction.customId);
      
      // O array 'parts' contém: ["shop", "vip", "days", "GUILD_ID", "QUANTIDADE"]
      const guildId = parts[3];
      const quantity = Number(parts[4]); // <-- Pegando a quantidade de dias certa
      const tierId = interaction.values[0];
      
      const { economy: eco, vipConfig, vip: vipService } = interaction.client.services;
      
      const tier = await vipConfig.getTierConfig(guildId, tierId);
      const totalCost = tier.shop_price_per_day * quantity;
      
      const balance = await eco.getBalance(guildId, interaction.user.id);
      
      // Checa saldo
      if ((balance.coins || 0) < totalCost) {
          return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente! Você precisa de **${totalCost} 🪙** mas tem apenas **${balance.coins || 0} 🪙**.`)], ephemeral: true });
      }
      
      // Desconta as moedas
      await eco.removeCoins(guildId, interaction.user.id, totalCost);
      
      // Entrega o VIP (Calcula a expiração em milissegundos)
      const diasMs = quantity * 24 * 60 * 60 * 1000;
      const currentData = await vipService.getVipData(guildId, interaction.user.id);
      let newExpires = Date.now() + diasMs;

      // Acumula os dias se ele já for VIP desse tier
      if (currentData && currentData.tierId === tierId && currentData.expiresAt > Date.now()) {
          newExpires = currentData.expiresAt + diasMs;
      }

      await vipService.addVip(guildId, interaction.user.id, {
          tierId: tierId,
          expiresAt: newExpires,
          addedBy: "Loja VIP"
      });

      // Entrega o Cargo no Servidor
      if (tier.roleId) {
          const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
          if (member) await member.roles.add(tier.roleId).catch(() => {});
      }

      return interaction.reply({ embeds: [createSuccessEmbed(`🎉 VIP **${tier.name || tier.id}** comprado por **${quantity} dia(s)** com sucesso!\n\n💸 Foram debitadas **${totalCost} 🪙** e seus benefícios já estão ativos.`)], ephemeral: true });
    }

    return interaction.reply({ content: "Menu registrado.", ephemeral: true });
  }
};
