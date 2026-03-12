const { EmbedBuilder } = require("discord.js");
const { logger } = require("../logger");

function createVipOnboarding({ client, vipService, logManager }) {
  const VIP_EMOJIS = ["💎", "👑", "🔥", "✨", "🎉"];
  const EFFECT_DURATION_MS = 10 * 60 * 1000; // 10 minutos

  async function sendPublicAnnouncement(guildId, user, tierConfig) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    // Usa guildConfig para canal de anúncios; fallback para systemChannel
    const { getGuildConfig } = require("../config/guildConfig");
    const guildConfig = await getGuildConfig(guildId);
    const channelId = guildConfig.announcementChannelId || guild.systemChannelId;
    if (!channelId) return;

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle("🎉 Novo VIP no Reino!")
      .setDescription(
        `O reino celebra! **${user.username}** acaba de se tornar um **${tierConfig.name || "VIP"}**! 💎`
      )
      .setColor(tierConfig.cor_exclusiva ? parseInt(tierConfig.cor_exclusiva.replace("#", "0x")) : 0x9b59b6)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "Tier", value: tierConfig.name || "VIP", inline: true },
        { name: "Dias", value: tierConfig.days === 0 ? "Permanente" : `${tierConfig.days} dias`, inline: true },
        { name: "Bônus", value: `+${tierConfig.valor_daily_extra || 0} 🪙 diários`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `VIP | © WDA - Todos os direitos reservados` });

    try {
      await channel.send({ content: `@everyone`, embeds: [embed] });
    } catch (err) {
      logger.error({ err, guildId, userId: user.id }, "Failed to send VIP announcement");
    }
  }

  async function sendWelcomeDM(user, tierConfig, guild) {
    const embed = new EmbedBuilder()
      .setTitle("👑 Bem-vindo ao VIP!")
      .setDescription(
        `Olá, **${user.username}**! Agradecemos por apoiar o servidor. Abaixo estão os principais comandos e informações para aproveitar seu VIP ao máximo.`
      )
      .setColor(0x9b59b6)
      .addFields(
        {
          name: "🎨 Personalizar Cargo",
          value: "Use \`/vip panel\` e depois clique em **Cargo Principal** para trocar a cor e o nome do seu cargo VIP.",
          inline: false,
        },
        {
          name: "👥 Família",
          value: (tierConfig.maxFamilyMembers || tierConfig.limite_familia || 0) > 0
            ? `Você pode convidar até **${tierConfig.maxFamilyMembers || tierConfig.limite_familia || 0}** membros para sua família VIP. Use o painel para gerenciar.`
            : "Seu plano não inclui família.",
          inline: false,
        },
        {
          name: "👥 2º Cargo (Amigo)",
          value: tierConfig.hasSecondRole || ((tierConfig.maxSecondRoleMembers || 0) > 0)
            ? `Você pode dar um cargo personalizado para até **${tierConfig.maxSecondRoleMembers || 0}** amigos.`
            : "Seu plano não inclui 2º cargo.",
          inline: false,
        },
        {
          name: "💰 Bônus Diário",
          value: `Seu bônus diário aumentou em **+${tierConfig.valor_daily_extra || 0} 🪙**. Use \`/economy daily\` todos os dias!`,
          inline: false,
        },
        {
          name: "⏳ Expiração",
          value: tierConfig.days === 0
            ? "Seu VIP é **permanente**."
            : `Seu VIP expira em **${tierConfig.days} dias**. Renove usando \`/shop\` ou peça a um staff.`,
          inline: false,
        },
      )
      .setThumbnail(guild.iconURL({ size: 256 }))
      .setTimestamp()
      .setFooter({ text: "VIP | Precisa de ajuda? Abra um ticket com /ticket • © WDA - Todos os direitos reservados" });

    try {
      await user.send({ embeds: [embed] });
    } catch (err) {
      logger.warn({ err, userId: user.id }, "Could not send VIP welcome DM (user may have DMs closed)");
    }
  }

  async function sendWelcomeInPrivateChannel(guildId, user, tierConfig) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const vipChannelManager = client.services?.vipChannel;
    if (!vipChannelManager) return;

    const { ok, textChannel } = await vipChannelManager.ensureVipChannels(user.id, { guildId });
    if (!ok || !textChannel) return;

    const embed = new EmbedBuilder()
      .setTitle("🎉 Seu espaço VIP está pronto!")
      .setDescription(
        `Este é seu chat privado VIP. Aqui você pode conversar com amigos e usar comandos exclusivos.`
      )
      .setColor(0x2ecc71)
      .addFields(
        { name: "🔧 Gerenciar", value: "Use \`/vip panel\` para gerenciar seu cargo, família e permissões.", inline: false },
        { name: "🎮 Diversão", value: "Convide amigos para sua call VIP usando o painel.", inline: false },
        { name: "📞 Call VIP", value: "Sua call privada já foi criada (se permitido pelo seu plano).", inline: false }
      )
      .setTimestamp()
      .setFooter({ text: `VIP | Canal de ${user.username} • © WDA - Todos os direitos reservados` });

    try {
      await textChannel.send({ embeds: [embed] });
    } catch (err) {
      logger.error({ err, guildId, userId: user.id }, "Failed to send welcome message to VIP channel");
    }
  }

  // Efeito visual: reações automáticas nas mensagens do novo VIP por 10 minutos
  async function startVisualEffect(guildId, userId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const emoji = VIP_EMOJIS[Math.floor(Math.random() * VIP_EMOJIS.length)];
    const endTime = Date.now() + EFFECT_DURATION_MS;

    const listener = async (message) => {
      if (message.author.id !== userId) return;
      if (Date.now() > endTime) {
        client.off("messageCreate", listener);
        return;
      }
      try {
        await message.react(emoji);
      } catch {
        // Ignorar erros de permissão ou emoji inválido
      }
    };

    client.on("messageCreate", listener);

    // Auto-remove after duration
    setTimeout(() => {
      client.off("messageCreate", listener);
    }, EFFECT_DURATION_MS);
  }

  async function runOnboarding({ guildId, user, tierConfig, source = "manual" }) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    // 1) Anúncio público
    await sendPublicAnnouncement(guildId, user, tierConfig);

    // 2) DM de boas-vindas
    await sendWelcomeDM(user, tierConfig, guild);

    // 3) Mensagem no canal privado VIP (se existir)
    await sendWelcomeInPrivateChannel(guildId, user, tierConfig);

    // 4) Efeito visual (reações)
    await startVisualEffect(guildId, user.id);

    // Log de auditoria
    const logManager = client.services?.logManager;
    if (logManager) {
      await logManager.logUserAction({
        guildId,
        action: "VIP_ONBOARDING",
        user,
        details: {
          source,
          tier: tierConfig.name || tierConfig.id,
          days: tierConfig.days,
        },
      });
    }

    logger.info({ guildId, userId: user.id, tierId: tierConfig.id, source }, "VIP onboarding completed");
  }

  return {
    runOnboarding,
    sendPublicAnnouncement,
    sendWelcomeDM,
    sendWelcomeInPrivateChannel,
    startVisualEffect,
  };
}

module.exports = { createVipOnboarding };
