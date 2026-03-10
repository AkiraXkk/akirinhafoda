const { Events } = require("discord.js");
const { logger } = require("../logger");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {

    // 1. COMANDOS SLASH
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        logger.warn({ commandName: interaction.commandName }, "Comando slash não encontrado");
        return;
      }
      try {
        await command.execute(interaction);
      } catch (error) {
        logger.error({ err: error, command: interaction.commandName }, "Erro no comando slash");
        const errorPayload = { content: "Ocorreu um erro ao executar este comando.", ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorPayload).catch(() => {});
        } else {
          await interaction.reply(errorPayload).catch(() => {});
        }
      }
      return;
    }

    // 2. ROTEAMENTO DE INTERAÇÕES (Botões, Menus e Modais)
    if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
      const customId = interaction.customId;
      let commandName = "";

      // Descobre qual comando deve cuidar desta interação pelas suas exceções originais
      if (customId.includes("partnership")) {
        commandName = "partnership"; 
      } else if (
        customId.includes("ticket") || 
        customId.startsWith("open_") || 
        customId.startsWith("close_") || 
        customId.startsWith("setup_") ||     // <-- ADICIONADO PARA O TICKET
        customId.startsWith("user_") ||      // <-- ADICIONADO PARA O TICKET
        customId.startsWith("assumir_") ||   // <-- ADICIONADO PARA O TICKET
        customId.startsWith("delete_")       // <-- ADICIONADO PARA O TICKET
      ) {
        commandName = "ticket";
      } else if (customId.includes("sejawda")) {
        commandName = "sejawda";
      } else if (customId.includes("design")) {
        commandName = "design";
      } else if (customId.includes("recrutamento")) {
        commandName = "recrutamento";
      } else {
        // Roteador Dinâmico original
        commandName = customId.split(/_|-|:/)[0];
      }

      const command = client.commands.get(commandName);
      if (!command) {
        logger.debug({ commandName, customId }, "Comando de interação não encontrado");
        return;
      }

      // Define qual função disparar dentro do arquivo do comando
      let handlerName = "";

      // MÁGICA: Se for o Ticket, joga TUDO (Botões e Menus) para o handleButton
      if (commandName === "ticket") {
        handlerName = "handleButton";
      } 
      // Lógica original para os outros comandos:
      else if (interaction.isButton()) {
        handlerName = "handleButton";
        // Exceção do Claude para vipadmin
        if (commandName === "vipadmin" && (customId.startsWith("vipadmin_tier_section:") || customId.startsWith("vipadmin_cotas:"))) {
          handlerName = "handleButtonSecondary";
        }
      } 
      else if (interaction.isModalSubmit()) {
        handlerName = "handleModal";
      } 
      else if (interaction.isAnySelectMenu()) {
        if (interaction.isRoleSelectMenu() && typeof command.handleRoleSelectMenu === "function") {
          handlerName = "handleRoleSelectMenu";
        } else if (interaction.isUserSelectMenu() && typeof command.handleUserSelectMenu === "function") {
          handlerName = "handleUserSelectMenu";
        } else {
          // Fallback
          handlerName = "handleSelectMenu";
        }
      }

      // Executa o handler dinamicamente
      if (typeof command[handlerName] === "function") {
        try {
          return await command[handlerName](interaction);
        } catch (e) {
          // Se der erro 10062 (Unknown Interaction), o Discord demorou a responder
          if (e.code === 10062) return;
          logger.error({ err: e, handler: handlerName, command: commandName }, "Erro no handler de interação");
        }
      } else {
        logger.debug({ commandName, handlerName }, "Handler não encontrado no comando");
      }
    }
  },
};