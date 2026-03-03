const { ChannelType, PermissionFlagsBits } = require("discord.js");

function createVipChannelManager({ client, vipService, logger }) {
  async function fetchGuild(targetGuildId) {
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

    const tier = await vipService.getMemberTier(member);
    if (!tier) return { ok: false, reason: "not_a_vip" };

    const guildConfig = vipService.getGuildConfig(guild.id);
    const catId = guildConfig?.vipCategoryId;
    if (!catId) return { ok: false, reason: "no_category_configured" };

    const settings = vipService.getSettings(guild.id, userId) || {};
    
    // --- Lógica de Permissões ---
    const permissionOverwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] },
      {
        id: settings.roleId || member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.Stream, // Host de Honra 1080p
          PermissionFlagsBits.ManageChannels, // Para renomear
          PermissionFlagsBits.ManageMessages, // Para fixar/apagar
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ],
      }
    ];

    // Cargo Fantasma: Vê quem está dentro, mas não consegue conectar
    if (guildConfig?.cargoFantasmaId) {
      permissionOverwrites.push({
        id: guildConfig.cargoFantasmaId,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.Connect] 
      });
    }

    const baseName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "");

    // Criação/Atualização do Chat (se o Tier permitir)
    let textChannel = settings.textChannelId ? await guild.channels.fetch(settings.textChannelId).catch(() => null) : null;
    if (!textChannel && tier.chat_privado) {
      textChannel = await guild.channels.create({
        name: `💬-${baseName}`,
        type: ChannelType.GuildText,
        parent: catId,
        permissionOverwrites,
      });
    } else if (textChannel) {
      await textChannel.edit({ permissionOverwrites }).catch(() => {});
    }

    // Criação/Atualização da Call (se o Tier permitir)
    let voiceChannel = settings.voiceChannelId ? await guild.channels.fetch(settings.voiceChannelId).catch(() => null) : null;
    if (!voiceChannel && tier.canCall) {
      voiceChannel = await guild.channels.create({
        name: `🔊 ${member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: catId,
        permissionOverwrites,
        bitrate: tier.high_quality_voice ? 96000 : 64000,
      });
    } else if (voiceChannel) {
      await voiceChannel.edit({ permissionOverwrites, bitrate: tier.high_quality_voice ? 96000 : 64000 }).catch(() => {});
    }

    if (textChannel?.id !== settings.textChannelId || voiceChannel?.id !== settings.voiceChannelId) {
      await vipService.setSettings(guild.id, userId, {
        textChannelId: textChannel?.id || settings.textChannelId,
        voiceChannelId: voiceChannel?.id || settings.voiceChannelId,
      });
    }

    return { ok: true, textChannel, voiceChannel };
  }

  return { ensureVipChannels, updateChannelName: async (userId, newName, { guildId }) => {
      // Simplificado para garantir funcionamento via comando /vip call/chat
      const guild = await fetchGuild(guildId);
      const settings = vipService.getSettings(guildId, userId);
      const voice = settings.voiceChannelId ? await guild.channels.fetch(settings.voiceChannelId).catch(() => null) : null;
      if (voice) await voice.setName(`🔊 ${newName}`).catch(() => {});
      return { ok: true };
  }};
}

module.exports = { createVipChannelManager };