const { createDataStore } = require("../store/dataStore");

function createTagRoleService({ logger } = {}) {
  const store = createDataStore("tagRole.json");

  async function loadState() {
    const state = await store.load();
    return state && typeof state === "object" ? state : {};
  }

  async function saveState(state) {
    await store.save(state || {});
  }

  function ensureGuild(state, guildId) {
    state.guilds = state.guilds || {};
    state.guilds[guildId] = state.guilds[guildId] || {};
    const g = state.guilds[guildId];

    if (typeof g.enabled !== "boolean") g.enabled = false;
    if (!Array.isArray(g.tags)) g.tags = [];
    if (typeof g.intervalHours !== "number" || !Number.isFinite(g.intervalHours) || g.intervalHours <= 0) {
      g.intervalHours = 6;
    }
    if (typeof g.removeMissing !== "boolean") g.removeMissing = true;
    if (typeof g.includeUsername !== "boolean") g.includeUsername = true;
    if (typeof g.includeGlobalName !== "boolean") g.includeGlobalName = true;
    if (typeof g.includeDisplayName !== "boolean") g.includeDisplayName = true;

    g.roleId = g.roleId || null;
    return g;
  }

  async function getConfig(guildId) {
    const state = await loadState();
    return ensureGuild(state, guildId);
  }

  async function updateConfig(guildId, patch) {
    const state = await loadState();
    const g = ensureGuild(state, guildId);

    const next = { ...g, ...(patch || {}) };

    if (Array.isArray(next.tags)) {
      next.tags = next.tags
        .map((t) => String(t || "").trim())
        .filter(Boolean)
        .slice(0, 25);
    }

    if (typeof next.intervalHours === "string") next.intervalHours = Number(next.intervalHours);
    if (!Number.isFinite(next.intervalHours) || next.intervalHours <= 0) next.intervalHours = g.intervalHours;

    if (typeof next.roleId !== "string" || !next.roleId) next.roleId = null;

    state.guilds[guildId] = next;
    await saveState(state);

    logger?.info?.({ guildId, patch }, "TagRole config updated");
    return next;
  }

  return {
    getConfig,
    updateConfig,
  };
}

module.exports = { createTagRoleService };
