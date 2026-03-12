/**
 * Serviço compartilhado de warns — usado pelo AutoMod e pelo painel de moderação.
 *
 * Responsabilidades:
 *  - Registrar warns em warns.json
 *  - Verificar limites de auto-punição (mod_config.json)
 *  - Aplicar auto-mute / auto-ban quando necessário
 *  - Registrar log via client.services.log
 */

const { createDataStore } = require("../store/dataStore");
const { createEmbed } = require("../embeds");
const { logger } = require("../logger");

const warnsStore    = createDataStore("warns.json");
const modConfigStore = createDataStore("mod_config.json");

const AUTO_MUTE_DURATION_MS = 1 * 60 * 60 * 1000; // 1 hora

/**
 * Registra um warn para um usuário e aplica auto-punição se necessário.
 *
 * @param {import("discord.js").Guild}  guild
 * @param {string}                      userId    — ID do usuário alvo
 * @param {string}                      motivo    — Motivo do warn
 * @param {import("discord.js").Client} client    — client Discord (para logService)
 * @param {string}                      [modId]   — ID do moderador (padrão: ID do bot)
 * @param {object}                      [opts]
 * @param {string|null}                 [opts.logTitle] — Título do log; null para omitir o log do warnService
 * @returns {Promise<{warnCount: number, autoPunishment: string|null}>}
 */
async function registrarWarn(guild, userId, motivo, client, modId, opts = {}) {
  const modIdFinal = modId || client.user?.id || "AutoMod";
  const { logTitle = "AutoMod" } = opts;
  const warnKey    = `${guild.id}_${userId}`;

  // Registra o warn
  const warnData  = await warnsStore.get(warnKey);
  const historico = warnData?.historico || [];

  historico.push({
    moderador: modIdFinal,
    motivo,
    data: Date.now(),
  });
  await warnsStore.set(warnKey, { historico });
  const warnCount = historico.length;

  logger.info({ guildId: guild.id, userId, warnCount }, "WarnService: warn registrado");

  // Log via logService (omitido se logTitle === null)
  const logService = client?.services?.log;
  let user = null;
  try {
    user = await client.users.fetch(userId);
  } catch { /* usuário não encontrado */ }

  if (logTitle !== null && logService) {
    await logService.log(guild, {
      title: `⚠️ Warn Aplicado (${logTitle})`,
      description: `**${user?.username ?? userId}** (<@${userId}>) recebeu um warn automático.`,
      color: 0xFFCC00,
      fields: [
        { name: "👤 Usuário",         value: user?.username ?? userId, inline: true },
        { name: "⚠️ Total de Warns", value: `${warnCount}`,            inline: true },
        { name: "📝 Motivo",          value: motivo,                   inline: false },
      ],
    }).catch(() => {});
  }

  // Verifica limites de auto-punição
  const config   = (await modConfigStore.get(guild.id)) || {};
  const limitBan  = config.warn_limit_ban;
  const limitMute = config.warn_limit_mute;
  let autoPunishment = null;

  if (limitBan && warnCount >= limitBan) {
    // Auto-Ban
    autoPunishment = "ban";
    if (user) {
      try {
        await user.send({
          embeds: [createEmbed({
            title: "🔨 Você foi banido (Auto-Punição)",
            description:
              `Você atingiu **${warnCount} warns** no servidor **${guild.name}** e foi banido automaticamente.\n\n` +
              `**Último motivo:** ${motivo}`,
            color: 0xFF0000,
            footer: "Moderação | © WDA - Todos os direitos reservados",
          })],
        });
      } catch { /* DM bloqueada */ }
    }
    await guild.members.ban(userId, { reason: `Auto-Ban por acúmulo de ${warnCount} warns` }).catch(() => {});

    if (logService) {
      await logService.log(guild, {
        title: "🔨 Auto-Ban por Acúmulo de Warns",
        description: `**${user?.username ?? userId}** foi banido automaticamente após atingir **${warnCount}** warns.`,
        color: 0xFF0000,
        fields: [{ name: "⚠️ Total de Warns", value: `${warnCount}`, inline: true }],
      }).catch(() => {});
    }

  } else if (limitMute && warnCount >= limitMute) {
    // Auto-Mute (1 h)
    autoPunishment = "mute";
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
      await member
        .timeout(AUTO_MUTE_DURATION_MS, `Auto-Mute por acúmulo de ${warnCount} warns`)
        .catch(() => {});

      if (logService) {
        await logService.log(guild, {
          title: "🔇 Auto-Mute por Acúmulo de Warns",
          description:
            `**${user?.username ?? userId}** foi silenciado automaticamente por 1h após atingir **${warnCount}** warns.`,
          color: 0xFF6600,
          fields: [{ name: "⚠️ Total de Warns", value: `${warnCount}`, inline: true }],
        }).catch(() => {});
      }
    }
  }

  return { warnCount, autoPunishment };
}

module.exports = { warnsStore, registrarWarn };
