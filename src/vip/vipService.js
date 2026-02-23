function createVipService({ store, logger }) {
  let state = { vips: {}, settings: {}, guilds: {} };

  async function init() {
    state = await store.load();
    if (!state.settings || typeof state.settings !== "object") state.settings = {};
    if (!state.guilds || typeof state.guilds !== "object") state.guilds = {};
    logger?.info?.({ count: Object.keys(state.vips).length }, "VIP carregado");
  }

  function normalizeUserId(userId) {
    if (typeof userId !== "string") return null;
    const v = userId.trim();
    return v ? v : null;
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
    
    if (!roleId) return false;
    if (!member?.roles?.cache) return false;
    return member.roles.cache.has(roleId);
  }

  function isVip({ userId, member } = {}) {
    const id = normalizeUserId(userId) || normalizeUserId(member?.user?.id);
    if (!id) return false;
    if (isVipByRole(member)) return true;
    return Boolean(state.vips[id]);
  }

  async function addVip(userId, { days, tierId } = {}) {
    const id = normalizeUserId(userId);
    if (!id) throw new Error("userId inválido");
    
    const now = Date.now();
    const existing = state.vips[id];
    
    // Se já existe e tem expiração, soma os dias
    let expiresAt = null;
    if (days && days > 0) {
        const baseTime = (existing && existing.expiresAt && existing.expiresAt > now) ? existing.expiresAt : now;
        expiresAt = baseTime + (days * 24 * 60 * 60 * 1000);
    }

    const vip = { 
        userId: id, 
        addedAt: existing ? existing.addedAt : now,
        expiresAt: expiresAt || (existing ? existing.expiresAt : null),
        tierId: tierId || (existing ? existing.tierId : null) // Salva o Tier ID no usuário
    };
    
    state.vips[id] = vip;
    await store.save(state);
    return { created: !existing, vip };
  }

  async function removeVip(userId) {
    const id = normalizeUserId(userId);
    if (!id) throw new Error("userId inválido");
    const existing = state.vips[id];
    if (!existing) return { removed: false };

    delete state.vips[id];
    await store.save(state);
    return { removed: true, vip: existing };
  }

  function listVipIds() {
    return Object.keys(state.vips);
  }

  function getVip(userId) {
    const id = normalizeUserId(userId);
    if (!id) return null;
    return state.vips[id] || null;
  }

  function getSettings(userId) {
    const id = normalizeUserId(userId);
    if (!id) return null;
    return state.settings[id] || null;
  }

  async function setSettings(userId, patch) {
    const id = normalizeUserId(userId);
    if (!id) throw new Error("userId inválido");
    if (!patch || typeof patch !== "object") throw new Error("patch inválido");

    const existing = state.settings[id] || {};
    state.settings[id] = { ...existing, ...patch, userId: id };
    await store.save(state);
    return state.settings[id];
  }

  return { init, isVip, addVip, removeVip, listVipIds, getVip, getSettings, setSettings, getGuildConfig, setGuildConfig };
}

module.exports = { createVipService };
