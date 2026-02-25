const mongoose = require("mongoose");
const { logger } = require("../logger");

const models = {};

function getModel(name) {
  // Normalize collection name: remove .json
  const collectionName = name.replace(".json", "");
  
  if (models[collectionName]) return models[collectionName];

  // Generic schema: _id is string (key), any other fields allowed
  // strict: false allows dynamic fields
  const schema = new mongoose.Schema({}, { strict: false, versionKey: false, _id: false });
  // We manually handle _id as String
  schema.add({ _id: { type: String, required: true } });

  const model = mongoose.model(collectionName, schema, collectionName);
  models[collectionName] = model;
  return model;
}

function createMongoDataStore(fileName) {
  const Model = getModel(fileName);
  const collectionName = fileName.replace(".json", "");

  async function load() {
    try {
      const docs = await Model.find({}).lean();
      const data = {};
      for (const doc of docs) {
        const { _id, ...rest } = doc;
        data[_id] = rest;
      }
      return data;
    } catch (error) {
      logger.error({ err: error, collection: collectionName }, "Erro ao carregar dados do MongoDB");
      return {};
    }
  }

  async function save(data) {
    if (!data || typeof data !== "object") return;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Full replacement: Delete all, Insert all
      await Model.deleteMany({}, { session });

      const docs = Object.entries(data).map(([key, value]) => ({
        _id: key,
        ...value
      }));

      if (docs.length > 0) {
        await Model.insertMany(docs, { session });
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      logger.error({ err: error, collection: collectionName }, "Erro ao salvar dados no MongoDB");
      throw error;
    } finally {
      session.endSession();
    }
  }

  async function get(key) {
    try {
      const doc = await Model.findById(key).lean();
      if (!doc) return undefined;
      const { _id, ...rest } = doc;
      return rest;
    } catch (error) {
      logger.error({ err: error, collection: collectionName, key }, "Erro ao buscar item no MongoDB");
      return undefined;
    }
  }

  async function set(key, value) {
    try {
      const doc = { _id: key, ...value };
      await Model.findByIdAndUpdate(
        key,
        { $set: value },
        { upsert: true, new: true }
      );
      return value;
    } catch (error) {
      logger.error({ err: error, collection: collectionName, key }, "Erro ao definir item no MongoDB");
      throw error;
    }
  }

  async function update(key, updateFn) {
    // Optimistic locking not strictly needed here if single instance
    // But we fetch, apply, update
    try {
      const doc = await Model.findById(key).lean();
      const current = doc ? (() => { const { _id, ...rest } = doc; return rest; })() : undefined;
      
      const next = updateFn(current);
      
      await Model.findByIdAndUpdate(
        key,
        { $set: next },
        { upsert: true, returnDocument: 'after' }
      );
      
      return next;
    } catch (error) {
      logger.error({ err: error, collection: collectionName, key }, "Erro ao atualizar item no MongoDB");
      throw error;
    }
  }

  return { load, save, get, set, update };
}

module.exports = { createMongoDataStore };
