const { SlashCommandBuilder } = require("discord.js");
const { createEmbed } = require("../embeds");

module.exports = {
  data: new SlashCommandBuilder().setName("vipbonus").setDescription("Exemplo de comando exclusivo para VIPs"),
  async execute(interaction) {
    const vip = interaction.client.services?.vip;
    const isVip = vip?.isVip?.({ userId: interaction.user.id, member: interaction.member });

    if (!isVip) {
      await interaction.reply({ content: "Esse comando é exclusivo para VIPs.", ephemeral: true });
      return;
    }

    const embed = createEmbed({
      title: "VIP Bonus",
      description: "Você tem acesso a comandos VIP. Podemos colocar benefícios aqui.",
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
