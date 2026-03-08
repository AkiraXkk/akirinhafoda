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

    const haystack = [];
    
    // 1. Nick do Servidor (Isto já captura automaticamente as Clan Tags / Tags Oficiais de Servidor)
    if (cfg.includeDisplayName !== false) haystack.push(member?.displayName);
    
    // 2. Username original (@nome)
    if (cfg.includeUsername !== false) haystack.push(user?.username);
    
    // 3. Nick Global
    if (cfg.includeGlobalName !== false) haystack.push(user?.globalName);

    // 4. Status Personalizado (Link do Discord, Frases, etc)
    if (cfg.includeStatus !== false && member?.presence?.activities) {
        // O "type: 4" representa o "Custom Status" no Discord
        const customStatus = member.presence.activities.find(a => a.type === 4);
        if (customStatus && customStatus.state) {
            haystack.push(customStatus.state);
        }
    }

    // Junta tudo que achamos numa única string de texto e procura a tag/link
    const text = normalizeText(haystack.filter(Boolean).join(" | "));
    return tags.some((t) => text.includes(t));
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

    await guild.members.fetch().catch(() => null);

    let added = 0;
    let removed = 0;
    let scanned = 0;

    for (const member of guild.members.cache.values()) {
      if (!member || member.user?.bot) continue;
      scanned += 1;

      const hasRole = member.roles.cache.has(cfg.roleId);
      const shouldHave = memberMatches(member, member.user, cfg);

      if (shouldHave && !hasRole) {
        await member.roles.add(cfg.roleId).catch((err) => {
          log.warn({ guildId, userId: member.id, roleId: cfg.roleId, err: err?.message }, "Failed to add role in TagRole scan");
        });
        added += 1;
      }

      if (!shouldHave && hasRole && cfg.removeMissing !== false) {
        await member.roles.remove(cfg.roleId).catch((err) => {
          log.warn({ guildId, userId: member.id, roleId: cfg.roleId, err: err?.message }, "Failed to remove role in TagRole scan");
        });
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
