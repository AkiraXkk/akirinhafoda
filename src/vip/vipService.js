// ============================================================
//  vipService.js  —  Refatorado
//  Novidades:
//   • Cargo Base VIP global (vipBaseRoleId) entregue/removido
//     na camada de serviço via hooks internos
//   • Cotas Avançadas: Modo A (Hierárquico) e Modo B (Específico)
//   • guildConfig estendido: vipBaseRoleId, vipRoleSeparatorId,
//     familyRoleSeparatorId, cargoFantasmaId
// ============================================================

function createVipService({ store, logger, configManager, client }) {
  let state = { vips: {}, settings: {}, guilds: {} };
  let hooks = { onAdd: [], onRemove: [], onExpire: [] };

  // ----------------------------------------------------------
  //  INIT
  // ----------------------------------------------------------
  async function init() {
    state = (await store.load()) || { vips: {}, settings: {}, guilds: {} };
    // garante sub-objetos para evitar falhas de acesso
    state.vips     = state.vips     || {};
    state.settings = state.settings || {};
    state.guilds   = state.guilds   || {};
  }

  // ----------------------------------------------------------
  //  HOOKS
  // ----------------------------------------------------------
  function addHook(type, fn) {
    if (!hooks[type]) hooks[type] = [];
    hooks[type].push(fn);
  }

  async function runHooks(type, payload) {
    for (const fn of (hooks[type] || [])) {
      try { await fn(payload); }
      catch (err) { logger?.error?.({ err, type }, "Hook execution failed"); }
    }
  }

  // ----------------------------------------------------------
  //  TIER HELPERS
  // ----------------------------------------------------------
  async function getMemberTier(member) {
    if (!member) return null;
    const tiers = await configManager.getGuildTiers(member.guild.id);
    const validTiers = [];

    for (const [id, data] of Object.entries(tiers)) {
      if (member.roles.cache.has(data.roleId)) {
        const full = await configManager.getTierConfig(member.guild.id, id);
        if (full) validTiers.push(full);
      }
    }
    // Ordena pelo preço mais alto — hierarquia de tier
    return validTiers.sort((a, b) => (b.preco_shop ?? 0) - (a.preco_shop ?? 0))[0] || null;
  }

  // Retorna todos os tiers do guild ordenados por hierarquia (maior preço = topo)
  async function getOrderedTiers(guildId) {
    const tiers = await configManager.getGuildTiers(guildId);
    const result = [];
    for (const [id] of Object.entries(tiers)) {
      const full = await configManager.getTierConfig(guildId, id);
      if (full) result.push(full);
    }
    return result.sort((a, b) => (b.preco_shop ?? 0) - (a.preco_shop ?? 0));
  }

  // ----------------------------------------------------------
  //  CARGO BASE VIP — helper interno
  //  Entrega/remove o cargo global, verificando se o membro
  //  ainda possui outro VIP ativo antes de remover.
  // ----------------------------------------------------------
  async function _applyBaseRole(guildId, userId) {
    if (!client) return;
    const gConf = state.guilds[guildId] || {};
    const baseRoleId = gConf.vipBaseRoleId;
    if (!baseRoleId) return;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    await member.roles.add(baseRoleId).catch((err) =>
      logger?.error?.({ err, userId, guildId, baseRoleId }, "Falha ao adicionar cargo base VIP")
    );

    // Posiciona abaixo do separador VIP, se configurado
    const sepId = gConf.vipRoleSeparatorId;
    if (sepId) {
      const sep = await guild.roles.fetch(sepId).catch(() => null);
      const baseRole = await guild.roles.fetch(baseRoleId).catch(() => null);
      if (sep && baseRole) {
        await baseRole.setPosition(sep.position - 1).catch(() => {});
      }
    }
  }

  async function _removeBaseRole(guildId, userId) {
    if (!client) return;
    // Só remove se o membro não tiver outro VIP ativo
    const activeVips = state.vips?.[guildId] || {};
    if (activeVips[userId]) return; // ainda tem VIP ativo, não remove cargo base

    const gConf = state.guilds[guildId] || {};
    const baseRoleId = gConf.vipBaseRoleId;
    if (!baseRoleId) return;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    await member.roles.remove(baseRoleId).catch((err) =>
      logger?.error?.({ err, userId, guildId, baseRoleId }, "Falha ao remover cargo base VIP")
    );
  }

  // ----------------------------------------------------------
  //  ADD VIP
  // ----------------------------------------------------------
  async function addVip(guildId, userId, payload = {}) {
    state.vips[guildId] = state.vips[guildId] || {};
    const now = Date.now();

    const tierId      = payload.tierId;
    const days        = typeof payload.days === "number" ? payload.days : null;
    const expiresAt   = typeof payload.expiresAt === "number"
      ? payload.expiresAt
      : (days ? now + days * 24 * 60 * 60 * 1000 : null);
    const addedBy     = payload.addedBy || null;
    const source      = payload.source  || "manual";

    state.vips[guildId][userId] = { userId, guildId, tierId, expiresAt, addedAt: now, addedBy };
    await store.save(state);

    const entry = state.vips[guildId][userId];

    // Aplica cargo base VIP automaticamente
    await _applyBaseRole(guildId, userId);

    await runHooks("onAdd", { guildId, userId, entry, tierId, source });
    return entry;
  }

  // ----------------------------------------------------------
  //  REMOVE VIP
  // ----------------------------------------------------------
  async function removeVip(guildId, userId) {
    const removed = state.vips?.[guildId]?.[userId];
    if (state.vips?.[guildId]) delete state.vips[guildId][userId];
    await store.save(state);

    if (removed) {
      // Remove cargo base VIP (somente se não restar outro vip ativo)
      await _removeBaseRole(guildId, userId);
      await runHooks("onRemove", { guildId, userId, entry: removed });
    }
    return { removed: !!removed, vip: removed };
  }

  // ----------------------------------------------------------
  //  VIP DATA
  // ----------------------------------------------------------
  async function getVipData(guildId, userId) {
    const entry    = state.vips?.[guildId]?.[userId] || null;
    if (!entry) return null;
    const settings = state.settings?.[guildId]?.[userId] || {};
    return {
      ...entry,
      ...settings,
      tierId:    entry.tierId    || null,
      expiresAt: typeof entry.expiresAt === "number" ? entry.expiresAt : null,
      vipsDados: Array.isArray(settings.vipsDados) ? settings.vipsDados : [],
    };
  }

  // ----------------------------------------------------------
  //  COTAS AVANÇADAS
  //  Cada tier pode ter em `cotasConfig`:
  //    { modo: "A", quantidade: N }          — Hierárquico
  //    { modo: "B", targetTierId: "x", quantidade: N } — Específico
  //    (array de regras também é aceito para múltiplas regras)
  // ----------------------------------------------------------

  /**
   * Verifica se `donorUserId` pode dar uma cota do `targetTierId` a alguém.
   * Retorna { ok: boolean, reason?: string }
   */
  async function verificarCota(guildId, donorUserId, targetTierId) {
    const donorEntry = state.vips?.[guildId]?.[donorUserId];
    if (!donorEntry) return { ok: false, reason: "Você não possui VIP ativo." };

    const donorTierFull = await configManager.getTierConfig(guildId, donorEntry.tierId);
    if (!donorTierFull) return { ok: false, reason: "Tier do doador não encontrado." };

    const cotasConfig = donorTierFull.cotasConfig;
    if (!cotasConfig) return { ok: false, reason: "Seu tier não possui cotas configuradas." };

    // Suporte a array de regras ou objeto único
    const regras = Array.isArray(cotasConfig) ? cotasConfig : [cotasConfig];

    const settings   = state.settings?.[guildId]?.[donorUserId] || {};
    const cotasUsadas = settings.cotasUsadas || {}; // { tierId: count }

    for (const regra of regras) {
      if (regra.modo === "A") {
        // Hierárquico: pode dar qualquer tier com preco_shop < donor tier
        const orderedTiers = await getOrderedTiers(guildId);
        const donorIdx     = orderedTiers.findIndex((t) => t.id === donorEntry.tierId);
        const targetIdx    = orderedTiers.findIndex((t) => t.id === targetTierId);

        if (targetIdx === -1) return { ok: false, reason: "Tier alvo não encontrado." };
        if (targetIdx <= donorIdx) return { ok: false, reason: "Você só pode dar cotas de tiers **inferiores** ao seu." };

        const usadas = cotasUsadas[targetTierId] || 0;
        if (usadas >= regra.quantidade) {
          return { ok: false, reason: `Você já usou todas as **${regra.quantidade}** cotas hierárquicas para \`${targetTierId}\`.` };
        }
        return { ok: true, regra };
      }

      if (regra.modo === "B") {
        if (regra.targetTierId !== targetTierId) continue;
        const usadas = cotasUsadas[targetTierId] || 0;
        if (usadas >= regra.quantidade) {
          return { ok: false, reason: `Você já usou todas as **${regra.quantidade}** cotas para o tier \`${targetTierId}\`.` };
        }
        return { ok: true, regra };
      }
    }

    return { ok: false, reason: `Seu tier não permite dar cotas para \`${targetTierId}\`.` };
  }

  /** Registra uso de cota após entrega bem-sucedida */
  async function registrarUso(guildId, donorUserId, targetTierId) {
    state.settings[guildId]                                = state.settings[guildId]                        || {};
    state.settings[guildId][donorUserId]                   = state.settings[guildId][donorUserId]           || {};
    state.settings[guildId][donorUserId].cotasUsadas       = state.settings[guildId][donorUserId].cotasUsadas || {};
    state.settings[guildId][donorUserId].cotasUsadas[targetTierId] =
      (state.settings[guildId][donorUserId].cotasUsadas[targetTierId] || 0) + 1;
    await store.save(state);
  }

  // ----------------------------------------------------------
  //  UTILITÁRIOS
  // ----------------------------------------------------------
  function listSettingsUserIds(guildId) {
    return Object.keys(state.settings?.[guildId] || {});
  }

  async function resetAll({ guildId } = {}) {
    if (guildId) {
      delete state.vips?.[guildId];
      delete state.settings?.[guildId];
      delete state.guilds?.[guildId];
    } else {
      state = { vips: {}, settings: {}, guilds: {} };
    }
    await store.save(state);
    return { ok: true };
  }

  // ----------------------------------------------------------
  //  GUILD CONFIG
  //  Campos relevantes adicionados:
  //    vipBaseRoleId        — Cargo base VIP global
  //    vipRoleSeparatorId   — Separador para posicionamento de cargos VIP
  //    familyRoleSeparatorId — Separador para cargos de família
  //    cargoFantasmaId      — Cargo Fantasma (Vigilante)
  // ----------------------------------------------------------
  async function setGuildConfig(gid, patch) {
    state.guilds[gid] = { ...(state.guilds[gid] || {}), ...patch };
    await store.save(state);
  }

  function getGuildConfig(gid) {
    return state.guilds[gid] || {};
  }

  // ----------------------------------------------------------
  //  EXPORTS
  // ----------------------------------------------------------
  return {
    init,
    addHook,
    getMemberTier,
    getOrderedTiers,
    addVip,
    removeVip,
    getVipData,
    verificarCota,
    registrarUso,
    listSettingsUserIds,
    resetAll,

    getVip:            (gid, uid) => state.vips?.[gid]?.[uid],
    listVipIds:        (gid) => Object.keys(state.vips?.[gid] || {}),
    getTierConfig:     (gid, tierId) => configManager.getTierConfig(gid, tierId),
    getFullVipReport:  async (gid) => ({ activeVips: Object.values(state.vips[gid] || {}) }),

    getGuildConfig,
    setGuildConfig,

    getSettings: (gid, uid) => state.settings?.[gid]?.[uid] || {},
    setSettings: async (gid, uid, patch) => {
      state.settings[gid]       = state.settings[gid]       || {};
      state.settings[gid][uid]  = { ...(state.settings[gid][uid] || {}), ...patch };
      await store.save(state);
    },
  };
}

module.exports = { createVipService };
