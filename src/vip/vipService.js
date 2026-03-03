function createVipService({ store, logger, configManager, client }) {
  let state = { vips: {}, settings: {}, guilds: {} };
  let hooks = { onAdd: [], onRemove: [], onExpire: [] };

  async function init() {
    state = await store.load() || { vips: {}, settings: {}, guilds: {} };
  }

  function addHook(type, fn) {
    if (!hooks[type]) hooks[type] = [];
    hooks[type].push(fn);
  }

  async function runHooks(type, payload) {
    if (!hooks[type]) return;
    for (const fn of hooks[type]) {
      try {
        await fn(payload);
      } catch (err) {
        logger?.error?.({ err, type }, "Hook execution failed");
      }
    }
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

  async function addVip(guildId, userId, payload = {}) {
    state.vips[guildId] = state.vips[guildId] || {};
    const now = Date.now();

    const tierId = payload.tierId;
    const days = typeof payload.days === "number" ? payload.days : null;
    const expiresAt = typeof payload.expiresAt === "number"
      ? payload.expiresAt
      : (days ? now + (days * 24 * 60 * 60 * 1000) : null);

    const source = payload.source || "manual";
    const addedBy = payload.addedBy || null;

    state.vips[guildId][userId] = { userId, guildId, tierId, expiresAt, addedAt: now, addedBy };
    await store.save(state);
    const entry = state.vips[guildId][userId];

    // Hooks: onAdd
    await runHooks("onAdd", { guildId, userId, entry, tierId, source });

    return entry;
  }

  // ... (Manter funções de Dama/Settings que você já tinha)

  async function getVipData(guildId, userId) {
    const entry = state.vips?.[guildId]?.[userId] || null;
    if (!entry) return null;
    const settings = state.settings?.[guildId]?.[userId] || {};
    return {
      ...entry,
      ...settings,
      tierId: entry.tierId || null,
      expiresAt: typeof entry.expiresAt === "number" ? entry.expiresAt : null,
      vipsDados: Array.isArray(settings.vipsDados) ? settings.vipsDados : [],
    };
  }

  function listSettingsUserIds(guildId) {
    return Object.keys(state.settings?.[guildId] || {});
  }

  async function resetAll({ guildId } = {}) {
    if (guildId) {
      if (state.vips?.[guildId]) delete state.vips[guildId];
      if (state.settings?.[guildId]) delete state.settings[guildId];
      if (state.guilds?.[guildId]) delete state.guilds[guildId];
    } else {
      state = { vips: {}, settings: {}, guilds: {} };
    }
    await store.save(state);
    return { ok: true };
  }

  return { 
    init, getMemberTier, addVip, addHook,
    getVip: (gid, uid) => state.vips?.[gid]?.[uid],
    getVipData,
    listSettingsUserIds,
    resetAll,
    listVipIds: (gid) => Object.keys(state.vips?.[gid] || {}),
    getTierConfig: (gid, tierId) => configManager.getTierConfig(gid, tierId),
    removeVip: async (gid, uid) => { 
      const removed = state.vips?.[gid]?.[uid];
      delete state.vips?.[gid]?.[uid]; 
      await store.save(state); 
      if (removed) await runHooks("onRemove", { guildId: gid, userId: uid, entry: removed });
      return { removed: !!removed, vip: removed };
    },
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
