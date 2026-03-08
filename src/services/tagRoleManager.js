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

    // 1. Coleta TODO o texto do usuário (Status, Nicks, etc) em um único bloco de texto
    const haystackParts = [];

    // Status Personalizado (Bio)
    if (cfg.includeStatus !== false && member?.presence?.activities) {
        const customStatus = member.presence.activities.find(a => a.type === 4);
        if (customStatus && customStatus.state) haystackParts.push(customStatus.state);
    }

    // Nomes e Nicks (Global e Servidor)
    if (cfg.includeGlobalName !== false) haystackParts.push(user?.globalName);
    if (cfg.includeUsername !== false) haystackParts.push(user?.username);
    if (cfg.includeDisplayName !== false) {
        haystackParts.push(member?.nickname);
        haystackParts.push(member?.displayName);
    }

    const allText = normalizeText(haystackParts.filter(Boolean).join(" | "));

    // 2. Procura quais das suas tags configuradas existem dentro de todo o texto do membro
    const foundTags = tags.filter(t => allText.includes(t));

    // 3. Trava Anti-trapaça (Filtra substrings duplicadas)
    // Exemplo: Se achou "discord.gg/wda" e ".gg/wda", ele apaga o menor e conta só 1 ponto!
    const uniqueTags = foundTags.filter(t1 => {
        // Mantém t1 SE não existir nenhuma outra tag (t2) que já contenha t1 inteira dentro dela
        return !foundTags.some(t2 => t1 !== t2 && t2.includes(t1));
    });

    // 4. O membro ganha se tiver pelo menos 2 identificações diferentes no total!
    return uniqueTags.length >= 2;
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

    // Força o download de todos os membros e de seus Status Personalizados
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
