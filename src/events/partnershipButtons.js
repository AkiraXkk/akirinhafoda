const { Events } = require("discord.js");
const { createDataStore } = require("../store/dataStore");

const partnersStore = createDataStore("partners.json");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.customId.includes("reject_all")) return;

    const action = interaction.customId.split("_")[0];

    if (action === "cancel") {
      return interaction.update({ content: "Acao de recusa em massa cancelada.", components: [], embeds: [] }).catch(() => null);
    }

    if (action === "confirm") {
      try {
        const partners = await partnersStore.load();
        let count = 0;

        for (const id in partners) {
          if (partners[id].status === "pending") {
            partners[id].status = "rejected";
            partners[id].processedBy = interaction.user.id;
            count++;
          }
        }

        if (count > 0) {
          await partnersStore.save(partners);
          return interaction.update({ content: `Foram recusadas ${count} solicitacoes pendentes.`, components: [], embeds: [] }).catch(() => null);
        } else {
          return interaction.update({ content: "Nao havia solicitacoes pendentes para recusar.", components: [], embeds: [] }).catch(() => null);
        }
      } catch (error) {
        console.error("Erro ao recusar tudo:", error.message);
        return interaction.reply({ content: "Erro ao processar a recusa em massa.", ephemeral: true }).catch(() => null);
      }
    }
  }
};