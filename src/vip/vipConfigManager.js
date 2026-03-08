const fs = require('fs');
const path = require('path');

function createVipConfigManager() {
  const configPath = path.join(__dirname, '../../data/vipConfigs.json');

  // Garante que o arquivo de config existe
  if (!fs.existsSync(path.dirname(configPath))) fs.mkdirSync(path.dirname(configPath), { recursive: true });
  if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, JSON.stringify({}));

  function getConfigs() {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      return {};
    }
  }

  function saveConfigs(data) {
    try {
      fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error("Erro ao salvar vipConfigs:", err);
    }
  }

  return {
    // ESSA ERA A FUNÇÃO FALTANTE:
    async setBase(guildId, tierId, roleId, roleName) {
      const configs = getConfigs();
      if (!configs[guildId]) configs[guildId] = {};
      
      // Cria o esqueleto do Tier se não existir
      configs[guildId][tierId] = {
        ...(configs[guildId][tierId] || {}),
        id: tierId,
        roleId,
        name: roleName,
        daily_bonus: 0,
        midas: false,
        vagas_familia: 0,
        primeiras_damas: 0,
        cotaRoleId: null,
        canCall: false,
        chat_privado: false,
        hasCustomRole: false,
        high_quality_voice: false,
        shop_enabled: (configs[guildId][tierId]?.shop_enabled ?? null),
        shop_price_per_day: (configs[guildId][tierId]?.shop_price_per_day ?? null),
        shop_fixed_price: (configs[guildId][tierId]?.shop_fixed_price ?? null),
        shop_default_days: (configs[guildId][tierId]?.shop_default_days ?? null)
      };

      saveConfigs(configs);
    },

    async updateTier(guildId, tierId, type, data) {
      const configs = getConfigs();
      if (!configs[guildId]?.[tierId]) return;

      // Mescla os dados dependendo da categoria (eco, soc, tec)
      configs[guildId][tierId] = { ...configs[guildId][tierId], ...data };
      saveConfigs(configs);
    },

    async getTierConfig(guildId, tierId) {
      const configs = getConfigs();
      const tier = configs[guildId]?.[tierId] || null;
      if (!tier) return null;
      if (!tier.id) return { ...tier, id: tierId };
      return tier;
    },

    async getGuildTiers(guildId) {
      const configs = getConfigs();
      return configs[guildId] || {};
    },

    async removeGuildTier(guildId, tierId) {
      const configs = getConfigs();
      if (!configs[guildId]) return { ok: false, existed: false };
      const existed = !!configs[guildId][tierId];
      delete configs[guildId][tierId];
      saveConfigs(configs);
      return { ok: true, existed };
    }
  };
}

module.exports = { createVipConfigManager };

