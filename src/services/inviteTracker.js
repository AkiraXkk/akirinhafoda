const { createDataStore } = require("../store/dataStore");
const { logger } = require("../logger");

const inviteStore = createDataStore("invites.json");

// Conta criada há menos de 7 dias = fake
const FAKE_ACCOUNT_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

// Cache em memória: Map<guildId, Map<inviteCode, uses>>
const inviteCache = new Map();

// ── FILA DE PROCESSAMENTO (Anti-Concorrência) ──────────────────────────────
const queue = [];
let processing = false;

/**
 * Cacheia os convites de uma guild para comparação futura.
 */
async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const guildMap = new Map();
    invites.forEach((inv) => guildMap.set(inv.code, inv.uses));
    inviteCache.set(guild.id, guildMap);
    logger.info({ guildId: guild.id, count: guildMap.size }, "[InviteTracker] Convites cacheados");
  } catch (err) {
    logger.warn({ err, guildId: guild.id }, "[InviteTracker] Não foi possível cachear convites (bot sem permissão ManageGuild?)");
  }
}

/**
 * Cacheia os convites de todas as guilds.
 */
async function cacheAllGuilds(client) {
  for (const [, guild] of client.guilds.cache) {
    await cacheGuildInvites(guild);
  }
}

/**
 * Adiciona um membro à fila de processamento.
 * Se a fila não estiver rodando, inicia o processamento.
 */
function enqueue(member) {
  queue.push(member);
  if (!processing) processQueue();
}

/**
 * Processa a fila SEQUENCIALMENTE — um membro por vez.
 * Retira o primeiro membro, rastreia o convite, atualiza cache/DB
 * e depois chama a si mesma para o próximo.
 */
async function processQueue() {
  if (queue.length === 0) {
    processing = false;
    return;
  }
  processing = true;
  const member = queue.shift();

  try {
    await trackInvite(member);
  } catch (err) {
    logger.error({ err, userId: member.id, guildId: member.guild.id }, "[InviteTracker] Erro ao processar membro na fila");
  }

  // Processa o próximo item da fila (recursivo)
  await processQueue();
}

/**
 * Rastreia qual convite foi usado quando um membro entra.
 * Compara o cache antigo com os convites atuais para descobrir qual teve o uso incrementado.
 */
async function trackInvite(member) {
  const guild = member.guild;
  const oldCache = inviteCache.get(guild.id) || new Map();

  let newInvites;
  try {
    newInvites = await guild.invites.fetch();
  } catch (err) {
    logger.warn({ err, guildId: guild.id }, "[InviteTracker] Não foi possível buscar convites");
    return null;
  }

  // Encontra qual convite teve o uso incrementado
  let usedInvite = null;
  for (const [code, invite] of newInvites) {
    const oldUses = oldCache.get(code) || 0;
    if (invite.uses > oldUses) {
      usedInvite = invite;
      break;
    }
  }

  // Atualiza o cache com os valores frescos
  const freshCache = new Map();
  newInvites.forEach((inv) => freshCache.set(inv.code, inv.uses));
  inviteCache.set(guild.id, freshCache);

  if (!usedInvite || !usedInvite.inviter) {
    logger.debug({ userId: member.id, guildId: guild.id }, "[InviteTracker] Não foi possível determinar o inviter");
    return null;
  }

  const inviterId = usedInvite.inviter.id;
  const storeKey = `${guild.id}:${inviterId}`;

  const accountAge = Date.now() - member.user.createdTimestamp;
  const isFake = accountAge < FAKE_ACCOUNT_THRESHOLD_MS;

  await inviteStore.update(storeKey, (current) => {
    const data = current || { total: 0, leaves: 0, fake: 0, invitedMembers: {} };
    data.total += 1;
    if (isFake) data.fake += 1;
    data.invitedMembers[member.id] = { joinedAt: Date.now(), fake: isFake };
    return data;
  });

  logger.info({ inviter: inviterId, invited: member.id, guildId: guild.id, fake: isFake }, "[InviteTracker] Convite rastreado");
  return { inviterId, isFake, inviteCode: usedInvite.code };
}

/**
 * Registra a saída de um membro, incrementando o leaves do inviter (padrinho).
 */
async function trackLeave(member) {
  const guild = member.guild;
  const allData = await inviteStore.load();

  for (const [key, data] of Object.entries(allData)) {
    if (!key.startsWith(`${guild.id}:`)) continue;
    if (data.invitedMembers && data.invitedMembers[member.id] && !data.invitedMembers[member.id].leftAt) {
      await inviteStore.update(key, (current) => {
        if (!current) return current;
        current.leaves = (current.leaves || 0) + 1;
        if (current.invitedMembers && current.invitedMembers[member.id]) {
          current.invitedMembers[member.id].leftAt = Date.now();
        }
        return current;
      });

      const inviterId = key.split(":")[1];
      logger.info({ inviter: inviterId, left: member.id, guildId: guild.id }, "[InviteTracker] Saída registrada");
      return inviterId;
    }
  }

  return null;
}

/**
 * Retorna os dados de convite de um usuário em uma guild.
 */
async function getInviteData(guildId, userId) {
  const key = `${guildId}:${userId}`;
  return await inviteStore.get(key);
}

/**
 * Retorna todos os dados de convite de uma guild.
 */
async function getAllInviteData(guildId) {
  const allData = await inviteStore.load();
  const result = {};
  for (const [key, data] of Object.entries(allData)) {
    if (key.startsWith(`${guildId}:`)) {
      const userId = key.split(":")[1];
      result[userId] = data;
    }
  }
  return result;
}

module.exports = {
  cacheGuildInvites,
  cacheAllGuilds,
  enqueue,
  trackLeave,
  getInviteData,
  getAllInviteData,
  inviteStore,
};
