const { createDataStore } = require("../store/dataStore");

function createEconomyService({ vipService, vipConfig, logger } = {}) {
  const store = createDataStore("economy.json");

  async function getBalance(userId) {
    const data = await store.get(userId);
    return data || { coins: 0, bank: 0, lastWork: 0, lastDaily: 0 };
  }

  async function addCoins(userId, amount) {
    await store.update(userId, (current) => {
      const data = current || { coins: 0, bank: 0 };
      data.coins = (data.coins || 0) + amount;
      return data;
    });
  }

  async function removeCoins(userId, amount) {
    let success = false;
    await store.update(userId, (current) => {
      const data = current || { coins: 0, bank: 0 };
      if ((data.coins || 0) >= amount) {
        data.coins -= amount;
        success = true;
      }
      return data;
    });
    return success;
  }

  async function spendCoins(userId, amount) {
    return removeCoins(userId, amount);
  }

  async function transfer(fromId, toId, amount) {
    const fromBalance = await getBalance(fromId);
    if ((fromBalance.coins || 0) < amount) return false;
    await removeCoins(fromId, amount);
    await addCoins(toId, amount);
    return true;
  }

  async function work(userId, amount) {
    await store.update(userId, (current) => {
      const data = current || { coins: 0, bank: 0 };
      data.coins = (data.coins || 0) + amount;
      data.lastWork = Date.now();
      return data;
    });
  }

  async function resolveDailyAmount(userId, guildId, baseAmount) {
    if (!vipService || !vipConfig || !guildId) return { total: baseAmount, bonus: 0 };

    const vipEntry = vipService.getVip(userId);
    if (!vipEntry?.tierId) return { total: baseAmount, bonus: 0 };

    const tiers = await vipConfig.getGuildTiers(guildId);
    const tier = tiers[vipEntry.tierId];
    if (!tier) return { total: baseAmount, bonus: 0 };

    const percent = Number(tier.bonusDaily ?? 0);
    if (!Number.isFinite(percent) || percent <= 0) return { total: baseAmount, bonus: 0 };

    const bonus = Math.floor((baseAmount * percent) / 100);
    return { total: baseAmount + bonus, bonus };
  }

  async function daily(userId, amount, { guildId } = {}) {
    const { total, bonus } = await resolveDailyAmount(userId, guildId, amount);
    await store.update(userId, (current) => {
      const data = current || { coins: 0, bank: 0 };
      data.coins = (data.coins || 0) + total;
      data.lastDaily = Date.now();
      return data;
    });
    logger?.info?.({ userId, guildId, base: amount, total, bonus }, "Daily aplicado");
    return { total, bonus };
  }

  return { getBalance, addCoins, removeCoins, spendCoins, transfer, work, daily };
}

module.exports = { createEconomyService };
