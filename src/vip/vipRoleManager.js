function createVipRoleManager({ client, vipService, logger }) {
  async function ensurePersonalRole(userId, { guildId }) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    const member = await guild?.members.fetch(userId).catch(() => null);
    if (!member) return { ok: false };

    const tier = await vipService.getMemberTier(member);
    if (!tier?.hasSecondRole) return { ok: false, reason: "Sem permissão para cargo personalizado." };

    const settings = vipService.getSettings(guildId, userId);
    let role = settings.roleId ? await guild.roles.fetch(settings.roleId).catch(() => null) : null;

    if (!role) {
      role = await guild.roles.create({
        name: settings.roleName || `VIP | ${member.user.username}`,
        color: settings.roleColor || 0,
        reason: "VIP Role Creation"
      });
    }

    const gConfig = vipService.getGuildConfig(guildId);
    if (gConfig.personalSeparatorRoleId) {
      const sep = await guild.roles.fetch(gConfig.personalSeparatorRoleId).catch(() => null);
      if (sep) await role.setPosition(sep.position - 1).catch(() => {});
    }

    if (!member.roles.cache.has(role.id)) await member.roles.add(role);
    await vipService.setSettings(guildId, userId, { roleId: role.id });
    return { ok: true, role };
  }

  return { 
    ensurePersonalRole, 
    updatePersonalRole: (userId, patch, opts) => {
        // Salva as novas configs antes de garantir o cargo
        return vipService.setSettings(opts.guildId, userId, patch).then(() => ensurePersonalRole(userId, opts));
    },
    deletePersonalRole: async (userId, { guildId }) => {
        const settings = vipService.getSettings(guildId, userId);
        if (settings.roleId) {
            const guild = await client.guilds.fetch(guildId);
            const role = await guild.roles.fetch(settings.roleId).catch(() => null);
            if (role) await role.delete().catch(() => {});
            await vipService.setSettings(guildId, userId, { roleId: null });
        }
    }
  };
}
module.exports = { createVipRoleManager };
