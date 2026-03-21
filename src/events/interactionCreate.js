const { Events, MessageFlags } = require("discord.js");
const { logger } = require("../logger");

const FOOTER_SUFFIX = "© WDA - Todos os direitos reservados";

const COMMAND_SECTION_MAP = {
  shop: "Loja",
  shopadmin: "Loja",
  economy: "Economia",
  cashier: "Economia",
  bicho: "Economia",
  blackjack: "Economia",
  roleta: "Economia",
  duel: "Economia",
  devil: "Economia",
  vip: "VIP System",
  vipbuy: "VIP System",
  vipadmin: "VIP System",
  leaderboard: "Rank",
  levels: "Rank",
  leveladmin: "Rank",
  mod: "Moderação",
  moderation: "Moderação",
  automod: "Moderação",
  ticket: "Suporte",
  sejawda: "Suporte",
  avisos: "Moderação",
  verify: "Moderação",
  welcome: "Moderação",
  recrutamento: "Recrutamento",
  diretoria: "Diretoria",
  ajuda: "Utilitários",
  utility: "Utilitários",
  ping: "Utilitários",
  afk: "Utilitários",
  lembrete: "Utilitários",
  social: "Social",
  interacao: "Social",
  fun: "Social",
  invites: "Utilitários",
  evento: "Eventos",
  eventos: "Eventos",
};

function getFooterText(section) {
  return `${section} | ${FOOTER_SUFFIX}`;
}

function inferSectionFromCustomId(customId) {
  const id = String(customId || "");
  if (id.startsWith("vip_") || id.startsWith("vipadmin_")) return "VIP System";
  if (id.startsWith("shop_") || id.startsWith("cashier_") || id.startsWith("leaderboard_") || id.startsWith("bj_") || id.startsWith("duel_")) return "Economia";
  if (id.startsWith("mod_") || id.startsWith("automod_") || id.startsWith("ticket_") || id.startsWith("sejawda_") || id.startsWith("close_ticket_")) return "Moderação";
  if (id.startsWith("help_") || id.startsWith("select_helparea")) return "Utilitários";
  if (id.startsWith("evento_")) return "Eventos";
  return "GERAL";
}

function resolveSection(interaction, commandName) {
  const fromCommand = COMMAND_SECTION_MAP[String(commandName || "").toLowerCase()];
  if (fromCommand) return fromCommand;
  if (interaction?.isChatInputCommand?.()) {
    const fromSlash = COMMAND_SECTION_MAP[String(interaction.commandName || "").toLowerCase()];
    if (fromSlash) return fromSlash;
  }
  return inferSectionFromCustomId(interaction?.customId);
}

function applyFooter(payload, section) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.embeds) || payload.embeds.length === 0) return payload;
  const footer = { text: getFooterText(section || "GERAL") };
  payload.embeds = payload.embeds.map((embed) => {
    if (!embed) return embed;
    if (typeof embed.setFooter === "function") {
      embed.setFooter(footer);
      return embed;
    }
    if (typeof embed === "object") {
      return { ...embed, footer };
    }
    return embed;
  });
  return payload;
}

function patchInteractionResponses(interaction, commandName) {
  if (!interaction || interaction.__wdaFooterPatched) return;
  interaction.__wdaFooterPatched = true;
  const methods = ["reply", "editReply", "followUp", "update"];
  const section = resolveSection(interaction, commandName);

  for (const method of methods) {
    if (typeof interaction[method] !== "function") continue;
    const original = interaction[method].bind(interaction);
    interaction[method] = async (...args) => {
      if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
        args[0] = applyFooter(args[0], section);
      }
      return original(...args);
    };
  }
}

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
        patchInteractionResponses(interaction, interaction.commandName);
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
        // ── Diretoria / Alta Cúpula (SISTEMA NOVO) ──
        else if (customId.startsWith("cupula_")) {
          commandName = "diretoria";
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
        // ── Fun (jogos casuais) ──
        else if (customId.startsWith("fun_")) {
          commandName = "fun";
        }
        // ── Blackjack ──
        else if (customId.startsWith("bj_")) {
          commandName = "blackjack";
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
        // ── TempCall ──
        else if (customId.startsWith("tempcall_")) {
          commandName = "tempcall";
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
      patchInteractionResponses(interaction, commandName);

      // Define qual função disparar dentro do arquivo do comando
      let handlerName = "";

      // Lógica de detecção automática (sem força-bruta para ticket)
      // A ordem importa: tipos específicos primeiro
      if (interaction.isButton()) {
        handlerName = "handleButton";
      } else if (interaction.isModalSubmit()) {
        handlerName = "handleModal";
      } else if (interaction.isAnySelectMenu()) {
        if (interaction.isRoleSelectMenu() && typeof command.handleRoleSelectMenu === "function") {
          handlerName = "handleRoleSelectMenu";
        } else if (interaction.isUserSelectMenu() && typeof command.handleUserSelectMenu === "function") {
          handlerName = "handleUserSelectMenu";
        } else {
          handlerName = "handleSelectMenu";
        }
      }

      // 🛡️ Validação extra: se não encontrou handler, logar e retornar
      if (!handlerName) {
        logger.warn({ commandName, customId: interaction.customId }, "Nenhum handler detectado para interação");
        return;
      }

      // Executa o handler dinamicamente
      if (typeof command[handlerName] === "function") {
        try {
          logger.debug({ commandName, handlerName, customId: interaction.customId }, "Executando handler de interação");
          return await command[handlerName](interaction);
        } catch (e) {
          // Se der erro 10062 (Unknown Interaction), o Discord demorou a responder
          if (e.code === 10062) {
            logger.debug({ commandName, customId: interaction.customId }, "Erro 10062: Interação expirada no Discord");
            return;
          }
          logger.error({ err: e, handler: handlerName, command: commandName, customId: interaction.customId }, "Erro no handler de interação");
          // Resposta de fallback para não deixar a interação sem resposta
          const errPayload = { content: "❌ Ocorreu um erro ao processar esta interação.", flags: MessageFlags.Ephemeral };
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errPayload).catch(() => {});
          } else {
            await interaction.reply(errPayload).catch(() => {});
          }
        }
      } else {
        logger.warn({ commandName, handlerName, available: Object.keys(command).filter(k => typeof command[k] === "function") }, "Handler não encontrado no comando");
      }
    }
  },
};
