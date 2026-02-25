const { Events } = require("discord.js");
const { logger } = require("../logger");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    // Button Handler
    if (interaction.isButton()) {
        const commands = client.commands.values();
        for (const command of commands) {
            if (typeof command.handleButton === "function") {
                try {
                    await command.handleButton(interaction);
                    if (interaction.replied || interaction.deferred) return;
                } catch (error) {
                    logger.error({ err: error, command: command.data.name }, "Erro ao processar botão");
                }
            }
        }
        return;
    }

    // Modal Submit Handler
    if (interaction.isModalSubmit()) {
        const commands = client.commands.values();
        for (const command of commands) {
            if (typeof command.handleModal === "function") {
                try {
                    await command.handleModal(interaction);
                    if (interaction.replied || interaction.deferred) return;
                } catch (error) {
                    logger.error({ err: error, command: command.data.name }, "Erro ao processar modal");
                }
            }
        }
        return;
    }

    // Select Menu Handler (String, User, Role, Channel, Mentionable)
    if (interaction.isAnySelectMenu()) {
        const commands = client.commands.values();
        for (const command of commands) {
            if (typeof command.handleSelectMenu === "function") {
                try {
                    await command.handleSelectMenu(interaction);
                    if (interaction.replied || interaction.deferred) return;
                } catch (error) {
                    logger.error({ err: error, command: command.data.name }, "Erro ao processar menu de seleção");
                }
            }
        }
        return;
    }
    
    // Autocomplete Handler
    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command || !command.autocomplete) return;
        try {
            await command.autocomplete(interaction);
        } catch (error) {
            logger.error({ err: error, command: interaction.commandName }, "Erro no Autocomplete");
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error({ err: error, command: interaction.commandName }, "Erro ao executar comando");

      const payload = { content: "Ocorreu um erro ao executar esse comando.", ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
