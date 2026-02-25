function parseHexColor(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  const hex = v.startsWith("#") ? v.slice(1) : v;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return Number.parseInt(hex, 16);
}

function clampRoleName(name, fallback) {
  const v = typeof name === "string" ? name.trim() : "";
  const s = v || fallback;
  return s.length > 100 ? s.slice(0, 100) : s;
}

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
}

function createVipRoleManager({ client, vipService, logger }) {
  async function fetchGuild(targetGuildId) {
    if (!targetGuildId) return null;
    return client.guilds.fetch(targetGuildId).catch(() => null);
  }

  async function fetchMember(guild, userId) {
    if (!guild) return null;
    return guild.members.fetch(userId).catch(() => null);
  }

  async function fetchRole(guild, roleId) {
    if (!guild || !roleId) return null;
    return guild.roles.fetch(roleId).catch(() => null);
  }

  async function ensurePersonalRole(userId, { guildId: targetGuildId } = {}) {
    const guild = await fetchGuild(targetGuildId);
    const member = await fetchMember(guild, userId);
    if (!guild || !member) return { ok: false, reason: "guild_or_member_unavailable" };

    const settings = vipService.getSettings(userId) || {};
    const existingRole = await fetchRole(guild, settings.roleId);

    const fallbackName = `VIP | ${member.user.username}`;
    const desiredName = clampRoleName(settings.roleName, fallbackName);
    const desiredColor = parseHexColor(settings.roleColor);
    const desiredHoist = toBool(settings.hoist, false);
    const desiredMentionable = toBool(settings.mentionable, false);

    const role =
      existingRole ||
      (await guild.roles
        .create({
          name: desiredName,
          color: desiredColor ?? undefined,
          hoist: desiredHoist,
          mentionable: desiredMentionable,
          reason: `VIP auto role for ${member.user.tag}`,
        })
        .catch(() => null));

    if (!role) return { ok: false, reason: "role_create_failed" };

    const needsEdit =
      role.name !== desiredName ||
      (desiredColor !== null && role.color !== desiredColor) ||
      role.hoist !== desiredHoist ||
      role.mentionable !== desiredMentionable;

    if (needsEdit) {
      await role
        .edit({
          name: desiredName,
          color: desiredColor ?? undefined,
          hoist: desiredHoist,
          mentionable: desiredMentionable,
          reason: `VIP role update for ${member.user.tag}`,
        })
        .catch(() => {});
    }

    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, `VIP auto assign for ${member.user.tag}`).catch(() => {});
    }

    await vipService
      .setSettings(userId, {
        roleId: role.id,
        guildId: targetGuildId || guild.id,
        roleName: desiredName,
        roleColor: settings.roleColor || null,
        hoist: desiredHoist,
        mentionable: desiredMentionable,
        updatedAt: Date.now(),
        createdAt: settings.createdAt || Date.now(),
      })
      .catch(() => {});

    logger?.info?.({ userId, roleId: role.id }, "VIP role ensured");
    return { ok: true, role, member, guild };
  }

  async function updatePersonalRole(userId, patch, { guildId: targetGuildId } = {}) {
    if (patch.roleColor && parseHexColor(patch.roleColor) === null) {
        return { ok: false, reason: "Cor inválida. Use formato HEX (ex: #FF0000)" };
    }
    const existing = vipService.getSettings(userId) || {};
    const next = { ...existing, ...patch };
    await vipService.setSettings(userId, next);
    return ensurePersonalRole(userId, { guildId: targetGuildId });
  }

  async function deletePersonalRole(userId, { guildId: targetGuildId } = {}) {
    const guild = await fetchGuild(targetGuildId);
    if (!guild) return { ok: false, reason: "guild_unavailable" };

    const settings = vipService.getSettings(userId) || {};
    if (!settings.roleId) return { ok: true, reason: "no_role_saved" };

    const role = await fetchRole(guild, settings.roleId);
    if (role) {
      await role.delete(`VIP expired/removed for ${userId}`).catch(() => {});
    }

    await vipService.setSettings(userId, { roleId: null }).catch(() => {});
    return { ok: true };
  }

  return { ensurePersonalRole, updatePersonalRole, deletePersonalRole };
}

module.exports = { createVipRoleManager };
