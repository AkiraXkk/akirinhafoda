const { SlashCommandBuilder } = require("discord.js");
const { createEmbed } = require("../embeds");

module.exports = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Mostra a latência do bot"),
  async execute(interaction) {
    await interaction.deferReply();

    const wsPing = interaction.client.ws.ping;
    const roundtrip = Date.now() - interaction.createdTimestamp;

    const embed = createEmbed({
      title: "Pong",
      fields: [
        { name: "WebSocket", value: `${wsPing}ms`, inline: true },
        { name: "Roundtrip", value: `${roundtrip}ms`, inline: true },
      ],
    });

    await interaction.editReply({ embeds: [embed] });
  },
};
