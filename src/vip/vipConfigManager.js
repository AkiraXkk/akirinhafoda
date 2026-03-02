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
      const previous = tiers[tierId] || {};
      tiers[tierId] = {
        ...previous,
        ...tierData,
        id: tierId,
        roleId: tierData.roleId || previous.roleId || null,
        name: tierData.name || previous.name || tierId,
        valor_daily_extra: Number(tierData.valor_daily_extra ?? previous.valor_daily_extra ?? 0),
        preco_shop: Number(tierData.preco_shop ?? previous.preco_shop ?? 0),
        bonus_inicial: Number(tierData.bonus_inicial ?? previous.bonus_inicial ?? 0),
        limite_familia: Number(tierData.limite_familia ?? previous.limite_familia ?? 0),
        limite_damas: Number(tierData.limite_damas ?? previous.limite_damas ?? 0),
        pode_presentear: Boolean(tierData.pode_presentear ?? previous.pode_presentear ?? false),
        ignorar_slowmode: Boolean(tierData.ignorar_slowmode ?? previous.ignorar_slowmode ?? false),
        criar_call_vip: Boolean(tierData.criar_call_vip ?? previous.criar_call_vip ?? false),
        cor_exclusiva: tierData.cor_exclusiva ?? previous.cor_exclusiva ?? null,
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
  }

  async function getMemberTier(member) {
    if (!member?.guild?.id) return null;
    const tiers = await getGuildTiers(member.guild.id);
    const entries = Object.entries(tiers);

    let selected = null;
    for (const [id, tier] of entries) {
      if (!tier.roleId) continue;
      if (!member.roles.cache.has(tier.roleId)) continue;
      if (!selected) {
        selected = { id, ...tier };
        continue;
      }
      const selectedPrice = Number(selected.preco_shop || 0);
      const candidatePrice = Number(tier.preco_shop || 0);
      if (candidatePrice >= selectedPrice) {
        selected = { id, ...tier };
      }
    }

    return selected;
  }

  return { getGuildTiers, setGuildTier, removeGuildTier, getMemberTier };
}

module.exports = { createVipConfigManager };
