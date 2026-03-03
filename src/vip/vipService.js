function createVipService({ store, logger, configManager }) {
  let state = { vips: {}, settings: {}, guilds: {} };

  async function init() {
    state = await store.load() || { vips: {}, settings: {}, guilds: {} };
  }

  async function getMemberTier(member) {
    if (!member) return null;
    const tiers = await configManager.getGuildTiers(member.guild.id);
    const validTiers = [];

    for (const [id, data] of Object.entries(tiers)) {
      if (member.roles.cache.has(data.roleId)) {
        const full = await configManager.getTierConfig(member.guild.id, id);
        validTiers.push(full);
      }
    }
    // Ordena pelo preço mais alto
    return validTiers.sort((a, b) => b.preco_shop - a.preco_shop)[0] || null;
  }

  async function addVip(guildId, userId, { days, tierId }) {
    state.vips[guildId] = state.vips[guildId] || {};
    const now = Date.now();
    const expiresAt = days ? now + (days * 24 * 60 * 60 * 1000) : null;

    state.vips[guildId][userId] = { userId, guildId, tierId, expiresAt, addedAt: now };
    await store.save(state);
    return state.vips[guildId][userId];
  }

  // ... (Manter funções de Dama/Settings que você já tinha)

  return { 
    init, getMemberTier, addVip, 
    getVip: (gid, uid) => state.vips?.[gid]?.[uid],
    removeVip: async (gid, uid) => { delete state.vips?.[gid]?.[uid]; await store.save(state); },
    getGuildConfig: (gid) => state.guilds[gid] || {},
    setGuildConfig: async (gid, patch) => { state.guilds[gid] = {...(state.guilds[gid]||{}), ...patch}; await store.save(state); },
    getFullVipReport: async (gid) => ({ activeVips: Object.values(state.vips[gid] || {}) }),
    getSettings: (gid, uid) => state.settings?.[gid]?.[uid] || {},
    setSettings: async (gid, uid, patch) => { 
        state.settings[gid] = state.settings[gid] || {};
        state.settings[gid][uid] = {...(state.settings[gid][uid]||{}), ...patch};
        await store.save(state);
    }
  };
}
module.exports = { createVipService };
