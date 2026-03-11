const { SlashCommandBuilder } = require("discord.js");
const { createEmbed } = require("../embeds");
const { logger } = require("../logger");

// Definições de interações com GIFs temáticos (URLs públicas genéricas)
const INTERACOES = {
  abracar: {
    emoji: "🤗",
    label: "Abraçar",
    selfAction: "se abraçou... estranho, mas ok! 🤷",
    action: "deu um abraço apertado em",
    color: 0xff9ff3,
    gifs: [
      "https://media.tenor.com/OXCV_qL-V60AAAAC/hug-anime-hug.gif",
      "https://media.tenor.com/9e1aE-xMCdQAAAAC/anime-hug.gif",
      "https://media.tenor.com/b3XfLnAxRNIAAAAC/hug-anime.gif",
    ],
  },
  cafune: {
    emoji: "💆",
    label: "Cafuné",
    selfAction: "fez cafuné em si mesmo... tudo bem!",
    action: "está fazendo cafuné em",
    color: 0xffeaa7,
    gifs: [
      "https://media.tenor.com/MzMXaJiBeJgAAAAC/anime-pat.gif",
      "https://media.tenor.com/3lp_CtqxN3cAAAAC/anime-pat-anime-pat-head.gif",
      "https://media.tenor.com/N0aAz9Lpe4cAAAAC/head-pat.gif",
    ],
  },
  tapa: {
    emoji: "👋",
    label: "Tapa",
    selfAction: "deu um tapa em si mesmo... precisava? 😂",
    action: "deu um tapa em",
    color: 0xe74c3c,
    gifs: [
      "https://media.tenor.com/Ws6Dm1ZW_vMAAAAC/anime-slap.gif",
      "https://media.tenor.com/-WpSoFgkjK0AAAAC/anime-slap.gif",
      "https://media.tenor.com/mMsVnECihVAAAAAC/slap-anime.gif",
    ],
  },
  highfive: {
    emoji: "🖐️",
    label: "High Five",
    selfAction: "deu um high five no ar! ✋",
    action: "deu um high five em",
    color: 0x3498db,
    gifs: [
      "https://media.tenor.com/bk9JQbAMOGQAAAAC/anime-high-five.gif",
      "https://media.tenor.com/OEtj6KJnuLEAAAAC/high-five.gif",
      "https://media.tenor.com/JBBM1_-G7JQAAAAC/anime-high-five.gif",
    ],
  },
  beijar: {
    emoji: "💋",
    label: "Beijar",
    selfAction: "tentou se beijar... sem comentários! 🫣",
    action: "deu um beijo em",
    color: 0xe84393,
    gifs: [
      "https://media.tenor.com/YhMHACaKo-QAAAAC/anime-kiss.gif",
      "https://media.tenor.com/uncTXYF6m3EAAAAC/anime-kiss.gif",
      "https://media.tenor.com/2vRq-Dj5s4YAAAAC/kiss-anime.gif",
    ],
  },
  danca: {
    emoji: "💃",
    label: "Dançar",
    selfAction: "está dançando sozinho! 🕺",
    action: "puxou para dançar",
    color: 0x6c5ce7,
    gifs: [
      "https://media.tenor.com/WJlI45stMOoAAAAC/anime-dance.gif",
      "https://media.tenor.com/LBMfH9RIPSYAAAAC/anime-dance.gif",
      "https://media.tenor.com/SmmuL-NrYc8AAAAC/anime-dance.gif",
    ],
  },
  poke: {
    emoji: "👉",
    label: "Cutucar",
    selfAction: "cutucou a si mesmo... ok! 🤔",
    action: "cutucou",
    color: 0xfdcb6e,
    gifs: [
      "https://media.tenor.com/q0vEsMT5NyYAAAAC/anime-poke.gif",
      "https://media.tenor.com/aDvBhJJT-RIAAAAC/anime-poke.gif",
      "https://media.tenor.com/1-kG-p_4cEQAAAAC/poke-anime.gif",
    ],
  },
  chorar: {
    emoji: "😭",
    label: "Chorar",
    selfAction: "está chorando... alguém ajude! 😢",
    action: "está chorando no ombro de",
    color: 0x74b9ff,
    gifs: [
      "https://media.tenor.com/g5l96Hkfb-AAAAAC/anime-cry.gif",
      "https://media.tenor.com/WpMwmu3gI0AAAAAC/anime-crying.gif",
      "https://media.tenor.com/Y-jnQmV6HWEAAAAC/anime-cry.gif",
    ],
  },
};

const builder = new SlashCommandBuilder()
  .setName("interacao")
  .setDescription("Interações sociais divertidas com outros membros");

// Registra cada interação como subcommand
for (const [key, data] of Object.entries(INTERACOES)) {
  builder.addSubcommand((sub) =>
    sub
      .setName(key)
      .setDescription(`${data.emoji} ${data.label} alguém no servidor`)
      .addUserOption((opt) =>
        opt.setName("membro").setDescription("Quem será o alvo da interação").setRequired(true)
      )
  );
}

module.exports = {
  data: builder,

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();
      const target = interaction.options.getUser("membro");
      const interacaoData = INTERACOES[sub];

      if (!interacaoData) {
        return interaction.reply({ content: "❌ Interação não encontrada.", ephemeral: true });
      }

      const isSelf = target.id === interaction.user.id;
      const gif = interacaoData.gifs[Math.floor(Math.random() * interacaoData.gifs.length)];

      const description = isSelf
        ? `${interacaoData.emoji} **${interaction.user.username}** ${interacaoData.selfAction}`
        : `${interacaoData.emoji} **${interaction.user.username}** ${interacaoData.action} **${target.username}**!`;

      const embed = createEmbed({
        description,
        color: interacaoData.color,
        image: gif,
        footer: `${interacaoData.emoji} ${interacaoData.label}`,
        timestamp: true,
      });

      await interaction.reply({
        content: isSelf ? undefined : `${target}`,
        embeds: [embed],
        allowedMentions: { users: [target.id] },
      });
    } catch (error) {
      logger.error({ err: error, command: "interacao" }, "Erro no comando /interacao");
      const msg = { content: "❌ Ocorreu um erro na interação.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
  },
};
