const { createDataStore } = require("../store/dataStore");

function createEconomyService({ vipService, logger } = {}) {
  const store = createDataStore("economy.json");

  async function getBalance(userId) {
    const data = await store.get(userId);
    return data || { coins: 0, bank: 0, lastWork: 0, lastDaily: 0 };
  }

  async function addCoins(userId, amount) {
    await store.update(userId, (current) => {
      const data = current || { coins: 0, bank: 0, lastWork: 0, lastDaily: 0 };
      data.coins = (data.coins || 0) + Number(amount || 0);
      return data;
    });
  }

  async function removeCoins(userId, amount) {
    let success = false;
    await store.update(userId, (current) => {
      const data = current || { coins: 0, bank: 0, lastWork: 0, lastDaily: 0 };
      const debit = Number(amount || 0);
      if (debit <= 0) return data;
      if ((data.coins || 0) >= debit) {
        data.coins -= debit;
        success = true;
      }
      return data;
    });
    return success;
  }

  async function transfer(fromId, toId, amount) {
    const value = Number(amount || 0);
    if (value <= 0) return false;

    const fromBalance = await getBalance(fromId);
    if ((fromBalance.coins || 0) < value) return false;

    const removed = await removeCoins(fromId, value);
    if (!removed) return false;
    await addCoins(toId, value);
    return true;
  }

  async function work(userId, amount) {
    const value = Number(amount || 0);
    await store.update(userId, (current) => {
      const data = current || { coins: 0, bank: 0, lastWork: 0, lastDaily: 0 };
      data.coins = (data.coins || 0) + value;
      data.lastWork = Date.now();
      return data;
    });
  }

  function getDailyExtra(userId, guildId) {
    if (!vipService || !guildId) return 0;
    const vip = vipService.getVip(userId, { guildId });
    return Number(vip?.benefits?.valor_daily_extra || 0);
  }

  async function daily(userId, amount, { guildId } = {}) {
    const base = Number(amount || 0);
    const extra = getDailyExtra(userId, guildId);
    const total = base + extra;

    await store.update(userId, (current) => {
      const data = current || { coins: 0, bank: 0, lastWork: 0, lastDaily: 0 };
      data.coins = (data.coins || 0) + total;
      data.lastDaily = Date.now();
      return data;
    });

    logger?.info?.({ userId, guildId, base, extra, total }, "Daily processado");
    return { total, bonus: extra };
  }

  return { getBalance, addCoins, removeCoins, transfer, work, daily };
}

module.exports = { createEconomyService };
