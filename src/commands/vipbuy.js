const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { getGuildConfig } = require("../config/guildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipbuy")
    .setDescription("Compra dias de VIP usando suas moedas")
    .addIntegerOption((opt) =>
      opt.setName("dias").setDescription("Quantos dias de VIP deseja comprar?").setMinValue(1).setRequired(true)
    ),

  async execute(interaction) {
    // Comando mantido por compatibilidade: fluxo oficial agora é via /shop
    // (não remove nada do código antigo para não quebrar integrações)
    try {
      const dias = interaction.options.getInteger("dias");
      return interaction.reply({
        embeds: [createEmbed({
          title: "🛒 Compra de VIP",
          description: `A compra de VIP foi unificada no comando **/shop**.\n\nUse:\n- \`/shop vip\` para ver os planos\n- \`/shop buy item:vip_days quantity:${dias}\` para comprar por dias`,
          color: 0x3498db,
          user: interaction.user,
        })],
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      // segue o fluxo antigo abaixo
    }

    const economyService = interaction.client.services.economy;
    const vipConfig = interaction.client.services.vipConfig;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const dias = interaction.options.getInteger("dias");

    try {
      // Buscar todos os Tiers disponíveis no servidor
      const tiers = await vipConfig.getGuildTiers(guildId);
      
      if (!tiers || Object.keys(tiers).length === 0) {
        return interaction.reply({
          embeds: [createErrorEmbed("Não há planos VIP disponíveis neste servidor. Configure os planos usando `/vipadmin tier`.")],
          flags: MessageFlags.Ephemeral,
        });
      }

      // Verificar saldo do usuário
      const balance = await economyService.getBalance(guildId, userId);
      const coins = balance?.coins || 0;
      
      // Criar opções do menu dinamicamente
      const options = [];
      for (const [tierId, tierData] of Object.entries(tiers)) {
        const tierConfig = await vipConfig.getTierConfig(guildId, tierId);
        if (!tierConfig) continue;
        if (tierConfig.shop_enabled === false) continue;
        const unit = (Number.isFinite(tierConfig.shop_price_per_day)
          ? tierConfig.shop_price_per_day
          : (tierConfig?.preco_shop ?? tierData.preco_shop ?? tierData.price ?? 0));
        const precoTotal = unit * dias;
        const podeComprar = coins >= precoTotal;
        
        const tierName = (tierData.name || tierId).substring(0, 80);
        const precoTotalStr = `${precoTotal} WDA Coins`;
        const label = `${tierName} - ${precoTotalStr}`.substring(0, 100);
        
        options.push(
          new StringSelectMenuOptionBuilder()
            .setLabel(label)
            .setValue(`${tierId}_${dias}_${precoTotal}`)
            .setDescription(`${dias} dias - ${podeComprar ? '✅ Saldo suficiente' : '❌ Saldo insuficiente'}`.substring(0, 100))
            .setEmoji(podeComprar ? '💎' : '🚫')
        );
      }

      // Adicionar opção de pagamento em R$
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel('💳 Pagar com R$ (Abrir Ticket)')
          .setValue('real_payment')
          .setDescription('Abre um ticket de suporte para pagamento via PIX/Boleto')
          .setEmoji('💳')
      );

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('vipbuy_select_tier')
        .setPlaceholder('Selecione um plano VIP')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const embed = createEmbed({
        title: "💎 Comprar VIP",
        description: `Seu saldo atual: **${coins} WDA Coins**\n\nSelecione o plano VIP desejado para ${dias} dias:`,
        fields: [
          { name: "📅 Duração", value: `${dias} dias`, inline: true },
          { name: "💰 Saldo", value: `${coins} WDA Coins`, inline: true },
          { name: "🎯 Planos", value: `${Object.keys(tiers).length} disponíveis`, inline: true },
        ],
        color: 0x9b59b6,
        user: interaction.user,
      });

      await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      console.error('Erro no comando vipbuy:', error);
      return interaction.reply({
        embeds: [createErrorEmbed('Ocorreu um erro ao processar sua solicitação.')],
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  async handleSelectMenu(interaction) {
    if (interaction.customId !== 'vipbuy_select_tier') return;

    const economyService = interaction.client.services.economy;
    const vipService = interaction.client.services.vip;
    const vipConfig = interaction.client.services.vipConfig;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const selectedValue = interaction.values[0];

    try {
      // Opção de pagamento em R$
      if (selectedValue === 'real_payment') {
        const embed = createEmbed({
          title: "💳 Pagamento via R$",
          description: "Para comprar VIP com pagamento real (PIX/Boleto), abra um ticket de suporte.",
          fields: [
            {
              name: "📞 Como proceder",
              value:
                "1. Use o comando `/ticket` para abrir um suporte\n2. Informe o plano desejado\n3. Nossa equipe irá te ajudar com o pagamento",
            },
            {
              name: "💡 Benefícios",
              value: "• Suporte prioritário\n• Processamento rápido\n• Diversas formas de pagamento",
            },
          ],
          color: 0x3498db,
          user: interaction.user,
        });

        const buttonRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('🎫 Abrir Ticket')
            .setStyle(ButtonStyle.Primary)
            .setCustomId('vipbuy_open_ticket')
        );

        return await interaction.update({
          embeds: [embed],
          components: [buttonRow]
        });
      }

      // Parse da seleção: tierId_dias_precoTotal
      const [tierId, dias, precoTotal] = selectedValue.split('_');
      
      await interaction.deferUpdate().catch(() => {});

      // Verificar configuração do tier
      const tierConfig = await vipConfig.getTierConfig(guildId, tierId);
      if (!tierConfig) {
        return await interaction.editReply({
          embeds: [createErrorEmbed('Plano VIP não encontrado.')],
          components: []
        });
      }
      if (tierConfig.shop_enabled === false) {
        return await interaction.editReply({
          embeds: [createErrorEmbed('Este plano VIP não está disponível para compra no bot.')],
          components: []
        });
      }

      // Verificar saldo
      const balance = await economyService.getBalance(guildId, userId);
      const coins = balance?.coins || 0;
      if (coins < parseInt(precoTotal)) {
        return await interaction.editReply({
          embeds: [createErrorEmbed(`Saldo insuficiente! Você precisa de ${precoTotal} WDA Coins, mas tem apenas ${coins}.`)],
          components: []
        });
      }

      // Processar pagamento
      const ok = await economyService.removeCoins(guildId, userId, parseInt(precoTotal));
      if (!ok) {
        return await interaction.editReply({
          embeds: [createErrorEmbed("Não foi possível debitar suas moedas. Tente novamente.")],
          components: [],
        });
      }

      // Adicionar VIP
      await vipService.addVip(guildId, userId, {
        days: parseInt(dias),
        tierId: tierId,
        source: "shop"
      });

      // Log da compra automática
      const transactionId = `VIP_BUY_${Date.now()}_${userId}`;
      const logService = interaction.client.services?.log;
      if (logService?.logVipAction) {
        await logService.logVipAction(interaction.guild, {
          action: "Comprado",
          targetUser: interaction.user,
          staffUser: null, // Sistema automático
          tierConfig: tierConfig,
          duration: parseInt(dias),
          price: parseInt(precoTotal),
          paymentMethod: "coins",
          transactionId: transactionId,
        });
      }

      const embed = createEmbed({
        title: "✅ VIP Comprado com Sucesso!",
        description: `Parabéns! Você agora é VIP **${tierConfig.name}** por ${dias} dias.`,
        fields: [
          { name: "💎 Plano", value: tierConfig.name, inline: true },
          { name: "📅 Duração", value: `${dias} dias`, inline: true },
          { name: "💰 Valor Pago", value: `${precoTotal} WDA Coins`, inline: true },
          {
            name: "🎁 Benefícios",
            value: `• ${tierConfig.maxDamas} Primeira(s) Dama(s)\n• ${tierConfig.canFamily ? "Pode" : "Não pode"} criar família\n• ${tierConfig.hasSecondRole ? "Pode" : "Não pode"} criar cargo personalizado`,
          },
        ],
        color: 0x2ecc71,
        footer: { text: `Transação: ${transactionId}` },
        user: interaction.user,
      });

      await interaction.editReply({
        embeds: [embed],
        components: []
      });

    } catch (error) {
      console.error('Erro ao processar compra VIP:', error);
      await interaction.editReply({
        embeds: [createErrorEmbed('Ocorreu um erro ao processar sua compra. Contate a equipe de suporte.')],
        components: []
      });
    }
  },

  async handleButton(interaction) {
    if (interaction.customId === 'vipbuy_open_ticket') {
      await interaction.deferUpdate().catch(() => {});

      // Verificar se existe canal de tickets configurado
      const guildConfig = await getGuildConfig(interaction.guildId);
      const ticketChannelId = guildConfig?.ticketChannelId;

      if (ticketChannelId) {
        const embed = createEmbed({
          title: "🎫 Canal de Suporte",
          description: `Vá ao canal <#${ticketChannelId}> e abra um ticket para comprar VIP com pagamento real.`,
          color: 0x3498db,
          user: interaction.user,
        });
        return await interaction.editReply({ embeds: [embed], components: [] });
      } else {
        const embed = createErrorEmbed("O sistema de tickets não está configurado. Contate um administrador.");
        return await interaction.editReply({ embeds: [embed], components: [] });
      }
    }
  }
};
