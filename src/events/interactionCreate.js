const { Events } = require("discord.js");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    
    // 1. COMANDOS SLASH
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Erro no comando /${interaction.commandName}:`, error);
      }
      return;
    }

    // 2. ROTEAMENTO DE INTERAÇÕES (Botões, Menus e Modais)
    if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
      const customId = interaction.customId;
      let commandName = "";

      // Descobre qual comando deve cuidar desta interação pelo prefixo do ID
      if (customId.includes("partnership")) {
        commandName = "partnership";
      } else if (customId.includes("ticket") || customId.includes("open_") || customId.includes("close_")) {
        commandName = "ticket";
      } else if (customId.includes("sejawda")) {
        commandName = "sejawda";
      } else {
        // Para os outros 34 comandos, tenta pegar a primeira palavra antes do "_"
        commandName = customId.split("_")[0];
      }

      const command = client.commands.get(commandName);
      if (!command) return;

      // Define qual função disparar dentro do arquivo do comando
      const handlerName = interaction.isButton() ? "handleButton" : 
                          interaction.isAnySelectMenu() ? "handleSelectMenu" : 
                          "handleModal";

      if (typeof command[handlerName] === "function") {
        try {
          return await command[handlerName](interaction);
        } catch (e) {
          // Se der erro 10062 (Unknown Interaction), o Discord demorou a responder
          if (e.code === 10062) return;
          console.error(`Erro no ${handlerName} do comando ${commandName}:`, e);
        }
      }
    }
  },
};
