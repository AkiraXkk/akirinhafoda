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

    // 2. SISTEMA DE BOTÕES
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // Filtro Parcerias (Captura parceria_approve, parceria_reject, etc)
      if (customId.includes("partnership_")) {
        const cmd = client.commands.get("partnership");
        if (cmd) return await cmd.handleButton(interaction).catch(() => null);
      }
      
      // Filtro Tickets
      if (customId.startsWith("open_ticket_") || customId.includes("close_ticket")) {
        const cmd = client.commands.get("ticket");
        if (cmd) return await cmd.handleButton(interaction).catch(() => null);
      }

      // Filtro SejaWDA
      if (customId.startsWith("sejawda_")) {
        const cmd = client.commands.get("sejawda");
        if (cmd) return await cmd.handleButton(interaction).catch(() => null);
      }

      // Varredura Geral para outros painéis
      for (const cmd of client.commands.values()) {
        if (typeof cmd.handleButton === "function") {
          try {
            await cmd.handleButton(interaction);
            if (interaction.replied || interaction.deferred) return;
          } catch (e) { continue; }
        }
      }
    }

    // 3. MENUS DE SELEÇÃO
    if (interaction.isAnySelectMenu()) {
      const customId = interaction.customId;

      if (customId.startsWith("sejawda_")) {
        const cmd = client.commands.get("sejawda");
        if (cmd) return await cmd.handleSelectMenu(interaction).catch(() => null);
      }

      for (const cmd of client.commands.values()) {
        if (typeof cmd.handleSelectMenu === "function") {
          try {
            await cmd.handleSelectMenu(interaction);
            if (interaction.replied || interaction.deferred) return;
          } catch (e) { continue; }
        }
      }
    }

    // 4. MODAIS
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;

      if (customId.includes("partnership_modal_")) {
        const cmd = client.commands.get("partnership");
        if (cmd) return await cmd.handleModal(interaction).catch(() => null);
      }

      for (const cmd of client.commands.values()) {
        if (typeof cmd.handleModal === "function") {
          try {
            await cmd.handleModal(interaction);
            if (interaction.replied || interaction.deferred) return;
          } catch (e) { continue; }
        }
      }
    }
  },
};
