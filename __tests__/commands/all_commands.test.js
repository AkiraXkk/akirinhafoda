const fs = require("node:fs");
const path = require("node:path");

function createFluentBuilder() {
  const state = { name: undefined };
  const target = {};

  const proxy = new Proxy(target, {
    get(_, prop) {
      if (prop === "name") return state.name;
      if (prop === "toJSON") {
        return () => (state.name ? { name: state.name } : {});
      }

      return (...args) => {
        if (prop === "setName" && typeof args[0] === "string") {
          state.name = args[0];
        }

        const cb = args.find((a) => typeof a === "function");
        if (cb) {
          try {
            cb(createFluentBuilder());
          } catch {
            // noop
          }
        }

        return proxy;
      };
    },
  });

  return proxy;
}

class mockFluentBuilder {
  constructor() {
    return createFluentBuilder();
  }
}

class mockSchema {
  constructor(definition, options) {
    this.definition = definition;
    this.options = options;
  }

  index() {}

  pre() {}

  post() {}

  virtual() {
    return createFluentBuilder();
  }
}

const mockDiscordBase = {
  SlashCommandBuilder: mockFluentBuilder,
  EmbedBuilder: mockFluentBuilder,
  ActionRowBuilder: mockFluentBuilder,
  ButtonBuilder: mockFluentBuilder,
  StringSelectMenuBuilder: mockFluentBuilder,
  StringSelectMenuOptionBuilder: mockFluentBuilder,
  ModalBuilder: mockFluentBuilder,
  TextInputBuilder: mockFluentBuilder,
  PermissionFlagsBits: new Proxy(
    {},
    {
      get: () => 0n,
    }
  ),
  MessageFlags: { Ephemeral: 64 },
  ChannelType: new Proxy({}, { get: () => 0 }),
  ComponentType: new Proxy({}, { get: () => 0 }),
  ButtonStyle: new Proxy({}, { get: () => 0 }),
  TextInputStyle: new Proxy({}, { get: () => 0 }),
  Events: { InteractionCreate: "interactionCreate" },
  Collection: class Collection extends Map {},
};

const mockDiscord = new Proxy(mockDiscordBase, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return mockFluentBuilder;
  },
});

jest.mock("discord.js", () => mockDiscord, { virtual: true });
jest.mock("@discordjs/builders", () => ({ SlashCommandBuilder: mockFluentBuilder }), {
  virtual: true,
});
jest.mock("mongoose", () => ({
  Schema: mockSchema,
  model: jest.fn(() => ({})),
  models: {},
  connect: jest.fn(),
  Types: { ObjectId: class MockObjectId {} },
}), { virtual: true });
jest.mock("canvas", () => ({
  createCanvas: jest.fn(() => ({
    getContext: jest.fn(() => ({
      fillRect: jest.fn(),
      drawImage: jest.fn(),
      fillText: jest.fn(),
      measureText: jest.fn(() => ({ width: 0 })),
    })),
    toBuffer: jest.fn(() => Buffer.from("")),
  })),
  loadImage: jest.fn(async () => ({})),
  registerFont: jest.fn(),
}), { virtual: true });
jest.mock("canvacord", () => new Proxy({}, { get: () => mockFluentBuilder }), {
  virtual: true,
});
jest.mock("dotenv", () => ({ config: jest.fn() }), { virtual: true });
jest.mock("pino", () => {
  return jest.fn(() => ({
    fatal: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    child: jest.fn(function child() {
      return this;
    }),
  }));
}, { virtual: true });

const repositoryRoot = path.resolve(__dirname, "..", "..");
const commandsDir = path.join(repositoryRoot, "src", "commands");
const interactionRouterPath = path.join(repositoryRoot, "src", "events", "interactionCreate.js");

const commandFiles = fs.readdirSync(commandsDir).filter((file) => file.endsWith(".js"));
const interactionRouterSource = fs.readFileSync(interactionRouterPath, "utf8");

function readRoutedCommandNames() {
  const routed = new Set();
  const regex = /commandName\s*=\s*["'`]([^"'`]+)["'`]/g;
  let match;

  while ((match = regex.exec(interactionRouterSource)) !== null) {
    routed.add(match[1]);
  }

  return routed;
}

const routedCommandNames = readRoutedCommandNames();

function loadCommand(fileName) {
  const filePath = path.join(commandsDir, fileName);
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(filePath);
}

describe("Global command structure", () => {
  test("should find .js files in commands folder", () => {
    expect(commandFiles.length).toBeGreaterThan(0);
  });

  describe.each(commandFiles)("Comando %s", (fileName) => {
    let command;

    beforeAll(() => {
      command = loadCommand(fileName);
    });

    test("exports base Discord properties (name or data)", () => {
      const hasName = typeof command?.name === "string" && command.name.trim().length > 0;
      const hasData = command?.data != null;

      expect(hasName || hasData).toBe(true);
    });

    test("exports the required execute function", () => {
      expect(typeof command?.execute).toBe("function");
    });

    test("when routed for button in interactionCreate, exports handleButton", () => {
      const fileStem = path.basename(fileName, ".js");
      const exportedName = command?.data?.name || command?.name || fileStem;

      const routedByName = routedCommandNames.has(exportedName);
      const routedByFileName = routedCommandNames.has(fileStem);

      if (routedByName || routedByFileName) {
        expect(typeof command?.handleButton).toBe("function");
      }
    });
  });
});
