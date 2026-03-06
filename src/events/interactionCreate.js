module.exports = {
  name: "interactionCreate",
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Falha no comando /${interaction.commandName}:`, error);
        const msg = { content: "Ocorreu um problema ao processar este comando.", ephemeral: true };
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => null);
        } else {
          await interaction.reply(msg).catch(() => null);
        }
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith("partnership_")) {
        const partnershipCmd = client.commands.get("partnership");
        
        if (partnershipCmd && typeof partnershipCmd.handleButton === "function") {
          try {
            await partnershipCmd.handleButton(interaction);
          } catch (error) {
            console.error("Falha ao lidar com botao de parceria:", error);
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({ content: "Nao foi possivel concluir a acao do botao.", ephemeral: true }).catch(() => null);
            }
          }
        }
      }
    }
  }
};
