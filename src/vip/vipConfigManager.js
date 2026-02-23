const { createDataStore } = require("../store/dataStore");

// Armazena configurações de tiers VIP por guilda
// Estrutura: { guildId: { tierId: { name: "Gold", roleId: "123", limits: { familyMembers: 5, damas: 1 } } } }
const vipConfigStore = createDataStore("vipConfig.json");

function createVipConfigManager() {
  async function getGuildTiers(guildId) {
    if (!guildId) return {};
    const data = await vipConfigStore.load();
    return data[guildId] || {};
  }

  async function setGuildTier(guildId, tierId, tierData) {
    if (!guildId || !tierId) return;
    await vipConfigStore.update(guildId, (current) => {
      const tiers = current || {};
      tiers[tierId] = { ...(tiers[tierId] || {}), ...tierData };
      return tiers;
    });
  }
  
  async function removeGuildTier(guildId, tierId) {
      if (!guildId || !tierId) return;
      await vipConfigStore.update(guildId, (current) => {
          const tiers = current || {};
          delete tiers[tierId];
          return tiers;
      });
  }

  async function getMemberTier(member) {
    if (!member) return null;
    const tiers = await getGuildTiers(member.guild.id);
    
    // Procura o tier mais alto que o membro possui (baseado na ordem ou prioridade se implementada)
    // Por enquanto, retorna o primeiro encontrado ou o que tiver maiores limites
    // Vamos priorizar limites maiores
    
    let bestTier = null;
    let maxFamily = -1;

    for (const [id, tier] of Object.entries(tiers)) {
        if (member.roles.cache.has(tier.roleId)) {
            const limit = tier.limits?.familyMembers || 0;
            if (limit > maxFamily) {
                maxFamily = limit;
                bestTier = { id, ...tier };
            }
        }
    }
    
    return bestTier;
  }

  return { getGuildTiers, setGuildTier, removeGuildTier, getMemberTier };
}

module.exports = { createVipConfigManager };
