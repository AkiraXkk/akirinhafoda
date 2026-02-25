const { ChannelType, PermissionFlagsBits } = require("discord.js");

function createVipChannelManager({ client, vipService, logger }) {
  async function fetchGuild(targetGuildId) {
    if (!targetGuildId) return null;
    return client.guilds.fetch(targetGuildId).catch(() => null);
  }

  async function fetchMember(guild, userId) {
    if (!guild) return null;
    return guild.members.fetch(userId).catch(() => null);
  }

  async function ensureVipChannels(userId, { guildId: targetGuildId } = {}) {
    const guild = await fetchGuild(targetGuildId);
    const member = await fetchMember(guild, userId);
    if (!guild || !member) return { ok: false, reason: "guild_or_member_unavailable" };

    const guildConfig = vipService.getGuildConfig(guild.id);
    const catId = guildConfig?.vipCategoryId;

    if (!catId) return { ok: false, reason: "no_category_configured" };

    // Verifica se já existem
    const settings = vipService.getSettings(userId) || {};
    let textChannel = settings.textChannelId
      ? await guild.channels.fetch(settings.textChannelId).catch(() => null)
      : null;
    let voiceChannel = settings.voiceChannelId
      ? await guild.channels.fetch(settings.voiceChannelId).catch(() => null)
      : null;

    const baseName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "");
    const textName = `chat-${baseName}`;
    const voiceName = `Call ${member.user.username}`;

    const permissionOverwrites = [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.ManageChannels, // Permite editar nome/perms
        ],
      },
      {
        id: client.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels],
      },
    ];

    if (!textChannel) {
      textChannel = await guild.channels.create({
        name: textName,
        type: ChannelType.GuildText,
        parent: catId,
        permissionOverwrites,
        topic: `Canal VIP de ${member.user.tag}`,
      });
    }

    if (!voiceChannel) {
      voiceChannel = await guild.channels.create({
        name: voiceName,
        type: ChannelType.GuildVoice,
        parent: catId,
        permissionOverwrites,
      });
    }

    // Salva IDs
    if (textChannel.id !== settings.textChannelId || voiceChannel.id !== settings.voiceChannelId) {
      await vipService.setSettings(userId, {
        guildId: targetGuildId || guild.id,
        textChannelId: textChannel.id,
        voiceChannelId: voiceChannel.id,
      });
    }

    return { ok: true, textChannel, voiceChannel };
  }

  async function deleteVipChannels(userId, { guildId: targetGuildId } = {}) {
    const guild = await fetchGuild(targetGuildId);
    if (!guild) return { ok: false };

    const settings = vipService.getSettings(userId) || {};
    
    if (settings.textChannelId) {
      const c = await guild.channels.fetch(settings.textChannelId).catch(() => null);
      if (c) await c.delete().catch(() => {});
    }

    if (settings.voiceChannelId) {
      const c = await guild.channels.fetch(settings.voiceChannelId).catch(() => null);
      if (c) await c.delete().catch(() => {});
    }

    await vipService.setSettings(userId, { textChannelId: null, voiceChannelId: null });
    return { ok: true };
  }

  async function archiveVipChannels(userId, { guildId: targetGuildId } = {}) {
    const guild = await fetchGuild(targetGuildId);
    if (!guild) return { ok: false, reason: "guild_unavailable" };

    const settings = vipService.getSettings(userId) || {};
    let textChannel = settings.textChannelId
      ? await guild.channels.fetch(settings.textChannelId).catch(() => null)
      : null;
    let voiceChannel = settings.voiceChannelId
      ? await guild.channels.fetch(settings.voiceChannelId).catch(() => null)
      : null;

    if (!textChannel && !voiceChannel) return { ok: false, reason: "no_channels" };

    const ensureArchiveCategory = async () => {
      const config = vipService.getGuildConfig(guild.id) || {};
      if (config.vipArchiveCategoryId) {
        const existing = await guild.channels.fetch(config.vipArchiveCategoryId).catch(() => null);
        if (existing) return existing;
      }

      const category = await guild.channels
        .create({
          name: "📦｜Arquivo VIP",
          type: ChannelType.GuildCategory,
          reason: "Categoria de arquivamento de canais VIP",
        })
        .catch(() => null);

      if (category) {
        await vipService.setGuildConfig(guild.id, { vipArchiveCategoryId: category.id }).catch(() => {});
      }

      return category;
    };

    const archiveCategory = await ensureArchiveCategory().catch(() => null);

    const archiveChannel = async (channel) => {
        if (!channel) return;
        try {
            // Rename
            const oldName = channel.name;
            const newName = `arq-${oldName.slice(0, 90)}`; // Ensure length limit
            if (channel.type === ChannelType.GuildText) {
              await channel.setName(newName.toLowerCase().replace(/\s+/g, "-")).catch(() => {});
            } else {
              await channel.setName(newName).catch(() => {});
            }

            if (archiveCategory && channel.parentId !== archiveCategory.id) {
              await channel.setParent(archiveCategory.id).catch(() => {});
            }

            // Remove user permissions (or deny View)
            await channel.permissionOverwrites.edit(userId, {
                [PermissionFlagsBits.ViewChannel]: false,
                [PermissionFlagsBits.Connect]: false,
                [PermissionFlagsBits.SendMessages]: false
            }).catch(() => {});
            
            // Optionally move to an archive category if you had one, but we don't.
        } catch (e) {
            logger?.error?.({ err: e, channelId: channel.id }, "Failed to archive channel");
        }
    };

    await archiveChannel(textChannel);
    await archiveChannel(voiceChannel);

    // Remove from settings so they are no longer "active" VIP channels
    await vipService.setSettings(userId, { textChannelId: null, voiceChannelId: null }).catch(() => {});

    return { ok: true };
  }

  async function updateChannelPermissions(userId, { guildId: targetGuildId, targetUserId, allow } = {}) {
    const guild = await fetchGuild(targetGuildId);
    if (!guild) return { ok: false, reason: "guild_unavailable" };

    const settings = vipService.getSettings(userId) || {};
    const textChannel = settings.textChannelId
      ? await guild.channels.fetch(settings.textChannelId).catch(() => null)
      : null;
    const voiceChannel = settings.voiceChannelId
      ? await guild.channels.fetch(settings.voiceChannelId).catch(() => null)
      : null;

    if (!textChannel && !voiceChannel) return { ok: false, reason: "no_channels" };

    const permissions = allow
      ? {
          [PermissionFlagsBits.ViewChannel]: true,
          [PermissionFlagsBits.SendMessages]: true,
          [PermissionFlagsBits.Connect]: true,
          [PermissionFlagsBits.Speak]: true,
        }
      : {
          [PermissionFlagsBits.ViewChannel]: false,
        };

    if (textChannel) {
      await textChannel.permissionOverwrites.edit(targetUserId, permissions).catch(() => {});
    }
    
    if (voiceChannel) {
      await voiceChannel.permissionOverwrites.edit(targetUserId, permissions).catch(() => {});
    }

    return { ok: true };
  }

  async function updateChannelName(userId, newName, { guildId: targetGuildId, type = "both" } = {}) {
    const guild = await fetchGuild(targetGuildId);
    if (!guild) return { ok: false, reason: "guild_unavailable" };

    const settings = vipService.getSettings(userId) || {};
    const textChannel = settings.textChannelId
      ? await guild.channels.fetch(settings.textChannelId).catch(() => null)
      : null;
    const voiceChannel = settings.voiceChannelId
      ? await guild.channels.fetch(settings.voiceChannelId).catch(() => null)
      : null;

    if (!textChannel && !voiceChannel) return { ok: false, reason: "no_channels" };

    try {
        if (textChannel && (type === "both" || type === "text")) {
            // Discord não permite emojis/espaços em canais de texto normalmente, mas vamos tentar setar o nome
            // Se falhar, o Discord sanitiza.
            await textChannel.setName(newName.toLowerCase().replace(/\s+/g, '-'));
        }
        if (voiceChannel && (type === "both" || type === "voice")) {
            await voiceChannel.setName(newName);
        }
    } catch (e) {
        return { ok: false, reason: e.message };
    }

    return { ok: true };
  }

  return { ensureVipChannels, deleteVipChannels, archiveVipChannels, updateChannelPermissions, updateChannelName };
}

module.exports = { createVipChannelManager };
