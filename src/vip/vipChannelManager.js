// ============================================================
//  vipChannelManager.js  —  Refatorado
//  Novidades:
//   • Cargo Fantasma aplicado em canais de texto E voz:
//       ViewChannel: true, Connect: false, SendMessages: false
//   • Lê cargoFantasmaId de vipService.getGuildConfig
// ============================================================

const { ChannelType, PermissionFlagsBits } = require("discord.js");

function createVipChannelManager({ client, vipService, logger }) {
  async function fetchGuild(targetGuildId) {
    return client.guilds.fetch(targetGuildId).catch(() => null);
  }

  // ---------------------------------------------------------
  //  Monta o array de permissionOverwrites padrão para canais VIP.
  //  O Cargo Fantasma recebe ViewChannel mas NÃO Connect/SendMessages.
  // ---------------------------------------------------------
  function buildChannelPerms(guild, userId, settings, gConfig) {
    const perms = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: client.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels],
      },
      {
        id: userId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.Stream,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ];

    // Cargo personalizado do usuário (se existir)
    if (settings?.roleId) {
      perms.push({
        id: settings.roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.Stream,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
        ],
      });
    }

    // Cargo Fantasma — vê mas NÃO entra/escreve
    if (gConfig?.cargoFantasmaId) {
      perms.push({
        id: gConfig.cargoFantasmaId,
        allow: [PermissionFlagsBits.ViewChannel],
        deny:  [PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages],
      });
    }

    return perms;
  }

  // ---------------------------------------------------------
  //  ensureVipChannels — cria canais de texto e/ou voz
  // ---------------------------------------------------------
  async function ensureVipChannels(userId, { guildId: targetGuildId } = {}) {
    const guild = await fetchGuild(targetGuildId);
    if (!guild) return { ok: false };

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { ok: false };

    const tier = await vipService.getMemberTier(member);
    if (!tier) return { ok: false };

    const gConfig = vipService.getGuildConfig(guild.id);

    if (!gConfig?.vipCategoryId) {
      logger?.warn?.({ guildId: guild.id, userId }, "vipCategoryId não configurado — use /vipadmin infra setup");
      return { ok: false, reason: "Categoria VIP não configurada. Use /vipadmin infra setup." };
    }

    // Valida se a categoria pai realmente existe no servidor
    const category = await guild.channels.fetch(gConfig.vipCategoryId).catch(() => null);
    if (!category) {
      console.error(`[VIP] vipCategoryId=${gConfig.vipCategoryId} não encontrado no servidor guildId=${guild.id}. Reconfigure via /vipadmin infra setup.`);
      logger?.error?.({ guildId: guild.id, categoryId: gConfig.vipCategoryId }, "Categoria VIP não encontrada no servidor");
      return { ok: false, reason: "Categoria VIP não encontrada. Reconfigure via /vipadmin infra setup." };
    }

    const settings           = vipService.getSettings(guild.id, userId) || {};
    const permissionOverwrites = buildChannelPerms(guild, userId, settings, gConfig);

    let textId  = settings.textChannelId;
    let voiceId = settings.voiceChannelId;

    if (tier.chat_privado && !textId) {
      try {
        const ch = await guild.channels.create({
          name:   `💬-${member.user.username}`,
          type:   ChannelType.GuildText,
          parent: gConfig.vipCategoryId,
          permissionOverwrites,
        });
        if (ch) textId = ch.id;
      } catch (err) {
        console.error(`[VIP] Falha ao criar canal de texto para userId=${userId} guildId=${guild.id}:`, err.message, `(code: ${err.code})`);
        logger?.error?.({ err, userId, categoryId: gConfig.vipCategoryId }, "Falha ao criar canal de texto VIP — verifique permissões e hierarquia");
      }
    }

    if (tier.canCall && !voiceId) {
      try {
        const ch = await guild.channels.create({
          name:    `🔊 ${member.user.username}`,
          type:    ChannelType.GuildVoice,
          parent:  gConfig.vipCategoryId,
          permissionOverwrites,
          bitrate: tier.high_quality_voice ? 96000 : 64000,
        });
        if (ch) voiceId = ch.id;
      } catch (err) {
        console.error(`[VIP] Falha ao criar canal de voz para userId=${userId} guildId=${guild.id}:`, err.message, `(code: ${err.code})`);
        logger?.error?.({ err, userId, categoryId: gConfig.vipCategoryId }, "Falha ao criar canal de voz VIP — verifique permissões e hierarquia");
      }
    }

    await vipService.setSettings(guild.id, userId, { textChannelId: textId, voiceChannelId: voiceId });
    return { ok: true };
  }

  // ---------------------------------------------------------
  //  deleteVipChannels
  // ---------------------------------------------------------
  async function deleteVipChannels(userId, { guildId }) {
    const guild    = await fetchGuild(guildId);
    if (!guild) return { ok: false };

    const settings = vipService.getSettings(guildId, userId);
    if (settings?.textChannelId) {
      await guild.channels.delete(settings.textChannelId).catch(() => {});
    }
    if (settings?.voiceChannelId) {
      await guild.channels.delete(settings.voiceChannelId).catch(() => {});
    }
    // Limpa os IDs do settings
    await vipService.setSettings(guildId, userId, { textChannelId: null, voiceChannelId: null });
    return { ok: true };
  }

  // ---------------------------------------------------------
  //  updateChannelName — rate limit de 5 min
  // ---------------------------------------------------------
  async function updateChannelName(userId, newName, { guildId }) {
    const settings = vipService.getSettings(guildId, userId);
    const agora    = Date.now();

    if (settings.lastRename && agora - settings.lastRename < 300_000) {
      return { ok: false, reason: "Aguarde 5 minutos para renomear novamente." };
    }

    const guild = await fetchGuild(guildId);
    if (!guild) return { ok: false };

    if (settings.voiceChannelId) {
      const ch = await guild.channels.fetch(settings.voiceChannelId).catch(() => null);
      if (ch) await ch.setName(`🔊 ${newName}`).catch(() => {});
    }
    if (settings.textChannelId) {
      const ch = await guild.channels.fetch(settings.textChannelId).catch(() => null);
      if (ch) await ch.setName(`💬-${newName}`).catch(() => {});
    }

    await vipService.setSettings(guildId, userId, { lastRename: agora });
    return { ok: true };
  }

  return { ensureVipChannels, deleteVipChannels, updateChannelName };
}

module.exports = { createVipChannelManager };
