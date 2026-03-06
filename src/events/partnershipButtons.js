const { Events } = require("discord.js");
const { createDataStore } = require("../store/dataStore");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

const partnersStore = createDataStore("partners.json");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;

    if (customId.startsWith("confirm_reject_all_")) {
      const userId = customId.replace("confirm_reject_all_", "");

      if (interaction.user.id !== userId) {
        return interaction.reply({
          embeds: [createErrorEmbed("Você não pode usar este botão!")],
          ephemeral: true
        });
      }

      const partners = await partnersStore.load();
      const pendingPartnerships = Object.entries(partners).filter(([key, p]) => p.status === "pending");

      if (pendingPartnerships.length === 0) {
        return interaction.update({
          embeds: [createErrorEmbed("Não há solicitações pendentes!")],
          components: []
        });
      }

      const reasonMatch = interaction.message.embeds[0].description.match(/\*\*Motivo:\*\s*(.+)/);
      const motivo = reasonMatch ? reasonMatch[1] : "Recusa em massa";

      const rejectPromises = pendingPartnerships.map(async ([requestId]) => {
        await partnersStore.update(requestId, (current) => ({
          ...current,
          status: "rejected",
          processedBy: userId, // Alinhado com o partnership.js
          rejectionReason: motivo,
          rejectedAt: new Date().toISOString()
        }));
      });

      await Promise.all(rejectPromises);

      return interaction.update({
        embeds: [createSuccessEmbed(`✅ **Recusa em Massa Concluída!**\nTotal: ${pendingPartnerships.length} solicitações.\nMotivo: ${motivo}`)],
        components: []
      });
    }

    if (customId.startsWith("cancel_reject_all_")) {
      const userId = customId.replace("cancel_reject_all_", "");
      if (interaction.user.id !== userId) return interaction.reply({ content: "Botão bloqueado.", ephemeral: true });

      return interaction.update({
        embeds: [createErrorEmbed("Ação cancelada. Nenhuma solicitação foi alterada.")],
        components: []
      });
    }
  }
};