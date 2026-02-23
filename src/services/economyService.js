const { createDataStore } = require("../store/dataStore");

function createEconomyService() {
  const store = createDataStore("economy.json");

  async function getBalance(userId) {
    const data = await store.get(userId);
    return data || { coins: 0, bank: 0 };
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

  async function daily(userId, amount) {
      await store.update(userId, (current) => {
          const data = current || { coins: 0, bank: 0 };
          data.coins = (data.coins || 0) + amount;
          data.lastDaily = Date.now();
          return data;
      });
  }

  return { getBalance, addCoins, removeCoins, transfer, work, daily };
}

module.exports = { createEconomyService };
