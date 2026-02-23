const { createDataStore } = require("../store/dataStore");

const configStore = createDataStore("guildConfigs.json");

async function getGuildConfig(guildId) {
    if (!guildId) return {};
    const configs = await configStore.load();
    return configs[guildId] || {};
}

async function setGuildConfig(guildId, patch) {
    if (!guildId) return;
    await configStore.update(guildId, (current) => {
        return { ...(current || {}), ...patch };
    });
}

module.exports = { getGuildConfig, setGuildConfig };
