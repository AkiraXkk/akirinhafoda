const { createDataStore } = require("../store/dataStore");

const vipConfigStore = createDataStore("vipConfig.json");

function createVipConfigManager({ logger } = {}) {
  async function getGuildTiers(guildId) {
    if (!guildId) return {};
    const data = await vipConfigStore.load();
    return data[guildId] || {};
  }

  async function setGuildTier(guildId, tierId, tierData) {
    if (!guildId || !tierId) throw new Error("guildId e tierId são obrigatórios");
    await vipConfigStore.update(guildId, (current) => {
      const tiers = current || {};
      tiers[tierId] = {
        ...(tiers[tierId] || {}),
        id: tierId,
        name: tierData.name,
        roleId: tierData.roleId,
        price: Number(tierData.price || 0),
        multiplicadorXp: Number(tierData.multiplicadorXp || 1),
        bonusDaily: Number(tierData.bonusDaily || 0),
        voiceChannelId: tierData.voiceChannelId || null,
        limits: {
          familyMembers: Number(tierData.limits?.familyMembers || 0),
          damas: Number(tierData.limits?.damas || 0),
          allowFamily: Boolean(tierData.limits?.allowFamily),
        },
      };
      return tiers;
    });
    logger?.info?.({ guildId, tierId }, "Tier VIP salvo");
  }

  async function removeGuildTier(guildId, tierId) {
    if (!guildId || !tierId) throw new Error("guildId e tierId são obrigatórios");
    await vipConfigStore.update(guildId, (current) => {
      const tiers = current || {};
      delete tiers[tierId];
      return tiers;
    });
    logger?.info?.({ guildId, tierId }, "Tier VIP removido");
  }

  async function getMemberTier(member) {
    if (!member?.guild?.id) return null;
    const tiers = await getGuildTiers(member.guild.id);
    const entries = Object.entries(tiers);
    let bestTier = null;

    for (const [id, tier] of entries) {
      if (!member.roles.cache.has(tier.roleId)) continue;
      if (!bestTier) {
        bestTier = { id, ...tier };
        continue;
      }
      const currentMultiplier = Number(bestTier.multiplicadorXp || 1);
      const nextMultiplier = Number(tier.multiplicadorXp || 1);
      if (nextMultiplier >= currentMultiplier) {
        bestTier = { id, ...tier };
      }
    }

    return bestTier;
  }

  return { getGuildTiers, setGuildTier, removeGuildTier, getMemberTier };
}

module.exports = { createVipConfigManager };
