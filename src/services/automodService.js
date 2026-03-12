/**
 * AutoMod Service — inspirado nos serviços de automoderação do SudoBot
 * (onesoft-sudo/sudobot): SpamModerationService, RuleModerationService,
 * RaidProtectionService, AntiMemberJoinService.
 *
 * Funcionalidades:
 *  - Anti-Spam        : limita mensagens por usuário em uma janela de tempo
 *  - Anti-Link        : bloqueia links de convite do Discord e URLs genéricas
 *  - Filtro de Palavras : remove mensagens com conteúdo proibido
 *  - Anti-Raid        : detecta entrada em massa de membros e toma ação
 *  - Anti-Join        : bloqueia entradas quando o servidor está em lockdown
 *
 * Integração com o sistema de moderação:
 *  - Ação "warn" registra o warn em warns.json via warnService
 *  - Respeita os limites de auto-punição configurados em mod_config.json
 *  - Envia logs tanto no canal de automod quanto no canal de logs principal
 */

const { PermissionFlagsBits } = require("discord.js");
const { createDataStore } = require("../store/dataStore");
const { logger } = require("../logger");
const { registrarWarn } = require("./warnService");

const automodStore = createDataStore("automod_config.json");

// ── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  antispam: { enabled: false, limite: 5, janela: 5000, acao: "delete" },
  antilink: { enabled: false, acao: "delete", bloquearUrls: false },
  filtro:   { enabled: false, palavras: [], acao: "delete" },
  antiraid: { enabled: false, limite: 10, janela: 10000, acao: "kick" },
  antijoin: { enabled: false, acao: "kick" },
  logChannelId: null,
};

// Regex para detectar links de convite do Discord (incluindo formatos alternativos e encurtadores)
const INVITE_REGEX =
  /\b(?:discord(?:\.gg|app\.com\/invite|\.com\/invite)|dsc\.gg|discord\.link)\/[\w-]+/i;

// Regex para detectar URLs genéricas (http/https) com estrutura de domínio válida
const URL_REGEX =
  /https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z]{2,}\b([-a-zA-Z0-9@:%_+.~#?&/=]*)/i;

// ── Durações de timeout ───────────────────────────────────────────────────────
const SPAM_MUTE_DURATION_MS  = 10 * 60 * 1000; // 10 minutos (spam / palavra proibida)

// ── Caches em memória ────────────────────────────────────────────────────────
// spam cache: `${guildId}_${userId}` -> { timestamps: number[] }
const spamCache = new Map();

// raid cache: guildId -> { timestamps: number[], actionTaken: boolean }
const raidCache = new Map();

// ── Helpers de configuração ──────────────────────────────────────────────────

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val !== null && val !== undefined && typeof val === "object" && !Array.isArray(val)) {
      result[key] = deepMerge(target[key] || {}, val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

async function getConfig(guildId) {
  const all = await automodStore.load();
  return all[guildId] || {};
}

async function setConfig(guildId, config) {
  await automodStore.set(guildId, config);
}

async function mergeConfig(guildId, partial) {
  const current = await getConfig(guildId);
  const updated = deepMerge(current, partial);
  await setConfig(guildId, updated);
  return updated;
}

function getFullConfig(rawConfig) {
  return deepMerge(DEFAULT_CONFIG, rawConfig || {});
}

// ── Logger de ações do AutoMod ───────────────────────────────────────────────

async function logAutomodAction(guild, titulo, descricao) {
  try {
    const raw = await getConfig(guild.id);
    const channelId = raw.logChannelId;

    // Canal dedicado de automod
    if (channelId) {
      const channel = guild.channels.cache.get(channelId);
      if (channel) {
        const { createEmbed } = require("../embeds");
        const embed = createEmbed({
          title: `🛡️ AutoMod — ${titulo}`,
          description: descricao,
          color: 0xff6b35,
          footer: "AutoMod Log",
          timestamp: true,
        });
        await channel.send({ embeds: [embed] }).catch(() => {});
      }
    }

    // Canal de logs principal (via logService)
    const logService = guild.client?.services?.log;
    if (logService) {
      await logService.log(guild, {
        title: `🛡️ AutoMod — ${titulo}`,
        description: descricao,
        color: 0xff6b35,
      }).catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, "AutoMod: Erro ao enviar log");
  }
}

// ── checkMessage ─────────────────────────────────────────────────────────────

/**
 * Verifica uma mensagem contra todas as regras de AutoMod ativas.
 * Chamado no evento messageCreate.
 */
async function checkMessage(message) {
  if (!message.guild || message.author.bot) return;

  // Membros com ManageMessages ou ManageGuild ficam isentos
  if (
    message.member &&
    (message.member.permissions.has(PermissionFlagsBits.ManageMessages) ||
      message.member.permissions.has(PermissionFlagsBits.ManageGuild))
  ) {
    return;
  }

  const raw = await getConfig(message.guildId);
  const config = getFullConfig(raw);

  if (config.antispam.enabled) {
    await checkSpam(message, config.antispam);
  }

  if (config.antilink.enabled) {
    await checkLinks(message, config.antilink);
  }

  if (config.filtro.enabled && config.filtro.palavras.length > 0) {
    await checkWordFilter(message, config.filtro);
  }
}

// ── Anti-Spam ─────────────────────────────────────────────────────────────────

async function checkSpam(message, config) {
  const key = `${message.guildId}_${message.author.id}`;
  const now = Date.now();

  let entry = spamCache.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    spamCache.set(key, entry);
  }

  // Remove timestamps fora da janela
  entry.timestamps = entry.timestamps.filter((timestamp) => now - timestamp < config.janela);
  entry.timestamps.push(now);

  if (entry.timestamps.length < config.limite) return;

  // Reset para evitar ações repetidas
  entry.timestamps = [];

  logger.info(
    { userId: message.author.id, guildId: message.guildId },
    "AutoMod: Spam detectado"
  );

  try {
    await applySpamAction(message, config);
    await logAutomodAction(
      message.guild,
      "Anti-Spam",
      `**Usuário:** ${message.author.tag} (<@${message.author.id}>)\n` +
        `**Ação:** ${config.acao}\n` +
        `**Canal:** <#${message.channelId}>`
    );
  } catch (err) {
    logger.error({ err }, "AutoMod: Erro ao aplicar ação anti-spam");
  }
}

async function applySpamAction(message, config) {
  switch (config.acao) {
    case "delete":
      await message.delete().catch(() => {});
      sendWarning(
        message.channel,
        `⚠️ ${message.author}, você está enviando mensagens muito rápido!`
      );
      break;

    case "warn":
      await message.delete().catch(() => {});
      try {
        await registrarWarn(
          message.guild,
          message.author.id,
          "AutoMod: Spam detectado",
          message.client
        );
      } catch (err) {
        logger.error({ err }, "AutoMod: Erro ao registrar warn por spam");
      }
      sendWarning(
        message.channel,
        `⚠️ ${message.author}, você está enviando mensagens muito rápido! Aviso registrado.`
      );
      break;

    case "mute":
      await message.delete().catch(() => {});
      if (message.member) {
        await message.member
          .timeout(SPAM_MUTE_DURATION_MS, "AutoMod: Spam detectado")
          .catch(() => {});
        sendWarning(
          message.channel,
          `🔇 ${message.author} foi silenciado por 10 minutos por spam.`
        );
      }
      break;

    case "kick":
      await message.delete().catch(() => {});
      if (message.member) {
        await message.member.kick("AutoMod: Spam detectado").catch(() => {});
      }
      break;

    case "ban":
      await message.delete().catch(() => {});
      await message.guild.members
        .ban(message.author.id, { reason: "AutoMod: Spam detectado" })
        .catch(() => {});
      break;
  }
}

// ── Anti-Link ────────────────────────────────────────────────────────────────

async function checkLinks(message, config) {
  const isInvite = INVITE_REGEX.test(message.content);
  const isUrl    = config.bloquearUrls && URL_REGEX.test(message.content);

  if (!isInvite && !isUrl) return;

  const tipo = isInvite ? "Link de convite" : "URL";

  logger.info(
    { userId: message.author.id, guildId: message.guildId },
    `AutoMod: ${tipo} detectado`
  );

  try {
    await applyLinkAction(message, config);
    await logAutomodAction(
      message.guild,
      "Anti-Link",
      `**Usuário:** ${message.author.tag} (<@${message.author.id}>)\n` +
        `**Tipo:** ${tipo}\n` +
        `**Ação:** ${config.acao}\n` +
        `**Canal:** <#${message.channelId}>\n` +
        `**Mensagem:** ${message.content.substring(0, 200)}`
    );
  } catch (err) {
    logger.error({ err }, "AutoMod: Erro ao aplicar ação anti-link");
  }
}

async function applyLinkAction(message, config) {
  switch (config.acao) {
    case "delete":
      await message.delete().catch(() => {});
      sendWarning(
        message.channel,
        `⚠️ ${message.author}, links não são permitidos neste servidor!`
      );
      break;

    case "warn":
      await message.delete().catch(() => {});
      try {
        await registrarWarn(
          message.guild,
          message.author.id,
          "AutoMod: Link não permitido detectado",
          message.client
        );
      } catch (err) {
        logger.error({ err }, "AutoMod: Erro ao registrar warn por link");
      }
      sendWarning(
        message.channel,
        `⚠️ ${message.author}, links não são permitidos! Aviso registrado.`
      );
      break;

    case "kick":
      await message.delete().catch(() => {});
      if (message.member) {
        await message.member
          .kick("AutoMod: Link não permitido detectado")
          .catch(() => {});
      }
      break;
  }
}

// ── Filtro de Palavras ───────────────────────────────────────────────────────

async function checkWordFilter(message, config) {
  const content = message.content.toLowerCase();
  const matched = config.palavras.find((word) => content.includes(word.toLowerCase()));
  if (!matched) return;

  logger.info(
    { userId: message.author.id, guildId: message.guildId, word: matched },
    "AutoMod: Palavra bloqueada detectada"
  );

  try {
    await message.delete().catch(() => {});
    await applyWordFilterAction(message, config, matched);
    await logAutomodAction(
      message.guild,
      "Filtro de Palavras",
      `**Usuário:** ${message.author.tag} (<@${message.author.id}>)\n` +
        `**Canal:** <#${message.channelId}>\n` +
        `**Ação:** ${config.acao || "delete"}\n` +
        `**Palavra detectada:** \`${matched}\``
    );
  } catch (err) {
    logger.error({ err }, "AutoMod: Erro ao aplicar filtro de palavras");
  }
}

async function applyWordFilterAction(message, config, matched) {
  const acao = config.acao || "delete";

  switch (acao) {
    case "delete":
      sendWarning(
        message.channel,
        `⚠️ ${message.author}, sua mensagem contém conteúdo proibido.`
      );
      break;

    case "warn":
      try {
        await registrarWarn(
          message.guild,
          message.author.id,
          `AutoMod: Palavra proibida detectada — "${matched}"`,
          message.client
        );
      } catch (err) {
        logger.error({ err }, "AutoMod: Erro ao registrar warn por palavra proibida");
      }
      sendWarning(
        message.channel,
        `⚠️ ${message.author}, sua mensagem contém conteúdo proibido! Aviso registrado.`
      );
      break;

    case "mute":
      if (message.member) {
        await message.member
          .timeout(SPAM_MUTE_DURATION_MS, `AutoMod: Palavra proibida — "${matched}"`)
          .catch(() => {});
        sendWarning(
          message.channel,
          `🔇 ${message.author} foi silenciado por 10 minutos por uso de conteúdo proibido.`
        );
      }
      break;

    case "kick":
      if (message.member) {
        await message.member
          .kick(`AutoMod: Palavra proibida — "${matched}"`)
          .catch(() => {});
      }
      break;
  }
}

// ── checkMemberJoin ──────────────────────────────────────────────────────────

/**
 * Verifica se um novo membro dispara proteção anti-raid ou anti-join.
 * Chamado no evento guildMemberAdd.
 */
async function checkMemberJoin(member) {
  const raw = await getConfig(member.guild.id);
  const config = getFullConfig(raw);

  // Anti-join: simplesmente expulsa/bane se estiver ativo
  if (config.antijoin.enabled) {
    logger.info(
      { userId: member.id, guildId: member.guild.id },
      "AutoMod: Anti-join ativo, aplicando ação ao novo membro"
    );
    await applyAntiJoinAction(member, config.antijoin).catch((err) =>
      logger.error({ err }, "AutoMod: Erro na ação anti-join")
    );
    return;
  }

  // Anti-raid
  if (config.antiraid.enabled) {
    await checkRaid(member, config.antiraid);
  }
}

async function applyAntiJoinAction(member, config) {
  switch (config.acao) {
    case "kick":
      await member
        .kick("AutoMod: Servidor não está aceitando novos membros no momento.")
        .catch(() => {});
      break;
    case "ban":
      await member.guild.members
        .ban(member.id, {
          reason: "AutoMod: Servidor não está aceitando novos membros.",
        })
        .catch(() => {});
      break;
  }
}

// ── Anti-Raid ────────────────────────────────────────────────────────────────

async function checkRaid(member, config) {
  const guildId = member.guild.id;
  const now = Date.now();

  let entry = raidCache.get(guildId);
  if (!entry) {
    entry = { timestamps: [], actionTaken: false };
    raidCache.set(guildId, entry);
  }

  // Se o último registro foi muito antigo, reinicia a janela
  if (
    entry.timestamps.length > 0 &&
    now - entry.timestamps[entry.timestamps.length - 1] > config.janela * 3
  ) {
    entry.timestamps = [];
    entry.actionTaken = false;
  }

  entry.timestamps = entry.timestamps.filter((timestamp) => now - timestamp < config.janela);
  entry.timestamps.push(now);

  // Se já estiver em modo raid, aplica ação em cada novo membro
  if (entry.actionTaken) {
    await applyRaidMemberAction(member, config).catch(() => {});
    return;
  }

  if (entry.timestamps.length < config.limite) return;

  entry.actionTaken = true;
  const count = entry.timestamps.length;

  logger.warn(
    { guildId, membersJoined: count },
    "AutoMod: RAID DETECTADO!"
  );

  await Promise.all([
    applyRaidServerAction(member.guild, config),
    applyRaidMemberAction(member, config),
  ]);

  await logAutomodAction(
    member.guild,
    "🚨 Anti-Raid — Raid Detectado!",
    `**Membros entraram:** ${count} em ${config.janela / 1000}s\n` +
      `**Ação nos membros:** ${config.acao}`
  );
}

async function applyRaidMemberAction(member, config) {
  switch (config.acao) {
    case "kick":
      await member.kick("AutoMod: Proteção anti-raid ativa").catch(() => {});
      break;
    case "ban":
      await member.guild.members
        .ban(member.id, { reason: "AutoMod: Proteção anti-raid ativa" })
        .catch(() => {});
      break;
    case "lock":
      // Em modo "lock", não expulsa membros individuais — trava canais
      break;
  }
}

async function applyRaidServerAction(guild, config) {
  if (config.acao !== "lock") return;

  const textChannels = guild.channels.cache.filter(
    (channel) => channel.isTextBased() && channel.type === 0
  );

  for (const [, textChannel] of textChannels) {
    await textChannel.permissionOverwrites
      .edit(guild.roles.everyone, { SendMessages: false })
      .catch(() => {});
  }

  logger.info({ guildId: guild.id }, "AutoMod: Canais travados por raid");
}

// ── Utilitário ───────────────────────────────────────────────────────────────

function sendWarning(channel, content) {
  channel
    .send({ content })
    .then((m) => setTimeout(() => m.delete().catch(() => {}), 6000))
    .catch(() => {});
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  automodStore,
  DEFAULT_CONFIG,
  getConfig,
  setConfig,
  mergeConfig,
  getFullConfig,
  checkMessage,
  checkMemberJoin,
};
