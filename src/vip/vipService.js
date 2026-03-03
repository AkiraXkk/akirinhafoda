function createVipService({ store, logger, configManager }) {
  let state = { vips: {}, settings: {}, guilds: {} };

  async function init() {
    state = await store.load();
    if (!state || typeof state !== "object") state = { vips: {}, settings: {}, guilds: {} };
    if (!state.vips || typeof state.vips !== "object") state.vips = {};
    if (!state.settings || typeof state.settings !== "object") state.settings = {};
    if (!state.guilds || typeof state.guilds !== "object") state.guilds = {};

    const looksLikeOldVipMap = Object.values(state.vips).some(
      (v) => v && typeof v === "object" && typeof v.userId === "string"
    );
    if (looksLikeOldVipMap) {
      state.vips = { __legacy__: state.vips };
    }
    const looksLikeOldSettingsMap = Object.values(state.settings).some(
      (v) => v && typeof v === "object" && typeof v.userId === "string"
    );
    if (looksLikeOldSettingsMap) {
      state.settings = { __legacy__: state.settings };
    }

    const vipCount = Object.values(state.vips)
      .filter((x) => x && typeof x === "object")
      .reduce((acc, guildMap) => acc + Object.keys(guildMap).length, 0);
    logger?.info?.({ count: vipCount }, "VIP carregado");
  }

  function normalizeUserId(userId) {
    if (typeof userId !== "string") return null;
    const v = String(userId).trim();
    return v || null;
  }

  function getGuildConfig(guildId) {
    if (!guildId) return null;
    return state.guilds[guildId] || null;
  }

  async function setGuildConfig(guildId, patch) {
    if (!guildId) throw new Error("guildId inválido");
    const existing = state.guilds[guildId] || {};
    state.guilds[guildId] = { ...existing, ...patch };
    await store.save(state);
    return state.guilds[guildId];
  }

  function isVipByRole(member) {
    if (!member?.guild?.id) return false;
    const config = getGuildConfig(member.guild.id);
    const roleId = config?.vipRoleId;
    if (!roleId || !member?.roles?.cache) return false;
    return member.roles.cache.has(roleId);
  }

  function isVip({ guildId, userId, member } = {}) {
    const gid = guildId || member?.guild?.id;
    const id = normalizeUserId(userId) || normalizeUserId(member?.user?.id);
    if (!gid || !id) return false;
    if (member && isVipByRole(member)) return true;
    return Boolean(state.vips?.[gid]?.[id]);
  }

  async function addVip(guildId, userId, { days, tierId } = {}) {
    const gid = String(guildId || "").trim();
    const id = normalizeUserId(userId);
    if (!gid) throw new Error("guildId inválido");
    if (!id) throw new Error("userId inválido");

    const now = Date.now();
    if (!state.vips[gid] || typeof state.vips[gid] !== "object") state.vips[gid] = {};
    const existing = state.vips[gid][id];
    let expiresAt = null;
    if (days && days > 0) {
      const base = existing?.expiresAt > now ? existing.expiresAt : now;
      expiresAt = base + days * 24 * 60 * 60 * 1000;
    }

    state.vips[gid][id] = {
      userId: id,
      guildId: gid,
      addedAt: existing?.addedAt ?? now,
      expiresAt: expiresAt || existing?.expiresAt || null,
      tierId: tierId ?? existing?.tierId ?? null,
    };
    await store.save(state);
    return { created: !existing, vip: state.vips[gid][id] };
  }

  async function removeVip(guildId, userId) {
    const gid = String(guildId || "").trim();
    const id = normalizeUserId(userId);
    if (!gid) throw new Error("guildId inválido");
    if (!id) throw new Error("userId inválido");
    const existing = state.vips?.[gid]?.[id];
    if (!existing) return { removed: false };
    delete state.vips[gid][id];
    await store.save(state);
    return { removed: true, vip: existing };
  }

  function listVipIds(guildId) {
    const gid = String(guildId || "").trim();
    if (!gid) return [];
    return Object.keys(state.vips?.[gid] || {});
  }

  function getVip(guildId, userId) {
    const gid = String(guildId || "").trim();
    const id = normalizeUserId(userId);
    if (!gid || !id) return null;
    return state.vips?.[gid]?.[id] || null;
  }

  async function getFullVipReport(guildId) {
    const gid = String(guildId || "").trim();
    const tiers = await configManager?.getGuildTiers?.(gid) || state.guilds[gid]?.vips?.tiers || {};
    const vipsInGuild = state.vips[gid] || {};
    const activeVips = Object.values(vipsInGuild).filter(v => {
      if (!v.expiresAt) return true;
      return v.expiresAt > Date.now();
    });
    return { tiers, activeVips };
  }

  function getSettings(guildId, userId) {
    const gid = String(guildId || "").trim();
    const id = normalizeUserId(userId);
    if (!gid || !id) return null;
    return state.settings?.[gid]?.[id] || null;
  }

  async function setSettings(guildId, userId, patch) {
    const gid = String(guildId || "").trim();
    const id = normalizeUserId(userId);
    if (!gid) throw new Error("guildId inválido");
    if (!id) throw new Error("userId inválido");
    if (!patch || typeof patch !== "object") throw new Error("patch inválido");
    if (!state.settings[gid] || typeof state.settings[gid] !== "object") state.settings[gid] = {};
    const existing = state.settings[gid][id] || {};
    state.settings[gid][id] = { ...existing, ...patch, userId: id, guildId: gid };
    await store.save(state);
    return state.settings[gid][id];
  }

  function getDamasCount(guildId, userId) {
    const gid = String(guildId || "").trim();
    const id = normalizeUserId(userId);
    if (!id) return 0;
    const damas = state.settings?.[gid]?.[id]?.damas;
    return Array.isArray(damas) ? damas.length : 0;
  }

  function getDamas(guildId, userId) {
    const gid = String(guildId || "").trim();
    const id = normalizeUserId(userId);
    if (!id) return [];
    const damas = state.settings?.[gid]?.[id]?.damas;
    return Array.isArray(damas) ? [...damas] : [];
  }

  async function addDama(guildId, donoId, damaId) {
    const gid = String(guildId || "").trim();
    const id = normalizeUserId(donoId);
    if (!gid) throw new Error("guildId inválido");
    if (!id || !damaId) throw new Error("donoId e damaId obrigatórios");
    if (!state.settings[gid] || typeof state.settings[gid] !== "object") state.settings[gid] = {};
    const settings = state.settings[gid][id] || {};
    const lista = Array.isArray(settings.damas) ? settings.damas : [];
    if (lista.includes(damaId)) return;
    state.settings[gid][id] = { ...settings, userId: id, guildId: gid, damas: [...lista, damaId] };
    await store.save(state);
  }

  async function removeDama(guildId, donoId, damaId) {
    const gid = String(guildId || "").trim();
    const id = normalizeUserId(donoId);
    if (!gid) throw new Error("guildId inválido");
    if (!id) throw new Error("donoId inválido");
    if (!state.settings[gid] || typeof state.settings[gid] !== "object") state.settings[gid] = {};
    const settings = state.settings[gid][id] || {};
    let lista = Array.isArray(settings.damas) ? settings.damas : [];
    if (damaId) lista = lista.filter((x) => x !== damaId);
    else lista = [];
    state.settings[gid][id] = { ...settings, userId: id, guildId: gid, damas: lista };
    await store.save(state);
  }

  async function getUserTierConfig({ guildId, userId, member } = {}) {
    const gid = guildId || member?.guild?.id;
    const id = normalizeUserId(userId) || normalizeUserId(member?.user?.id);
    if (!gid || !id) return null;
    const vipEntry = getVip(gid, id);
    if (vipEntry?.tierId) {
      const tier = await getTierConfig(gid, vipEntry.tierId);
      if (tier) return tier;
    }
    if (member && configManager?.getMemberTier) {
      return configManager.getMemberTier(member);
    }
    return null;
  }

  async function getTierConfig(guildId, tierId) {
    if (!configManager) return null;
    return configManager.getTierConfig(guildId, tierId);
  }

  async function updateTier(guildId, tierId, config) {
    if (!configManager) throw new Error("configManager não injetado");
    await configManager.setGuildTier(guildId, tierId, config);
  }

  async function resetGuildConfig(guildId) {
    if (!guildId) throw new Error("guildId inválido");
    state.guilds[guildId] = {};
    await store.save(state);
    return state.guilds[guildId];
  }

  async function resetAll() {
    state = { vips: {}, settings: {}, guilds: {} };
    await store.save(state);
    return true;
  }

  function listSettingsUserIds(guildId) {
    const gid = String(guildId || "").trim();
    if (!gid) return [];
    return Object.keys(state.settings?.[gid] || {});
  }

  return {
    init,
    isVip,
    addVip,
    removeVip,
    listVipIds,
    getVip,
    getFullVipReport,
    getSettings,
    setSettings,
    getGuildConfig,
    setGuildConfig,
    getDamasCount,
    getDamas,
    addDama,
    removeDama,
    getUserTierConfig,
    getTierConfig,
    updateTier,
    resetGuildConfig,
    resetAll,
    listSettingsUserIds,
  };
}

module.exports = { createVipService };
