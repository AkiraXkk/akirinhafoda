const { Events,
  MessageFlags, } = require("discord.js");
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
        const errorPayload = { content: "Ocorreu um erro ao executar este comando.", flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorPayload).catch(() => {});
        } else {
          await interaction.reply(errorPayload).catch(() => {});
        }
      }
      return;
    }

    // 2. AUTOCOMPLETE
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (error) {
          logger.error({ err: error, command: interaction.commandName }, "Erro no autocomplete");
        }
      }
      return;
    }

    // 3. ROTEAMENTO DE INTERAÇÕES (Botões, Menus e Modais)
    if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
      const customId = interaction.customId;

      // 🛡️ Trava de segurança extra caso o Discord envie uma interação sem ID
      if (!customId) return;

      let commandName = "";

      // Mapeamento específico por tipo
      if (interaction.isButton()) {
        if (customId === "finalizar_painel_recrutamento" || customId.startsWith("close_entrevista_")) {
          commandName = "recrutamento";
        }
      } else if (interaction.isAnySelectMenu()) {
        if (customId === "select_roles_recrutamento") {
          commandName = "recrutamento";
        }
      }

      // ── Mapeamento exaustivo de prefixos ──────────────────────────────
      // Ordem: prefixos mais específicos primeiro, famílias amplas depois,
      // fallback dinâmico por último.

      if (!commandName) {
        // ── Moderação ──
        if (customId.startsWith("mod_appeal_") || customId.startsWith("mod_panel_")) {
          commandName = "mod";
        }
        // ── AutoMod ──
        else if (customId.startsWith("automod_")) {
          commandName = "automod";
        }
        // ── Sejawda (ANTES de ticket para evitar conflito com motivo_fechar_sejawda) ──
        else if (customId.startsWith("sejawda_") || customId === "motivo_fechar_sejawda") {
          commandName = "sejawda";
        }
        // ── Ticket ──
        else if (
          customId.startsWith("setup_") ||
          customId.startsWith("user_open_") ||
          customId.startsWith("user_select_ticket") ||
          customId === "user_open_menu" ||
          customId.startsWith("assumir_ticket_") ||
          customId === "assumir_ticket_btn" ||
          customId.startsWith("close_ticket_") ||
          customId === "close_ticket_btn" ||
          customId.startsWith("delete_ticket_") ||
          customId === "delete_ticket_btn" ||
          customId === "motivo_fechar_ticket"
        ) {
          commandName = "ticket";
        }
        // ── VIP Admin (ANTES de vip para capturar vipadmin_) ──
        else if (customId.startsWith("vipadmin_")) {
          commandName = "vipadmin";
        }
        // ── VIP ──
        else if (customId.startsWith("vip_")) {
          commandName = "vip";
        }
        // ── VIP Buy ──
        else if (customId.startsWith("vipbuy_")) {
          commandName = "vipbuy";
        }
        // ── Avaliação NPS ──
        else if (customId.startsWith("aval_")) {
          commandName = "avaliacao";
        }
        // ── Tellonym (Correio Anônimo) ──
        else if (customId.startsWith("tellonym_")) {
          commandName = "tellonym";
        }
        // ── Duelos ──
        else if (customId.startsWith("duel_")) {
          commandName = "duel";
        }
        // ── Cashier (Banco) ──
        else if (customId.startsWith("cashier_")) {
          commandName = "cashier";
        }
        // ── Avisos ──
        else if (customId.startsWith("avisos_")) {
          commandName = "avisos";
        }
        // ── Eventos (sorteios, drops) ──
        else if (customId.startsWith("evento_")) {
          commandName = "evento";
        }
        // ── Partnership ──
        else if (customId.includes("partnership") || customId.includes("reject_all")) {
          commandName = "partnership";
        }
        // ── Recrutamento ──
        else if (customId.includes("recrutamento") || customId.startsWith("fechar_salas_entrevista") || customId.startsWith("finalizar_painel_") || customId.startsWith("close_entrevista_")) {
          commandName = "recrutamento";
        }
        // ── Design ──
        else if (customId.includes("design")) {
          commandName = "design";
        }
        // ── Family ──
        else if (customId.startsWith("family_")) {
          commandName = "family";
        }
        // ── Fun (jogos casuais) ──
        else if (customId.startsWith("fun_")) {
          commandName = "fun";
        }
        // ── Leaderboard ──
        else if (customId.startsWith("leaderboard_")) {
          commandName = "leaderboard";
        }
        // ── Level Admin ──
        else if (customId.startsWith("leveladmin_")) {
          commandName = "leveladmin";
        }
        // ── Reset Config ──
        else if (customId.startsWith("resetconfig_")) {
          commandName = "resetconfig";
        }
        // ── Shop ──
        else if (customId.startsWith("shop_")) {
          commandName = "shop";
        }
        // ── Social ──
        else if (customId.startsWith("social_")) {
          commandName = "social";
        }
        // ── Boost ──
        else if (customId.startsWith("boost_")) {
          commandName = "boost";
        }
        // ── Dama ──
        else if (customId.startsWith("dama_")) {
          commandName = "dama";
        }
        // ── Fallback dinâmico ──
        else {
          commandName = customId.split(/_|-|:/)[0];
        }
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
        // Exceção para vipadmin
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
          // Resposta de fallback para não deixar a interação sem resposta
          const errPayload = { content: "❌ Ocorreu um erro ao processar esta interação.", flags: MessageFlags.Ephemeral };
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errPayload).catch(() => {});
          } else {
            await interaction.reply(errPayload).catch(() => {});
          }
        }
      } else {
        logger.debug({ commandName, handlerName }, "Handler não encontrado no comando");
      }
    }
  },
};
