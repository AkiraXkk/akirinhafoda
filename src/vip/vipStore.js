const fs = require("node:fs/promises");
const path = require("node:path");

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

function createVipStore({ filePath }) {
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

module.exports = { createVipStore };
