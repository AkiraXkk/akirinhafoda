const { logger: rootLogger } = require("../logger");

function createTagRoleManager({ client, tagRoleService, targetGuildId, logger } = {}) {
  const log = logger || rootLogger;
  let timer = null;

  function normalizeText(value) {
    return String(value || "").toLowerCase();
  }

  function memberMatches(member, user, cfg) {
    const tags = (cfg.tags || []).map((t) => normalizeText(t)).filter(Boolean);
    if (!tags.length) return false;

    let points = 0; // Inicia o contador

    // ==========================================
    // 1. Verificação no Status Personalizado (Link na Bio)
    // ==========================================
    if (cfg.includeStatus !== false && member?.presence?.activities) {
        const customStatus = member.presence.activities.find(a => a.type === 4);
        if (customStatus && customStatus.state) {
            const statusText = normalizeText(customStatus.state);
            // Verifica se no status existe ALGUMA das tags ou links cadastrados
            if (tags.some(t => statusText.includes(t))) {
                points++;
            }
        }
    }

    // ==========================================
    // 2. Verificação no Nick Global / Username
    // ==========================================
    let hasGlobal = false;
    const globalStr = normalizeText(user?.globalName);
    const userStr = normalizeText(user?.username);

    if (cfg.includeGlobalName !== false && globalStr && tags.some(t => globalStr.includes(t))) {
        hasGlobal = true;
    } else if (cfg.includeUsername !== false && userStr && tags.some(t => userStr.includes(t))) {
        hasGlobal = true;
    }

    if (hasGlobal) points++;

    // ==========================================
    // 3. Verificação no Nick do Servidor (Apelido ou Tag de Clan)
    // ==========================================
    if (cfg.includeDisplayName !== false) {
        // Usa o member.nickname se ele tiver um apelido específico no servidor
        if (member.nickname) {
            const nickStr = normalizeText(member.nickname);
            if (tags.some(t => nickStr.includes(t))) {
                points++;
            }
        } 
        // Se não tiver nickname, usamos o displayName (que puxa a nova "Tag do Servidor" do Discord)
        else if (member.displayName) {
            const dispStr = normalizeText(member.displayName);
            // Trava Anti-trapaça: Só ganha esse ponto se o nome exibido no servidor for diferente do nome Global
            if (dispStr !== globalStr && dispStr !== userStr) {
                if (tags.some(t => dispStr.includes(t))) {
                    points++;
                }
            }
        }
    }

    // Retorna TRUE apenas se a pessoa somou 2 ou mais identificações
    return points >= 2;
  }

  async function applyOnce() {
    if (!client) return { ok: false, reason: "no_client" };
    if (!tagRoleService) return { ok: false, reason: "no_service" };

    const guildId = targetGuildId;
    if (!guildId) return { ok: false, reason: "no_target_guild" };

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return { ok: false, reason: "guild_not_found" };

    const cfg = await tagRoleService.getConfig(guildId);
    if (!cfg.enabled) return { ok: true, skipped: true, reason: "disabled" };
    if (!cfg.roleId) return { ok: true, skipped: true, reason: "no_role" };

    const role = await guild.roles.fetch(cfg.roleId).catch(() => null);
    if (!role) return { ok: true, skipped: true, reason: "role_not_found" };

    // 🔥 CORREÇÃO CRÍTICA: Força o download dos status dos membros! 🔥
    await guild.members.fetch({ withPresences: true }).catch(() => null);

    let added = 0;
    let removed = 0;
    let scanned = 0;

    for (const member of guild.members.cache.values()) {
      if (!member || member.user?.bot) continue;
      scanned += 1;

      const hasRole = member.roles.cache.has(cfg.roleId);
      const shouldHave = memberMatches(member, member.user, cfg);

      if (shouldHave && !hasRole) {
        await member.roles.add(cfg.roleId).catch(() => {});
        added += 1;
      }

      if (!shouldHave && hasRole && cfg.removeMissing !== false) {
        await member.roles.remove(cfg.roleId).catch(() => {});
        removed += 1;
      }
    }

    log.info({ guildId, scanned, added, removed }, "TagRole scan finished");
    return { ok: true, scanned, added, removed };
  }

  async function start() {
    const guildId = targetGuildId;
    if (!guildId) return;

    const cfg = await tagRoleService.getConfig(guildId);
    const intervalHours = Number(cfg.intervalHours || 6);
    const intervalMs = Math.max(1, intervalHours) * 60 * 60 * 1000;

    if (timer) clearInterval(timer);
    
    applyOnce().catch((err) => log.warn({ err }, "TagRole initial apply failed"));
    timer = setInterval(() => applyOnce().catch((err) => log.warn({ err }, "TagRole periodic apply failed")), intervalMs);
    
    log.info({ guildId, intervalHours }, "TagRole manager started");
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, applyOnce };
}

module.exports = { createTagRoleManager };
