const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createEmbed } = require("../embeds");

/**
 * Envia uma DM de avaliação NPS (1-5 estrelas) ao usuário que foi atendido.
 *
 * @param {import("discord.js").User} user     - Usuário que receberá a DM (quem foi atendido)
 * @param {string}                   staffId  - ID do Discord do membro da staff que realizou o atendimento
 * @param {string}                   guildId  - ID do servidor onde ocorreu o atendimento
 */
async function enviarAvaliacaoDM(user, staffId, guildId) {
  const embed = createEmbed({
    title: "⭐ Como foi seu atendimento?",
    description:
      "Obrigado por entrar em contato!\n\n" +
      "Por favor, avalie o atendimento que você recebeu clicando em uma das estrelas abaixo.\n" +
      "Sua opinião nos ajuda a melhorar continuamente! 💛",
    color: 0xf1c40f,
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aval_staff_1_${staffId}_${guildId}`)
      .setLabel("⭐ 1")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`aval_staff_2_${staffId}_${guildId}`)
      .setLabel("⭐⭐ 2")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`aval_staff_3_${staffId}_${guildId}`)
      .setLabel("⭐⭐⭐ 3")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`aval_staff_4_${staffId}_${guildId}`)
      .setLabel("⭐⭐⭐⭐ 4")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`aval_staff_5_${staffId}_${guildId}`)
      .setLabel("⭐⭐⭐⭐⭐ 5")
      .setStyle(ButtonStyle.Success),
  );

  await user.send({ embeds: [embed], components: [row] });
}

module.exports = { enviarAvaliacaoDM };
