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
      } else if (customId.includes("ticket") || customId.includes("open_") || customId.includes("close_")) {
        commandName = "ticket";
      } else if (customId.includes("sejawda")) {
        commandName = "sejawda";
      } else {
        // Roteador Dinâmico: Corta pelo "_", "-" ou ":" para achar o nome do comando base.
        // Ex: "vipadmin_dash:..." vira "vipadmin" | "dama_cfg:..." vira "dama" | "family_invite..." vira "family"
        commandName = customId.split(/_|-|:/)[0];
      }

      const command = client.commands.get(commandName);
      if (!command) {
        logger.debug({ commandName, customId }, "Comando de interação não encontrado");
        return;
      }

      // Define qual função disparar dentro do arquivo do comando
      let handlerName = "";

      if (interaction.isButton()) {
        handlerName = "handleButton";
        // Exceção adicionada pelo Claude: o vipadmin tem botões secundários para seções de tier e cotas
        if (commandName === "vipadmin" && (customId.startsWith("vipadmin_tier_section:") || customId.startsWith("vipadmin_cotas:"))) {
          handlerName = "handleButtonSecondary";
        }
      } 
      else if (interaction.isModalSubmit()) {
        handlerName = "handleModal";
      } 
      else if (interaction.isAnySelectMenu()) {
        // O Claude separou menus específicos para "Cargos" e "Usuários" (usados no /dama e /family)
        if (interaction.isRoleSelectMenu() && typeof command.handleRoleSelectMenu === "function") {
          handlerName = "handleRoleSelectMenu";
        } else if (interaction.isUserSelectMenu() && typeof command.handleUserSelectMenu === "function") {
          handlerName = "handleUserSelectMenu";
        } else {
          // Fallback para Menus de Texto normais (como os do /shop e /vip)
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