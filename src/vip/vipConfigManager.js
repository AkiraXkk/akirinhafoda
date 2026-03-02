const { createDataStore } = require("../store/dataStore");

const vipConfigStore = createDataStore("vipConfig.json");

function createVipConfigManager() {
  async function getGuildTiers(guildId) {
    if (!guildId) return {};
    const data = await vipConfigStore.load();
    return data[guildId] || {};
  }

  async function getTierConfig(guildId, tierId) {
    if (!guildId || !tierId) return null;
    const tiers = await getGuildTiers(guildId);
    const raw = tiers[tierId];
    if (!raw) return null;
    const limits = raw.limits || {};
    const benefits = raw.benefits && typeof raw.benefits === "object" ? raw.benefits : {};
    const economy = benefits.economy && typeof benefits.economy === "object" ? benefits.economy : {};
    const social = benefits.social && typeof benefits.social === "object" ? benefits.social : {};
    const tech = benefits.tech && typeof benefits.tech === "object" ? benefits.tech : {};

    const precoShop = Number.isFinite(raw.preco_shop) ? raw.preco_shop : (Number.isFinite(economy.preco_shop) ? economy.preco_shop : 0);
    const bonusInicial = Number.isFinite(raw.bonus_inicial) ? raw.bonus_inicial : (Number.isFinite(economy.bonus_inicial) ? economy.bonus_inicial : 0);
    const dailyExtra = Number.isFinite(raw.valor_daily_extra)
      ? raw.valor_daily_extra
      : (Number.isFinite(economy.valor_daily_extra) ? economy.valor_daily_extra : 0);

    const limiteFamilia = Number.isFinite(raw.limite_familia)
      ? raw.limite_familia
      : (Number.isFinite(social.limite_familia) ? social.limite_familia : (raw.maxFamilyMembers ?? limits.familyMembers ?? 0));

    const limiteDamas = Number.isFinite(raw.limite_damas)
      ? raw.limite_damas
      : (Number.isFinite(social.limite_damas) ? social.limite_damas : (raw.maxDamas ?? limits.damas ?? 1));

    const podePresentear = typeof raw.pode_presentear === "boolean"
      ? raw.pode_presentear
      : (typeof social.pode_presentear === "boolean" ? social.pode_presentear : false);

    const ignorarSlowmode = typeof raw.ignorar_slowmode === "boolean"
      ? raw.ignorar_slowmode
      : (typeof tech.ignorar_slowmode === "boolean" ? tech.ignorar_slowmode : false);

    const criarCallVip = typeof raw.criar_call_vip === "boolean"
      ? raw.criar_call_vip
      : (typeof tech.criar_call_vip === "boolean" ? tech.criar_call_vip : false);

    const corExclusiva = typeof raw.cor_exclusiva === "string"
      ? raw.cor_exclusiva
      : (typeof tech.cor_exclusiva === "string" ? tech.cor_exclusiva : null);

    return {
      id: tierId,
      name: raw.name ?? "VIP",
      // legacy "price" kept for compatibility; prefer preco_shop for ranking/shop
      price: raw.price ?? 0,
      roleId: raw.roleId ?? null,
      days: raw.days ?? 0,
      maxDamas: raw.maxDamas ?? limits.damas ?? 1,
      canFamily: raw.canFamily ?? limits.allowFamily ?? false,
      hasSecondRole: raw.hasSecondRole ?? false,
      maxSecondRoleMembers: raw.maxSecondRoleMembers ?? limits.secondRoleMembers ?? 0,
      maxFamilyMembers: raw.maxFamilyMembers ?? limits.familyMembers ?? 0,

      // New attribute-based benefits
      valor_daily_extra: dailyExtra,
      preco_shop: precoShop,
      bonus_inicial: bonusInicial,
      limite_familia: limiteFamilia,
      limite_damas: limiteDamas,
      pode_presentear: podePresentear,
      ignorar_slowmode: ignorarSlowmode,
      criar_call_vip: criarCallVip,
      cor_exclusiva: corExclusiva,
    };
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
    if (!member?.guild?.id) return null;
    const tiers = await getGuildTiers(member.guild.id);
    let melhor = null;
    let maiorPreco = -1;

    for (const [id, tier] of Object.entries(tiers)) {
      if (member.roles.cache.has(tier.roleId)) {
        const preco = tier.price ?? 0;
        if (preco > maiorPreco) {
          maiorPreco = preco;
          melhor = await getTierConfig(member.guild.id, id);
        }
      }
    }
    return melhor;
  }

  return { getGuildTiers, getTierConfig, setGuildTier, removeGuildTier, getMemberTier };
}

module.exports = { createVipConfigManager };
