const { Events } = require("discord.js");
const { createDataStore } = require("../store/dataStore");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

const partnersStore = createDataStore("partners.json");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    
    // Handler para recusar todas as parcerias
    if (customId.startsWith("confirm_reject_all_")) {
      const userId = customId.replace("confirm_reject_all_", "");
      
      // Verificar se é o mesmo usuário
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
          embeds: [createErrorEmbed("Não há solicitações pendentes para recusar!")],
          components: []
        });
      }

      // Recusar todas as solicitações pendentes
      const rejectPromises = pendingPartnerships.map(async ([requestId, partnership]) => {
        await partnersStore.update(requestId, (current) => ({
          ...current,
          status: "rejected",
          rejectedAt: new Date().toISOString(),
          rejectedBy: userId,
          rejectionReason: "Recusa em massa: " + (interaction.message.embeds[0].description.match(/\*\*Motivo:\*\s*(.+)/)?.[1] || "Motivo não especificado")
        }));
      });

      await Promise.all(rejectPromises);

      const successEmbed = createSuccessEmbed(
        `✅ **Recusa em Massa Concluída!**\n\n` +
        `**Total Recusado:** ${pendingPartnerships.length} solicitação(ões)\n` +
        `**Motivo:** ${interaction.message.embeds[0].description.match(/\*\*Motivo:\*\s*(.+)/)?.[1] || "Motivo não especificado"}\n\n` +
        `Todas as solicitações pendentes foram recusadas com sucesso!`
      );

      return interaction.update({
        embeds: [successEmbed],
        components: []
      });
    }

    // Handler para cancelar recusa em massa
    if (customId.startsWith("cancel_reject_all_")) {
      const userId = customId.replace("cancel_reject_all_", "");
      
      // Verificar se é o mesmo usuário
      if (interaction.user.id !== userId) {
        return interaction.reply({
          embeds: [createErrorEmbed("Você não pode usar este botão!")],
          ephemeral: true
        });
      }

      const cancelEmbed = createEmbed({
        title: "❌ Ação Cancelada",
        description: "A recusa em massa foi cancelada. Nenhuma solicitação foi alterada.",
        color: 0xff6600,
        footer: { text: "WDA - Todos os direitos reservados" }
      });

      return interaction.update({
        embeds: [cancelEmbed],
        components: []
      });
    }
  }
};
