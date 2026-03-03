const { Events } = require("discord.js");
const { logger } = require("../logger");
const { getGuildConfig } = require("../config/guildConfig");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    // Função auxiliar para extrair prefixo do customId
    function getCommandPrefix(customId) {
      const parts = customId.split('_');
      return parts[0]; // Pega a primeira parte antes do underscore
    }

    // Função auxiliar para encontrar e executar handler
    async function executeHandler(interaction, handlerType, commandName = null) {
      const customId = interaction.customId;
      const prefix = commandName || getCommandPrefix(customId);
      
      // Tenta encontrar pelo prefixo específico
      if (prefix && client.commands.has(prefix)) {
        const command = client.commands.get(prefix);
        const handlerMethod = `handle${handlerType}`;
        
        if (typeof command[handlerMethod] === "function") {
          try {
            await command[handlerMethod](interaction);
            return true;
          } catch (error) {
            // Ignorar erros de interação desconhecida (timeout/expired)
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
              logger.debug({ 
                customId, 
                error: error.message 
              }, "Interação expirada ou desconhecida - ignorando");
              return true;
            }
            
            logger.error({ 
              err: error, 
              command: prefix, 
              customId, 
              handlerType 
            }, `Erro ao processar ${handlerType}`);
            return true;
          }
        }
      }
      
      // Tenta handler genérico handleInteraction
      if (prefix && client.commands.has(prefix)) {
        const command = client.commands.get(prefix);
        if (typeof command.handleInteraction === "function") {
          try {
            await command.handleInteraction(interaction);
            return true;
          } catch (error) {
            // Ignorar erros de interação desconhecida (timeout/expired)
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
              logger.debug({ 
                customId, 
                error: error.message 
              }, "Interação expirada ou desconhecida - ignorando");
              return true;
            }
            
            logger.error({ 
              err: error, 
              command: prefix, 
              customId,
              handlerType: "handleInteraction" 
            }, "Erro ao processar interação genérica");
            return true;
          }
        }
      }
      
      return false;
    }

    // Button Handler
    if (interaction.isButton()) {
      const handled = await executeHandler(interaction, "Button");
      
      if (!handled) {
        // Fallback: tenta em todos os comandos
        for (const [commandName, command] of client.commands) {
          if (typeof command.handleButton === "function") {
            try {
              await command.handleButton(interaction);
              if (interaction.replied || interaction.deferred) break;
            } catch (error) {
              // Ignorar erros de interação desconhecida (timeout/expired)
              if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                logger.debug({ 
                  customId: interaction.customId,
                  error: error.message 
                }, "Interação de botão expirada ou desconhecida - ignorando");
                continue;
              }
              
              logger.error({ 
                err: error, 
                command: commandName, 
                customId: interaction.customId 
              }, "Erro ao processar botão (fallback)");
            }
          }
        }
      }
      return;
    }

    // Modal Submit Handler
    if (interaction.isModalSubmit()) {
      const handled = await executeHandler(interaction, "Modal");
      
      if (!handled) {
        // Fallback
        for (const [commandName, command] of client.commands) {
          if (typeof command.handleModal === "function") {
            try {
              await command.handleModal(interaction);
              if (interaction.replied || interaction.deferred) break;
            } catch (error) {
              // Ignorar erros de interação desconhecida (timeout/expired)
              if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                logger.debug({ 
                  customId: interaction.customId,
                  error: error.message 
                }, "Interação de modal expirada ou desconhecida - ignorando");
                continue;
              }
              
              logger.error({ 
                err: error, 
                command: commandName, 
                customId: interaction.customId 
              }, "Erro ao processar modal (fallback)");
            }
          }
        }
      }
      return;
    }

    // Select Menu Handler (String, User, Role, Channel, Mentionable)
    if (interaction.isAnySelectMenu()) {
      const handled = await executeHandler(interaction, "SelectMenu");
      
      if (!handled) {
        // Fallback
        for (const [commandName, command] of client.commands) {
          if (typeof command.handleSelectMenu === "function") {
            try {
              await command.handleSelectMenu(interaction);
              if (interaction.replied || interaction.deferred) break;
            } catch (error) {
              // Ignorar erros de interação desconhecida (timeout/expired)
              if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                logger.debug({ 
                  customId: interaction.customId,
                  error: error.message 
                }, "Interação de menu expirada ou desconhecida - ignorando");
                continue;
              }
              
              logger.error({ 
                err: error, 
                command: commandName, 
                customId: interaction.customId 
              }, "Erro ao processar menu de seleção (fallback)");
            }
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
      if (interaction.guild) {
        const guildConfig = await getGuildConfig(interaction.guild.id);
        const bypassRoles = guildConfig.commandBypassRoleIds || [];
        const hasBypass =
          bypassRoles.length > 0 &&
          interaction.member?.roles?.cache?.some((r) => bypassRoles.includes(r.id));

        if (!hasBypass) {
          const nome = interaction.commandName;
          const canalId = interaction.channelId;

          if (nome === "fun") {
            const permitidos = guildConfig.allowedFunChannels || [];
            if (permitidos.length > 0 && !permitidos.includes(canalId)) {
              return interaction.reply({
                content: "Este comando só pode ser usado nos canais de diversão configurados.",
                ephemeral: true,
              });
            }
          }

          if (nome === "utility") {
            const permitidos = guildConfig.allowedUtilityChannels || [];
            if (permitidos.length > 0 && !permitidos.includes(canalId)) {
              return interaction.reply({
                content: "Este comando só pode ser usado nos canais de utilidade configurados.",
                ephemeral: true,
              });
            }
          }
        }
      }

      await command.execute(interaction);
    } catch (error) {
      // Ignorar erros de interação desconhecida (timeout/expired)
      if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
        logger.debug({ 
          commandName: interaction.commandName,
          customId: interaction.customId,
          error: error.message 
        }, "Interação desconhecida - ignorando");
        return;
      }
      
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
