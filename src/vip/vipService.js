function createVipService({ store, logger }) {
  let state = { vips: {}, settings: {}, guilds: {}, giftUsage: {} };

  async function init() {
    state = await store.load();
    if (!state || typeof state !== "object") state = {};
    if (!state.vips || typeof state.vips !== "object") state.vips = {};
    if (!state.settings || typeof state.settings !== "object") state.settings = {};
    if (!state.guilds || typeof state.guilds !== "object") state.guilds = {};
    if (!state.giftUsage || typeof state.giftUsage !== "object") state.giftUsage = {};

    logger?.info?.({ guilds: Object.keys(state.vips).length }, "VIP carregado");
  }

  function normalizeUserId(userId) {
    if (typeof userId !== "string") return null;
    const v = userId.trim();
    return v ? v : null;
  }

  function normalizeGuildId(guildId) {
    if (typeof guildId !== "string") return null;
    const v = guildId.trim();
    return v ? v : null;
  }

  function ensureGuildBucket(guildId) {
    const gid = normalizeGuildId(guildId);
    if (!gid) throw new Error("guildId inválido");
    if (!state.vips[gid] || typeof state.vips[gid] !== "object") {
      state.vips[gid] = {};
    }
    return state.vips[gid];
  }

  function getGuildConfig(guildId) {
    const gid = normalizeGuildId(guildId);
    if (!gid) return null;
    return state.guilds[gid] || null;
  }

  async function setGuildConfig(guildId, patch) {
    const gid = normalizeGuildId(guildId);
    if (!gid) throw new Error("guildId inválido");
    const existing = state.guilds[gid] || {};
    state.guilds[gid] = { ...existing, ...patch, guildId: gid };
    await store.save(state);
    return state.guilds[gid];
  }

  function isVipByRole(member) {
    if (!member?.guild?.id) return false;
    const config = getGuildConfig(member.guild.id);
    const roleId = config?.vipRoleId;
    if (!roleId || !member?.roles?.cache) return false;
    return member.roles.cache.has(roleId);
  }

  function getVip(userId, { guildId } = {}) {
    const id = normalizeUserId(userId);
    if (!id) return null;

    const gid = normalizeGuildId(guildId);
    if (gid) {
      return state.vips[gid]?.[id] || null;
    }

    for (const guildEntries of Object.values(state.vips)) {
      if (guildEntries && guildEntries[id]) return guildEntries[id];
    }
    return null;
  }

  function isVip({ userId, member, guildId } = {}) {
    const id = normalizeUserId(userId) || normalizeUserId(member?.user?.id);
    if (!id) return false;
    if (member && isVipByRole(member)) return true;

    const resolvedGuildId = normalizeGuildId(guildId) || normalizeGuildId(member?.guild?.id);
    if (resolvedGuildId) {
      return Boolean(state.vips[resolvedGuildId]?.[id]);
    }
    return Boolean(getVip(id));
  }

  async function addVip(userId, { guildId, days, tierId, tierData, source = "manual", grantedBy } = {}) {
    const id = normalizeUserId(userId);
    const gid = normalizeGuildId(guildId);
    if (!id) throw new Error("userId inválido");
    if (!gid) throw new Error("guildId inválido");

    const guildBucket = ensureGuildBucket(gid);
    const now = Date.now();
    const existing = guildBucket[id];

    let expiresAt = existing?.expiresAt || null;
    if (days && days > 0) {
      const baseTime = existing?.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;
      expiresAt = baseTime + days * 24 * 60 * 60 * 1000;
    }

    const vip = {
      userId: id,
      guildId: gid,
      addedAt: existing?.addedAt || now,
      updatedAt: now,
      expiresAt,
      tierId: tierId || existing?.tierId || null,
      source,
      grantedBy: grantedBy || null,
      benefits: {
        valor_daily_extra: Number(tierData?.valor_daily_extra || existing?.benefits?.valor_daily_extra || 0),
        preco_shop: Number(tierData?.preco_shop || existing?.benefits?.preco_shop || 0),
        bonus_inicial: Number(tierData?.bonus_inicial || existing?.benefits?.bonus_inicial || 0),
        limite_familia: Number(tierData?.limite_familia || existing?.benefits?.limite_familia || 0),
        limite_damas: Number(tierData?.limite_damas || existing?.benefits?.limite_damas || 0),
        pode_presentear: Boolean(tierData?.pode_presentear ?? existing?.benefits?.pode_presentear ?? false),
        ignorar_slowmode: Boolean(tierData?.ignorar_slowmode ?? existing?.benefits?.ignorar_slowmode ?? false),
        criar_call_vip: Boolean(tierData?.criar_call_vip ?? existing?.benefits?.criar_call_vip ?? false),
        cor_exclusiva: tierData?.cor_exclusiva || existing?.benefits?.cor_exclusiva || null,
      },
    };

    guildBucket[id] = vip;
    await store.save(state);
    return { created: !existing, vip };
  }

  async function removeVip(userId, { guildId } = {}) {
    const id = normalizeUserId(userId);
    if (!id) throw new Error("userId inválido");

    const gid = normalizeGuildId(guildId);
    if (gid) {
      const existing = state.vips[gid]?.[id];
      if (!existing) return { removed: false };
      delete state.vips[gid][id];
      await store.save(state);
      return { removed: true, vip: existing };
    }

    for (const [g, entries] of Object.entries(state.vips)) {
      if (entries[id]) {
        const existing = entries[id];
        delete entries[id];
        await store.save(state);
        return { removed: true, vip: existing, guildId: g };
      }
    }

    return { removed: false };
  }

  function listVipIds(guildId) {
    const gid = normalizeGuildId(guildId);
    if (gid) return Object.keys(state.vips[gid] || {});

    const ids = new Set();
    for (const entries of Object.values(state.vips)) {
      for (const id of Object.keys(entries || {})) ids.add(id);
    }
    return Array.from(ids);
  }

  function listVipEntries(guildId) {
    const gid = normalizeGuildId(guildId);
    if (gid) {
      return Object.values(state.vips[gid] || {});
    }
    const out = [];
    for (const entries of Object.values(state.vips)) {
      out.push(...Object.values(entries || {}));
    }
    return out;
  }

  function getMemberBenefits({ guildId, userId, member } = {}) {
    const gid = normalizeGuildId(guildId) || normalizeGuildId(member?.guild?.id);
    const uid = normalizeUserId(userId) || normalizeUserId(member?.user?.id);
    if (!gid || !uid) return null;
    return state.vips[gid]?.[uid]?.benefits || null;
  }

  function getLimit(limitKey, { guildId, userId, member, fallback = 0 } = {}) {
    const benefits = getMemberBenefits({ guildId, userId, member });
    const value = Number(benefits?.[limitKey]);
    return Number.isFinite(value) ? value : fallback;
  }

  function hasBenefit(flagKey, { guildId, userId, member } = {}) {
    const benefits = getMemberBenefits({ guildId, userId, member });
    return Boolean(benefits?.[flagKey]);
  }

  function getGiftUsage(userId, guildId) {
    const uid = normalizeUserId(userId);
    const gid = normalizeGuildId(guildId);
    if (!uid || !gid) return 0;
    return Number(state.giftUsage?.[gid]?.[uid] || 0);
  }

  async function incrementGiftUsage(userId, guildId) {
    const uid = normalizeUserId(userId);
    const gid = normalizeGuildId(guildId);
    if (!uid || !gid) throw new Error("userId/guildId inválido");

    if (!state.giftUsage[gid]) state.giftUsage[gid] = {};
    state.giftUsage[gid][uid] = Number(state.giftUsage[gid][uid] || 0) + 1;
    await store.save(state);
    return state.giftUsage[gid][uid];
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

  return {
    init,
    isVip,
    addVip,
    removeVip,
    listVipIds,
    listVipEntries,
    getVip,
    getMemberBenefits,
    hasBenefit,
    getLimit,
    getGiftUsage,
    incrementGiftUsage,
    getSettings,
    setSettings,
    getGuildConfig,
    setGuildConfig,
  };
}

module.exports = { createVipService };
