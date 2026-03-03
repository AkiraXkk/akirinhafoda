const { ChannelType, PermissionFlagsBits } = require("discord.js");

function createVipChannelManager({ client, vipService, logger }) {
  async function fetchGuild(targetGuildId) {
    return client.guilds.fetch(targetGuildId).catch(() => null);
  }

  async function ensureVipChannels(userId, { guildId: targetGuildId } = {}) {
    const guild = await fetchGuild(targetGuildId);
    if (!guild) return { ok: false };
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { ok: false };

    const tier = await vipService.getMemberTier(member);
    if (!tier) return { ok: false };

    const gConfig = vipService.getGuildConfig(guild.id);
    const settings = vipService.getSettings(guild.id, userId) || {};

    const permissionOverwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] },
      {
        id: settings.roleId || userId,
        allow: [
          PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, 
          PermissionFlagsBits.Speak, PermissionFlagsBits.Stream,
          PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles
        ]
      }
    ];

    // Lógica Fantasma: Vê a call mas não conecta
    if (gConfig?.cargoFantasmaId) {
      permissionOverwrites.push({
        id: gConfig.cargoFantasmaId,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.Connect]
      });
    }

    let textId = settings.textChannelId;
    let voiceId = settings.voiceChannelId;

    if (tier.chat_privado && !textId) {
      const ch = await guild.channels.create({
        name: `💬-${member.user.username}`,
        type: ChannelType.GuildText,
        parent: gConfig.vipCategoryId,
        permissionOverwrites
      });
      textId = ch.id;
    }

    if (tier.canCall && !voiceId) {
      const ch = await guild.channels.create({
        name: `🔊 ${member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: gConfig.vipCategoryId,
        permissionOverwrites,
        bitrate: tier.high_quality_voice ? 96000 : 64000
      });
      voiceId = ch.id;
    }

    await vipService.setSettings(guild.id, userId, { textChannelId: textId, voiceChannelId: voiceId });
    return { ok: true };
  }

  async function deleteVipChannels(userId, { guildId }) {
    const guild = await fetchGuild(guildId);
    const settings = vipService.getSettings(guildId, userId);
    if (settings?.textChannelId) await guild.channels.delete(settings.textChannelId).catch(() => {});
    if (settings?.voiceChannelId) await guild.channels.delete(settings.voiceChannelId).catch(() => {});
    return { ok: true };
  }

  async function updateChannelName(userId, newName, { guildId }) {
    const settings = vipService.getSettings(guildId, userId);
    const agora = Date.now();
    
    // Rate limit: 5 minutos
    if (settings.lastRename && agora - settings.lastRename < 300000) return { ok: false, reason: "Aguarde 5 min." };

    const guild = await fetchGuild(guildId);
    if (settings.voiceChannelId) {
      const ch = await guild.channels.fetch(settings.voiceChannelId).catch(() => null);
      if (ch) await ch.setName(`🔊 ${newName}`);
    }
    await vipService.setSettings(guildId, userId, { lastRename: agora });
    return { ok: true };
  }

  return { ensureVipChannels, deleteVipChannels, updateChannelName };
}

module.exports = { createVipChannelManager };
