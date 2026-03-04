const { SlashCommandBuilder } = require("discord.js");
const { createEmbed } = require("../embeds");

const EMOJI_NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("enquete")
    .setDescription("Cria uma enquete com opções para votação")
    .addStringOption((opt) =>
      opt.setName("pergunta").setDescription("Pergunta da enquete").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("opcao1").setDescription("Primeira opção").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("opcao2").setDescription("Segunda opção").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("opcao3").setDescription("Terceira opção (opcional)").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("opcao4").setDescription("Quarta opção (opcional)").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("opcao5").setDescription("Quinta opção (opcional)").setRequired(false)
    ),

  async execute(interaction) {
    const pergunta = interaction.options.getString("pergunta");
    const opcoes = [];

    for (let i = 1; i <= 5; i++) {
      const valor = interaction.options.getString(`opcao${i}`);
      if (valor) opcoes.push(valor);
    }

    const descricao = opcoes
      .map((opcao, i) => `${EMOJI_NUMBERS[i]} ${opcao}`)
      .join("\n\n");

    const embed = createEmbed({
      title: `📊 ${pergunta}`,
      description: descricao,
      color: 0x3498DB,
      footer: { text: `Enquete criada por ${interaction.user.tag} • Reaja para votar!` },
    });

    await interaction.reply({ embeds: [embed] });
    const msg = await interaction.fetchReply();

    for (let i = 0; i < opcoes.length; i++) {
      await msg.react(EMOJI_NUMBERS[i]);
    }
  },
};
