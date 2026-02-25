const fs = require("node:fs/promises");
const path = require("node:path");
const { isMongoConnected } = require("../database/connect");
const { createMongoDataStore } = require("../store/mongoStore");

async function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await ensureParentDir(filePath);
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

function createLocalVipStore({ filePath }) {
  async function load() {
    const data = await readJson(filePath);
    if (!data || typeof data !== "object") return { vips: {}, settings: {}, guilds: {} };
    const vips = data.vips && typeof data.vips === "object" ? data.vips : {};
    const settings = data.settings && typeof data.settings === "object" ? data.settings : {};
    const guilds = data.guilds && typeof data.guilds === "object" ? data.guilds : {};
    return { vips, settings, guilds };
  }

  async function save(state) {
    await writeJsonAtomic(filePath, state);
  }

  return { load, save };
}

function createMongoVipStore() {
    // We use 3 separate stores for the 3 parts of VIP state
    const vipStore = createMongoDataStore("vips");
    const settingsStore = createMongoDataStore("vip_settings");
    const guildsStore = createMongoDataStore("vip_guilds");

    async function load() {
        const [vips, settings, guilds] = await Promise.all([
            vipStore.load(),
            settingsStore.load(),
            guildsStore.load()
        ]);
        return { vips, settings, guilds };
    }

    async function save(state) {
        // We only save what changed? No, save interface implies full save.
        // But efficient implementation in mongoStore uses delete/insert.
        // We should call save on each store.
        if (state.vips) await vipStore.save(state.vips);
        if (state.settings) await settingsStore.save(state.settings);
        if (state.guilds) await guildsStore.save(state.guilds);
    }

    return { load, save };
}

function createVipStore(options) {
    if (isMongoConnected()) {
        return createMongoVipStore();
    }
    return createLocalVipStore(options);
}

module.exports = { createVipStore };
