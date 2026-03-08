const { createDataStore } = require("../store/dataStore");

function createEconomyService() {
  const store = createDataStore("economy.json");

  function buildKey(guildId, userId) {
    const gid = String(guildId || "").trim();
    const uid = String(userId || "").trim();
    if (!gid || !uid) return null;
    return `${gid}:${uid}`;
  }

  function normalizeArgs(arg1, arg2) {
    // Supports legacy: (userId)
    // Supports new: ({ guildId, userId })
    // Supports new: (guildId, userId)
    if (typeof arg1 === "object" && arg1) {
      const key = buildKey(arg1.guildId, arg1.userId);
      return { key, guildId: arg1.guildId, userId: arg1.userId, legacyUserId: null };
    }
    if (typeof arg2 === "string" || typeof arg2 === "number") {
      const key = buildKey(arg1, arg2);
      return { key, guildId: arg1, userId: arg2, legacyUserId: null };
    }
    return { key: null, guildId: null, userId: null, legacyUserId: String(arg1 || "").trim() || null };
  }

  async function getBalance(arg1, arg2) {
    const { key, legacyUserId } = normalizeArgs(arg1, arg2);
    const data = await store.get(key || legacyUserId);
    return data || { coins: 0, bank: 0 };
  }

  async function addCoins(arg1, arg2, arg3) {
    const amount = typeof arg3 === "number" ? arg3 : arg2;
    const { key, legacyUserId } = normalizeArgs(arg1, arg2);
    await store.update(key || legacyUserId, (current) => {
      const data = current || { coins: 0, bank: 0 };
      data.coins = (data.coins || 0) + amount;
      return data;
    });
  }

  async function removeCoins(arg1, arg2, arg3) {
    const amount = typeof arg3 === "number" ? arg3 : arg2;
    const { key, legacyUserId } = normalizeArgs(arg1, arg2);
    let success = false;
    await store.update(key || legacyUserId, (current) => {
      const data = current || { coins: 0, bank: 0 };
      if ((data.coins || 0) >= amount) {
        data.coins -= amount;
        success = true;
      }
      return data;
    });
    return success;
  }

  async function transfer(guildId, fromId, toId, amount) {
    // Legacy support: transfer(fromId, toId, amount)
    if (typeof amount !== "number") {
      amount = toId;
      toId = fromId;
      fromId = guildId;
      guildId = null;
    }

    const fromBalance = guildId ? await getBalance(guildId, fromId) : await getBalance(fromId);
    if ((fromBalance.coins || 0) < amount) return false;

    if (guildId) {
      await removeCoins(guildId, fromId, amount);
      await addCoins(guildId, toId, amount);
    } else {
      await removeCoins(fromId, amount);
      await addCoins(toId, amount);
    }
    return true;
  }

  async function work(arg1, arg2, arg3) {
      const amount = typeof arg3 === "number" ? arg3 : arg2;
      const { key, legacyUserId } = normalizeArgs(arg1, arg2);
      await store.update(key || legacyUserId, (current) => {
          const data = current || { coins: 0, bank: 0 };
          data.coins = (data.coins || 0) + amount;
          data.lastWork = Date.now();
          return data;
      });
  }

  async function daily(arg1, arg2, arg3) {
      const amount = typeof arg3 === "number" ? arg3 : arg2;
      const { key, legacyUserId } = normalizeArgs(arg1, arg2);
      const targetKey = key || legacyUserId;
      
      let success = false;
      let nextDaily = 0;

      await store.update(targetKey, (current) => {
          const data = current || { coins: 0, bank: 0 };
          const now = Date.now();
          const cooldown = 24 * 60 * 60 * 1000; // 24 horas em milissegundos

          // Verifica se já resgatou nas últimas 24 horas
          if (data.lastDaily && now - data.lastDaily < cooldown) {
              success = false;
              nextDaily = data.lastDaily + cooldown;
              return data; // Retorna sem alterar os dados
          }

          // Se pode resgatar, adiciona as moedas e atualiza o tempo
          data.coins = (data.coins || 0) + amount;
          data.lastDaily = now;
          success = true;
          return data;
      });

      // Retorna para o economy.js saber se deu certo ou quando é o próximo
      return { success, nextDaily };
  }

  async function claimDaily({ guildId, userId, amount }) {
    const key = buildKey(guildId, userId);
    if (!key) throw new Error("guildId/userId inválidos");
    return await daily({ guildId, userId }, amount);
  }

  async function depositToBank(guildId, userId, amount) {
    const key = buildKey(guildId, userId);
    if (!key) return { success: false };
    let success = false;
    await store.update(key, (current) => {
      const data = current || { coins: 0, bank: 0 };
      if ((data.coins || 0) < amount) {
        success = false;
        return data;
      }
      data.coins -= amount;
      data.bank = (data.bank || 0) + amount;
      success = true;
      return data;
    });
    return { success };
  }

  async function withdrawFromBank(guildId, userId, amount) {
    const key = buildKey(guildId, userId);
    if (!key) return { success: false };
    let success = false;
    await store.update(key, (current) => {
      const data = current || { coins: 0, bank: 0 };
      if ((data.bank || 0) < amount) {
        success = false;
        return data;
      }
      data.bank -= amount;
      data.coins = (data.coins || 0) + amount;
      success = true;
      return data;
    });
    return { success };
  }

  async function hourly(guildId, userId, amount) {
    const key = buildKey(guildId, userId);
    if (!key) return { success: false };
    let success = false;
    let nextHourly = 0;
    await store.update(key, (current) => {
      const data = current || { coins: 0, bank: 0 };
      const now = Date.now();
      const cooldown = 60 * 60 * 1000; // 1 hora
      if (data.lastHourly && now - data.lastHourly < cooldown) {
        success = false;
        nextHourly = data.lastHourly + cooldown;
        return data;
      }
      data.coins = (data.coins || 0) + amount;
      data.lastHourly = now;
      success = true;
      return data;
    });
    return { success, nextHourly };
  }

  async function weekly(guildId, userId, amount) {
    const key = buildKey(guildId, userId);
    if (!key) return { success: false };
    let success = false;
    let nextWeekly = 0;
    await store.update(key, (current) => {
      const data = current || { coins: 0, bank: 0 };
      const now = Date.now();
      const cooldown = 7 * 24 * 60 * 60 * 1000; // 7 dias
      if (data.lastWeekly && now - data.lastWeekly < cooldown) {
        success = false;
        nextWeekly = data.lastWeekly + cooldown;
        return data;
      }
      data.coins = (data.coins || 0) + amount;
      data.lastWeekly = now;
      success = true;
      return data;
    });
    return { success, nextWeekly };
  }

  return {
    getBalance, addCoins, removeCoins, transfer, work, daily, claimDaily,
    depositToBank, withdrawFromBank, hourly, weekly, buildKey
  };
}

module.exports = { createEconomyService };