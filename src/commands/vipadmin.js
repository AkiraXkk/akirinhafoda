const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    EmbedBuilder, 
    ChannelType 
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipadmin")
    .setDescription("👑 Painel Supremo de Administração VIP e Família")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    
    // INFRAESTRUTURA
    .addSubcommand(s => s.setName("setup").setDescription("Configura a estrutura técnica do VIP")
        .addChannelOption(o => o.setName("logs").setDescription("Canal de auditoria").setRequired(true))
        .addChannelOption(o => o.setName("categoria").setDescription("Categoria para canais VIP").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
        .addRoleOption(o => o.setName("separador").setDescription("Cargo que fica ACIMA dos personalizados").setRequired(true))
        .addRoleOption(o => o.setName("fantasma").setDescription("Cargo Fantasma (Vigilante)").setRequired(false)))

    // GESTÃO DE TIERS
    .addSubcommand(s => s.setName("tier").setDescription("Define benefícios de um cargo")
        .addStringOption(o => o.setName("id").setDescription("ID (ex: supremo, diamante)").setRequired(true))
        .addRoleOption(o => o.setName("cargo").setDescription("Cargo correspondente").setRequired(true)))

    // CONTROLE DE MEMBROS
    .addSubcommand(s => s.setName("add").setDescription("Ativa o VIP para um usuário")
        .addUserOption(o => o.setName("membro").setDescription("Destinatário").setRequired(true))
        .addStringOption(o => o.setName("tier").setDescription("ID do Tier").setRequired(true))
        .addIntegerOption(o => o.setName("dias").setDescription("Tempo em dias").setRequired(true)))

    .addSubcommand(s => s.setName("remove").setDescription("Remove o VIP de um usuário imediatamente")
        .addUserOption(o => o.setName("membro").setDescription("Usuário a ser removido").setRequired(true)))

    // LISTAGEM E MONITORAMENTO
    .addSubcommand(s => s.setName("list").setDescription("Lista Tiers configurados e Membros VIP ativos"))

    // GESTÃO DE FAMÍLIA (ADMIN FORCE)
    .addSubcommandGroup(g => g.setName("family").setDescription("Comandos administrativos para clãs")
        .addSubcommand(s => s.setName("info").setDescription("Detalhes técnicos de uma família")
            .addUserOption(o => o.setName("dono").setDescription("Dono da família").setRequired(true)))
        .addSubcommand(s => s.setName("delete").setDescription("Apaga uma família e limpa cargos/canais")
            .addUserOption(o => o.setName("dono").setDescription("Dono da família").setRequired(true)))
        .addSubcommand(s => s.setName("limit").setDescription("Altera o limite de vagas na força")
            .addUserOption(o => o.setName("dono").setDescription("Dono da família").setRequired(true))
            .addIntegerOption(o => o.setName("vagas").setDescription("Novo limite").setRequired(true)))),

  async execute(interaction) {
    const { vip: vipService, vipConfig, family: familyService, vipChannel, vipRole } = interaction.client.services;
    const sub = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup();

    // --- GRUPO FAMÍLIA ---
    if (group === "family") {
      const targetOwner = interaction.options.getUser("dono");
      if (sub === "info") {
        const family = await familyService.getFamilyByOwner(targetOwner.id);
        if (!family) return interaction.reply("❌ Este usuário não lidera uma família.");
        const embed = new EmbedBuilder()
          .setTitle(`🏠 Família: ${family.name}`).setColor("Purple")
          .addFields(
            { name: "Líder", value: `<@${family.ownerId}>`, inline: true },
            { name: "Ocupação", value: `👥 ${family.members.length} / ${family.maxMembers} membros`, inline: true },
            { name: "ID Interno", value: `\`${family.id}\``, inline: false }
          );
        return interaction.reply({ embeds: [embed] });
      }
      if (sub === "delete") {
        await familyService.deleteFamily(interaction.guild, targetOwner.id);
        return interaction.reply(`🗑️ Família de <@${targetOwner.id}> deletada e canais limpos.`);
      }
      if (sub === "limit") {
        const vagas = interaction.options.getInteger("vagas");
        const family = await familyService.getFamilyByOwner(targetOwner.id);
        if (!family) return interaction.reply("❌ Família não localizada.");
        await familyService.updateMaxMembers(family.id, vagas);
        return interaction.reply(`✅ Limite de **${family.name}** atualizado para **${vagas}**.`);
      }
    }

    // --- SUBCOMANDOS DIRETOS ---
    if (sub === "setup") {
      await vipService.setGuildConfig(interaction.guildId, {
        logChannelId: interaction.options.getChannel("logs").id,
        vipCategoryId: interaction.options.getChannel("categoria").id,
        separatorId: interaction.options.getRole("separador").id,
        cargoFantasmaId: interaction.options.getRole("fantasma")?.id || null
      });
      return interaction.reply("⚙️ Configurações globais salvas com sucesso.");
    }

    if (sub === "add") {
      const target = interaction.options.getMember("membro");
      const tid = interaction.options.getString("tier").toLowerCase();
      const dias = interaction.options.getInteger("dias");
      const tier = await vipConfig.getTierConfig(interaction.guildId, tid);

      if (!tier) return interaction.reply(`❌ O Tier \`${tid}\` não existe.`);
      
      const expiresAt = Date.now() + (dias * 24 * 60 * 60 * 1000);
      await target.roles.add(tier.roleId).catch(() => {});
      
      await vipService.addVip(interaction.guildId, target.id, {
        tierId: tid,
        expiresAt: expiresAt,
        addedBy: interaction.user.id
      });

      if (tier.canCall || tier.chat_privado) {
        await vipChannel.ensureVipChannels(target.id, { guildId: interaction.guildId });
      }

      return interaction.reply(`✅ **${target.user.username}** agora é **${tid.toUpperCase()}** por ${dias} dias.`);
    }

    if (sub === "remove") {
        const target = interaction.options.getMember("membro");
        // Cleanup completo usando seus serviços existentes
        await vipChannel.deleteVipChannels(target.id, { guildId: interaction.guildId });
        await vipRole.deletePersonalRole(target.id, { guildId: interaction.guildId });
        
        const data = await vipService.getVipData(interaction.guildId, target.id);
        if (data?.tierId) {
            const tier = await vipConfig.getTierConfig(interaction.guildId, data.tierId);
            if (tier) await target.roles.remove(tier.roleId).catch(() => {});
        }

        await vipService.removeVip(interaction.guildId, target.id);
        return interaction.reply(`🚫 VIP de ${target} removido e ativos deletados.`);
    }

    if (sub === "list") {
        const tiers = await vipConfig.getGuildTiers(interaction.guildId);
        const report = await vipService.getFullVipReport(interaction.guildId); // Certifique-se que essa função existe ou liste do store

        const embed = new EmbedBuilder().setTitle("📊 Dashboard VIP").setColor("Blue");
        
        const tierText = Object.keys(tiers).map(t => `• **${t.toUpperCase()}**: <@&${tiers[t].roleId}>`).join("\n") || "Nenhum";
        embed.addFields({ name: "Cargos Configurados", value: tierText });

        const activeVips = report.activeVips || [];
        const vipText = activeVips.map(v => `<@${v.userId}> - \`${v.tierId}\` (Expira: <t:${Math.floor(v.expiresAt/1000)}:d>)`).join("\n") || "Nenhum membro ativo.";
        embed.addFields({ name: "Membros Ativos", value: vipText });

        return interaction.reply({ embeds: [embed] });
    }

    if (sub === "tier") {
      const tid = interaction.options.getString("id").toLowerCase();
      const role = interaction.options.getRole("cargo");
      await vipConfig.setBase(interaction.guildId, tid, role.id, role.name);

      const menu = new StringSelectMenuBuilder().setCustomId(`vipadmin_tier_${interaction.guildId}_${tid}`)
        .addOptions(
          { label: "Economia", value: "eco", description: "Daily e Midas", emoji: "💰" },
          { label: "Social", value: "soc", description: "Família e Cotas", emoji: "👨‍👩‍👧" },
          { label: "Técnico", value: "tec", description: "Calls e Cargos", emoji: "⚡" },
          { label: "Loja", value: "shop", description: "Venda no /shop e /vipbuy", emoji: "🛒" }
        );
      return interaction.reply({ content: `Configurando benefícios de <@&${role.id}>`, components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }
  },

  async handleSelectMenu(interaction) {
    if (!interaction.customId?.startsWith("vipadmin_tier_")) return;

    const parts = interaction.customId.split("_");
    const guildId = parts[2];
    const tierId = parts.slice(3).join("_");
    const section = interaction.values?.[0];

    if (!guildId || !tierId || !section) {
      return interaction.reply({ content: "Seleção inválida.", ephemeral: true });
    }

    if (interaction.guildId !== guildId) {
      return interaction.reply({ content: "Este menu pertence a outro servidor.", ephemeral: true });
    }

    const vipConfig = interaction.client.services?.vipConfig;
    const tier = await vipConfig?.getTierConfig(guildId, tierId);
    if (!tier) {
      return interaction.reply({ content: `Tier \`${tierId}\` não encontrado.`, ephemeral: true });
    }

    if (section === "eco") {
      const modal = new ModalBuilder()
        .setCustomId(`vipadmin_modal_eco_${guildId}_${tierId}`)
        .setTitle(`Economia: ${tier.name || tier.id}`);

      const dailyExtraInput = new TextInputBuilder()
        .setCustomId("valor_daily_extra")
        .setLabel("Daily extra (moedas). Vazio=0")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(Number.isFinite(tier.valor_daily_extra) ? String(tier.valor_daily_extra) : "");

      const bonusInicialInput = new TextInputBuilder()
        .setCustomId("bonus_inicial")
        .setLabel("Bônus inicial ao ganhar VIP. Vazio=0")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(Number.isFinite(tier.bonus_inicial) ? String(tier.bonus_inicial) : "");

      const midasInput = new TextInputBuilder()
        .setCustomId("midas")
        .setLabel("Midas? (1=sim, 0=não)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(tier.midas === true ? "1" : (tier.midas === false ? "0" : ""));

      const priceLegacyInput = new TextInputBuilder()
        .setCustomId("preco_shop")
        .setLabel("Preço legacy (preco_shop). Vazio=ignorar")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(Number.isFinite(tier.preco_shop) ? String(tier.preco_shop) : "");

      modal.addComponents(
        new ActionRowBuilder().addComponents(dailyExtraInput),
        new ActionRowBuilder().addComponents(bonusInicialInput),
        new ActionRowBuilder().addComponents(midasInput),
        new ActionRowBuilder().addComponents(priceLegacyInput)
      );

      return interaction.showModal(modal);
    }

    if (section === "soc") {
      const modal = new ModalBuilder()
        .setCustomId(`vipadmin_modal_soc_${guildId}_${tierId}`)
        .setTitle(`Social: ${tier.name || tier.id}`);

      const vagasFamiliaInput = new TextInputBuilder()
        .setCustomId("vagas_familia")
        .setLabel("Vagas família (número). Vazio=0")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(Number.isFinite(tier.vagas_familia) ? String(tier.vagas_familia) : "");

      const damasInput = new TextInputBuilder()
        .setCustomId("primeiras_damas")
        .setLabel("Cotas de damas (número). Vazio=0")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(Number.isFinite(tier.primeiras_damas) ? String(tier.primeiras_damas) : "");

      const cotaRoleInput = new TextInputBuilder()
        .setCustomId("cotaRoleId")
        .setLabel("Cargo de cota (Role ID). Vazio=nenhum")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(typeof tier.cotaRoleId === "string" ? tier.cotaRoleId : "");

      const presentearInput = new TextInputBuilder()
        .setCustomId("pode_presentear")
        .setLabel("Pode presentear? (1=sim, 0=não)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(tier.pode_presentear === true ? "1" : (tier.pode_presentear === false ? "0" : ""));

      modal.addComponents(
        new ActionRowBuilder().addComponents(vagasFamiliaInput),
        new ActionRowBuilder().addComponents(damasInput),
        new ActionRowBuilder().addComponents(cotaRoleInput),
        new ActionRowBuilder().addComponents(presentearInput)
      );

      return interaction.showModal(modal);
    }

    if (section === "tec") {
      const modal = new ModalBuilder()
        .setCustomId(`vipadmin_modal_tec_${guildId}_${tierId}`)
        .setTitle(`Técnico: ${tier.name || tier.id}`);

      const canCallInput = new TextInputBuilder()
        .setCustomId("canCall")
        .setLabel("Call privada? (1=sim, 0=não)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(tier.canCall === true ? "1" : (tier.canCall === false ? "0" : ""));

      const chatPrivInput = new TextInputBuilder()
        .setCustomId("chat_privado")
        .setLabel("Chat privado? (1=sim, 0=não)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(tier.chat_privado === true ? "1" : (tier.chat_privado === false ? "0" : ""));

      const customRoleInput = new TextInputBuilder()
        .setCustomId("hasCustomRole")
        .setLabel("Cargo personalizado? (1=sim, 0=não)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(tier.hasCustomRole === true ? "1" : (tier.hasCustomRole === false ? "0" : ""));

      const highQualityInput = new TextInputBuilder()
        .setCustomId("high_quality_voice")
        .setLabel("Áudio high quality? (1=sim, 0=não)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(tier.high_quality_voice === true ? "1" : (tier.high_quality_voice === false ? "0" : ""));

      modal.addComponents(
        new ActionRowBuilder().addComponents(canCallInput),
        new ActionRowBuilder().addComponents(chatPrivInput),
        new ActionRowBuilder().addComponents(customRoleInput),
        new ActionRowBuilder().addComponents(highQualityInput)
      );

      return interaction.showModal(modal);
    }

    if (section !== "shop") {
      return interaction.reply({ content: "Esta seção ainda não foi implementada neste painel.", ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`vipadmin_modal_shop_${guildId}_${tierId}`)
      .setTitle(`Loja VIP: ${tier.name || tier.id}`);

    const enabledInput = new TextInputBuilder()
      .setCustomId("shop_enabled")
      .setLabel("Habilitar compra no bot? (1=sim, 0=não, vazio=auto)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(tier.shop_enabled === true ? "1" : (tier.shop_enabled === false ? "0" : ""));

    const pricePerDayInput = new TextInputBuilder()
      .setCustomId("shop_price_per_day")
      .setLabel("Preço por dia (moedas). Vazio para não usar")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(Number.isFinite(tier.shop_price_per_day) ? String(tier.shop_price_per_day) : "");

    const fixedPriceInput = new TextInputBuilder()
      .setCustomId("shop_fixed_price")
      .setLabel("Preço fixo do plano (moedas). Vazio para não usar")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(Number.isFinite(tier.shop_fixed_price) ? String(tier.shop_fixed_price) : "");

    const defaultDaysInput = new TextInputBuilder()
      .setCustomId("shop_default_days")
      .setLabel("Dias padrão se preço fixo (ex: 30). Vazio=usar tier.days")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(Number.isFinite(tier.shop_default_days) ? String(tier.shop_default_days) : "");

    modal.addComponents(
      new ActionRowBuilder().addComponents(enabledInput),
      new ActionRowBuilder().addComponents(pricePerDayInput),
      new ActionRowBuilder().addComponents(fixedPriceInput),
      new ActionRowBuilder().addComponents(defaultDaysInput)
    );

    return interaction.showModal(modal);
  },

  async handleModal(interaction) {
    if (!interaction.customId?.startsWith("vipadmin_modal_")) return;

    const parts = interaction.customId.split("_");
    const section = parts[2];
    const guildId = parts[3];
    const tierId = parts.slice(4).join("_");

    const vipConfig = interaction.client.services?.vipConfig;
    if (!vipConfig) {
      return interaction.reply({ content: "Serviço vipConfig indisponível.", ephemeral: true });
    }

    if (section === "eco") {
      const dailyExtraRaw = (interaction.fields.getTextInputValue("valor_daily_extra") || "").trim();
      const bonusInicialRaw = (interaction.fields.getTextInputValue("bonus_inicial") || "").trim();
      const midasRaw = (interaction.fields.getTextInputValue("midas") || "").trim();
      const precoShopRaw = (interaction.fields.getTextInputValue("preco_shop") || "").trim();

      const valor_daily_extra = dailyExtraRaw === "" ? 0 : Number(dailyExtraRaw);
      const bonus_inicial = bonusInicialRaw === "" ? 0 : Number(bonusInicialRaw);
      const midas = midasRaw === "" ? null : (midasRaw === "1" || midasRaw.toLowerCase() === "sim" || midasRaw.toLowerCase() === "true");
      const preco_shop = precoShopRaw === "" ? null : Number(precoShopRaw);

      if (!Number.isFinite(valor_daily_extra) || valor_daily_extra < 0) {
        return interaction.reply({ content: "Daily extra inválido.", ephemeral: true });
      }
      if (!Number.isFinite(bonus_inicial) || bonus_inicial < 0) {
        return interaction.reply({ content: "Bônus inicial inválido.", ephemeral: true });
      }
      if (preco_shop !== null && (!Number.isFinite(preco_shop) || preco_shop < 0)) {
        return interaction.reply({ content: "preco_shop inválido.", ephemeral: true });
      }

      await vipConfig.updateTier(guildId, tierId, "eco", {
        valor_daily_extra,
        bonus_inicial,
        ...(midas === null ? {} : { midas }),
        ...(preco_shop === null ? {} : { preco_shop }),
      });

      return interaction.reply({ content: `✅ Configuração de economia do tier \`${tierId}\` atualizada.`, ephemeral: true });
    }

    if (section === "soc") {
      const vagasRaw = (interaction.fields.getTextInputValue("vagas_familia") || "").trim();
      const damasRaw = (interaction.fields.getTextInputValue("primeiras_damas") || "").trim();
      const cotaRoleRaw = (interaction.fields.getTextInputValue("cotaRoleId") || "").trim();
      const presentearRaw = (interaction.fields.getTextInputValue("pode_presentear") || "").trim();

      const vagas_familia = vagasRaw === "" ? 0 : Number(vagasRaw);
      const primeiras_damas = damasRaw === "" ? 0 : Number(damasRaw);
      const cotaRoleId = cotaRoleRaw === "" ? null : cotaRoleRaw;
      const pode_presentear = presentearRaw === "" ? null : (presentearRaw === "1" || presentearRaw.toLowerCase() === "sim" || presentearRaw.toLowerCase() === "true");

      if (!Number.isFinite(vagas_familia) || vagas_familia < 0) {
        return interaction.reply({ content: "Vagas família inválido.", ephemeral: true });
      }
      if (!Number.isFinite(primeiras_damas) || primeiras_damas < 0) {
        return interaction.reply({ content: "Primeiras damas inválido.", ephemeral: true });
      }

      await vipConfig.updateTier(guildId, tierId, "soc", {
        vagas_familia,
        primeiras_damas,
        cotaRoleId,
        ...(pode_presentear === null ? {} : { pode_presentear }),
      });

      return interaction.reply({ content: `✅ Configuração social do tier \`${tierId}\` atualizada.`, ephemeral: true });
    }

    if (section === "tec") {
      const canCallRaw = (interaction.fields.getTextInputValue("canCall") || "").trim();
      const chatPrivRaw = (interaction.fields.getTextInputValue("chat_privado") || "").trim();
      const customRoleRaw = (interaction.fields.getTextInputValue("hasCustomRole") || "").trim();
      const hqRaw = (interaction.fields.getTextInputValue("high_quality_voice") || "").trim();

      const canCall = canCallRaw === "" ? null : (canCallRaw === "1" || canCallRaw.toLowerCase() === "sim" || canCallRaw.toLowerCase() === "true");
      const chat_privado = chatPrivRaw === "" ? null : (chatPrivRaw === "1" || chatPrivRaw.toLowerCase() === "sim" || chatPrivRaw.toLowerCase() === "true");
      const hasCustomRole = customRoleRaw === "" ? null : (customRoleRaw === "1" || customRoleRaw.toLowerCase() === "sim" || customRoleRaw.toLowerCase() === "true");
      const high_quality_voice = hqRaw === "" ? null : (hqRaw === "1" || hqRaw.toLowerCase() === "sim" || hqRaw.toLowerCase() === "true");

      await vipConfig.updateTier(guildId, tierId, "tec", {
        ...(canCall === null ? {} : { canCall }),
        ...(chat_privado === null ? {} : { chat_privado }),
        ...(hasCustomRole === null ? {} : { hasCustomRole }),
        ...(high_quality_voice === null ? {} : { high_quality_voice }),
      });

      return interaction.reply({ content: `✅ Configuração técnica do tier \`${tierId}\` atualizada.`, ephemeral: true });
    }

    const enabledRaw = (interaction.fields.getTextInputValue("shop_enabled") || "").trim();
    const pricePerDayRaw = (interaction.fields.getTextInputValue("shop_price_per_day") || "").trim();
    const fixedPriceRaw = (interaction.fields.getTextInputValue("shop_fixed_price") || "").trim();
    const defaultDaysRaw = (interaction.fields.getTextInputValue("shop_default_days") || "").trim();

    const shop_enabled = enabledRaw === "" ? null : (enabledRaw === "1" || enabledRaw.toLowerCase() === "sim" || enabledRaw.toLowerCase() === "true");
    const shop_price_per_day = pricePerDayRaw === "" ? null : Number(pricePerDayRaw);
    const shop_fixed_price = fixedPriceRaw === "" ? null : Number(fixedPriceRaw);
    const shop_default_days = defaultDaysRaw === "" ? null : Number(defaultDaysRaw);

    if (shop_price_per_day !== null && (!Number.isFinite(shop_price_per_day) || shop_price_per_day < 0)) {
      return interaction.reply({ content: "Preço por dia inválido.", ephemeral: true });
    }
    if (shop_fixed_price !== null && (!Number.isFinite(shop_fixed_price) || shop_fixed_price < 0)) {
      return interaction.reply({ content: "Preço fixo inválido.", ephemeral: true });
    }
    if (shop_default_days !== null && (!Number.isFinite(shop_default_days) || shop_default_days < 0)) {
      return interaction.reply({ content: "Dias padrão inválidos.", ephemeral: true });
    }

    await vipConfig.updateTier(guildId, tierId, "shop", {
      shop_enabled,
      shop_price_per_day,
      shop_fixed_price,
      shop_default_days,
    });

    return interaction.reply({ content: `✅ Configuração de loja do tier \`${tierId}\` atualizada.`, ephemeral: true });
  }
};