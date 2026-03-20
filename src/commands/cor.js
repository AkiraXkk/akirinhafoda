const { SlashCommandBuilder,
  MessageFlags, } = require("discord.js");
const { createEmbed, createErrorEmbed } = require("../embeds");
const { logger } = require("../logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("cor")
    .setDescription("Utilitários de cores — visualize, converta ou gere cores aleatórias")
    .addSubcommand((sub) =>
      sub
        .setName("ver")
        .setDescription("Visualiza uma cor em hex no chat")
        .addStringOption((opt) =>
          opt
            .setName("hex")
            .setDescription("Código hex da cor (ex: #ff0000, ff0000)")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("aleatorio").setDescription("Gera uma cor aleatória")
    )
    .addSubcommand((sub) =>
      sub
        .setName("rgb")
        .setDescription("Converte valores RGB para hex")
        .addIntegerOption((opt) =>
          opt.setName("r").setDescription("Valor do Vermelho (0-255)").setMinValue(0).setMaxValue(255).setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName("g").setDescription("Valor do Verde (0-255)").setMinValue(0).setMaxValue(255).setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName("b").setDescription("Valor do Azul (0-255)").setMinValue(0).setMaxValue(255).setRequired(true)
        )
    ),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();

      if (sub === "ver") {
        let hexInput = interaction.options.getString("hex").trim().replace(/^#/, "");

        // Aceita hex de 3 caracteres (ex: f00 → ff0000)
        if (/^[0-9a-fA-F]{3}$/.test(hexInput)) {
          hexInput = hexInput
            .split("")
            .map((c) => c + c)
            .join("");
        }

        if (!/^[0-9a-fA-F]{6}$/.test(hexInput)) {
          return interaction.reply({
            embeds: [createErrorEmbed("Código hex inválido. Use o formato `#ff0000` ou `ff0000`.", interaction.user)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const colorInt = parseInt(hexInput, 16);
        const r = (colorInt >> 16) & 255;
        const g = (colorInt >> 8) & 255;
        const b = colorInt & 255;

        return interaction.reply({
          embeds: [buildColorEmbed(hexInput, r, g, b, interaction.user)],
        });
      }

      if (sub === "aleatorio") {
        const r = Math.floor(Math.random() * 256);
        const g = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);
        const hexInput = rgbToHex(r, g, b);

        return interaction.reply({
          embeds: [buildColorEmbed(hexInput, r, g, b, interaction.user)],
        });
      }

      if (sub === "rgb") {
        const r = interaction.options.getInteger("r");
        const g = interaction.options.getInteger("g");
        const b = interaction.options.getInteger("b");
        const hexInput = rgbToHex(r, g, b);

        return interaction.reply({
          embeds: [buildColorEmbed(hexInput, r, g, b, interaction.user)],
        });
      }
    } catch (error) {
      logger.error({ err: error, command: "cor" }, "Erro no comando /cor");
      const msg = { content: "❌ Ocorreu um erro ao processar a cor.", flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
      } else {
        await interaction.reply(msg).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
      }
    }
  },
};

function rgbToHex(r, g, b) {
  return [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

function buildColorEmbed(hex, r, g, b, user) {
  const colorInt = parseInt(hex, 16);
  const hexDisplay = `#${hex.toUpperCase()}`;

  // Calcula luminosidade para dizer se é clara ou escura
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const tipo = luminance > 0.5 ? "🔆 Clara" : "🌑 Escura";

  // Nome amigável baseado em faixa de cores
  const nome = getColorName(r, g, b);

  return createEmbed({
    title: `🎨 ${hexDisplay}`,
    description: [
      `**Hex:** \`${hexDisplay}\``,
      `**RGB:** \`rgb(${r}, ${g}, ${b})\``,
      `**Decimal:** \`${colorInt}\``,
      `**Tipo:** ${tipo}`,
      `**Cor Próxima:** ${nome}`,
      "",
      "A cor é mostrada na barra lateral do embed! →",
    ].join("\n"),
    color: colorInt,
    user,
    thumbnail: `https://singlecolorimage.com/get/${hex}/200x200`,
  });
}

function getColorName(r, g, b) {
  const cores = [
    { name: "⬛ Preto", r: 0, g: 0, b: 0 },
    { name: "⬜ Branco", r: 255, g: 255, b: 255 },
    { name: "🔴 Vermelho", r: 255, g: 0, b: 0 },
    { name: "🟢 Verde", r: 0, g: 255, b: 0 },
    { name: "🔵 Azul", r: 0, g: 0, b: 255 },
    { name: "🟡 Amarelo", r: 255, g: 255, b: 0 },
    { name: "🟠 Laranja", r: 255, g: 165, b: 0 },
    { name: "🟣 Roxo", r: 128, g: 0, b: 128 },
    { name: "🩷 Rosa", r: 255, g: 105, b: 180 },
    { name: "🩵 Ciano", r: 0, g: 255, b: 255 },
    { name: "🤎 Marrom", r: 139, g: 69, b: 19 },
    { name: "🩶 Cinza", r: 128, g: 128, b: 128 },
  ];

  let closest = cores[0];
  let minDist = Infinity;

  for (const cor of cores) {
    const dist = Math.sqrt(
      (r - cor.r) ** 2 + (g - cor.g) ** 2 + (b - cor.b) ** 2
    );
    if (dist < minDist) {
      minDist = dist;
      closest = cor;
    }
  }

  return closest.name;
}
