const { createDataStore } = require("../store/dataStore");

function createLevelsService({ logger } = {}) {
  const store = createDataStore("levels.json");

  function getXpMultiplier(vipTier) {
    const raw = Number(vipTier?.multiplicadorXp ?? vipTier?.xpMultiplier ?? 1);
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    return raw;
  }

  async function getProfile(userId) {
    const current = await store.get(userId);
    return current || { xp: 0, level: 1 };
  }

  async function getLeaderboard(limit = 10) {
    const all = await store.load();
    return Object.entries(all)
      .map(([id, data]) => ({ id, ...(data || { xp: 0, level: 1 }) }))
      .sort((a, b) => (b.level * 1000 + b.xp) - (a.level * 1000 + a.xp))
      .slice(0, limit);
  }

  async function addXp(userId, baseXp, { vipTier } = {}) {
    const multiplier = getXpMultiplier(vipTier);
    const gainedXp = Math.max(1, Math.floor(baseXp * multiplier));
    let leveledUp = false;
    let newLevel = 1;

    await store.update(userId, (current) => {
      const data = current || { xp: 0, level: 1 };
      data.xp = (data.xp || 0) + gainedXp;

      let xpNeeded = data.level * 100;
      while (data.xp >= xpNeeded) {
        data.xp -= xpNeeded;
        data.level += 1;
        xpNeeded = data.level * 100;
        leveledUp = true;
        newLevel = data.level;
      }
      return data;
    });

    logger?.debug?.({ userId, baseXp, gainedXp, multiplier, leveledUp }, "XP adicionado");
    return { leveledUp, newLevel, gainedXp, multiplier };
  }

  return { getProfile, getLeaderboard, addXp };
}

module.exports = { createLevelsService };
