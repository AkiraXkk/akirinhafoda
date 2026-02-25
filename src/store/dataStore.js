const fs = require("node:fs/promises");
const path = require("node:path");
const { isMongoConnected } = require("../database/connect");
const { createMongoDataStore } = require("./mongoStore");

async function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await ensureParentDir(filePath);
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

function createLocalDataStore(fileName) {
  const filePath = path.join(process.cwd(), "data", fileName);
  let cache = null;

  async function load() {
    if (cache) return cache;
    cache = await readJson(filePath);
    return cache;
  }

  async function save(data) {
    cache = data;
    await writeJsonAtomic(filePath, data);
  }

  async function get(key) {
    const data = await load();
    return data[key];
  }

  async function set(key, value) {
    const data = await load();
    data[key] = value;
    await save(data);
    return value;
  }

  async function update(key, updateFn) {
    const data = await load();
    const current = data[key];
    const next = updateFn(current);
    data[key] = next;
    await save(data);
    return next;
  }

  return { load, save, get, set, update };
}

function createDataStore(fileName) {
  // If Mongo is connected, return Mongo Store
  // We check connection state dynamically or once?
  // Since connection happens at startup, checking here is fine.
  // Note: Services are created after connection is established in index.js.
  
  // However, createDataStore is called inside createEconomyService factory.
  // If createEconomyService is called BEFORE connection, it might pick local store.
  // In index.js, we should connect BEFORE creating services.
  
  if (isMongoConnected()) {
      return createMongoDataStore(fileName);
  }
  
  return createLocalDataStore(fileName);
}

module.exports = { createDataStore };
