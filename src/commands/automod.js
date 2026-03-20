/**
 * Comando /automod — configura o sistema de moderação automática
 *
 * Inspirado nos comandos de automod do SudoBot (onesoft-sudo/sudobot):
 *  - AntiMemberJoinCommand  → /automod antijoin
 *  - SpamModerationService  → /automod antispam
 *  - RuleModerationService  → /automod antilink + /automod filtro
 *  - RaidProtectionService  → /automod antiraid
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  Colors,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const {
  getConfig,
  mergeConfig,
  getFullConfig,
} = require("../services/automodService");

// ── Painel unificado ──────────────────────────────────────────────────────────

/**
 * Monta o embed de status + as 3 linhas de botões do painel unificado.
 */
function buildPanelEmbed(cfg) {
  const on  = (v) => (v ? "✅ Ativo" : "❌ Inativo");
  return createEmbed({
    title: "🛡️ Painel de AutoMod",
    color: 0xff6b35,
    description:
      "Use os botões abaixo para ativar/desativar cada módulo ou configurá-lo.\n" +
      "As alterações são aplicadas imediatamente.",
    fields: [
      {
        name: "🚫 Anti-Spam",
        value:
          `${on(cfg.antispam.enabled)}\n` +
          `Limite: ${cfg.antispam.limite} msgs / ${cfg.antispam.janela / 1000}s\n` +
          `Ação: \`${cfg.antispam.acao}\``,
        inline: true,
      },
      {
        name: "🔗 Anti-Link",
        value:
          `${on(cfg.antilink.enabled)}\n` +
          `Ação: \`${cfg.antilink.acao}\`\n` +
          `URLs genéricas: ${cfg.antilink.bloquearUrls ? "✅ Sim" : "❌ Não"}`,
        inline: true,
      },
      {
        name: "🔤 Filtro de Palavras",
        value:
          `${on(cfg.filtro.enabled)}\n` +
          `Palavras: ${(cfg.filtro.palavras || []).length}\n` +
          `Ação: \`${cfg.filtro.acao || "delete"}\``,
        inline: true,
      },
      {
        name: "🚨 Anti-Raid",
        value:
          `${on(cfg.antiraid.enabled)}\n` +
          `Limite: ${cfg.antiraid.limite} entradas / ${cfg.antiraid.janela / 1000}s\n` +
          `Ação: \`${cfg.antiraid.acao}\``,
        inline: true,
      },
      {
        name: "🚪 Anti-Join",
        value:
          `${on(cfg.antijoin.enabled)}\n` +
          `Ação: \`${cfg.antijoin.acao}\``,
        inline: true,
      },
      {
        name: "📝 Canal de Logs",
        value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "Não configurado",
        inline: true,
      },
    ],
    footer: "Painel de AutoMod • Use /automod <módulo> para configuração avançada",
  });
}

function buildPanelRows(cfg, guildId) {
  const toggleRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`automod_toggle_${guildId}_antispam`)
      .setLabel(`🚫 Spam`)
      .setStyle(cfg.antispam.enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`automod_toggle_${guildId}_antilink`)
      .setLabel(`🔗 Link`)
      .setStyle(cfg.antilink.enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`automod_toggle_${guildId}_filtro`)
      .setLabel(`🔤 Filtro`)
      .setStyle(cfg.filtro.enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`automod_toggle_${guildId}_antiraid`)
      .setLabel(`🚨 Raid`)
      .setStyle(cfg.antiraid.enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`automod_toggle_${guildId}_antijoin`)
      .setLabel(`🚪 Join`)
      .setStyle(cfg.antijoin.enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  const cfgRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`automod_cfg_${guildId}_antispam`)
      .setLabel("⚙️ Cfg Spam")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`automod_cfg_${guildId}_antilink`)
      .setLabel("⚙️ Cfg Link")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`automod_cfg_${guildId}_filtro`)
      .setLabel("⚙️ Cfg Filtro")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`automod_cfg_${guildId}_antiraid`)
      .setLabel("⚙️ Cfg Raid")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`automod_cfg_${guildId}_antijoin`)
      .setLabel("⚙️ Cfg Join")
      .setStyle(ButtonStyle.Primary),
  );

  const utilRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`automod_listwords_${guildId}`)
      .setLabel("📋 Palavras")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`automod_addword_${guildId}`)
      .setLabel("➕ Palavra")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`automod_remword_${guildId}`)
      .setLabel("➖ Palavra")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`automod_setlogs_${guildId}`)
      .setLabel("📝 Logs")
      .setStyle(ButtonStyle.Secondary),
  );

  return [toggleRow, cfgRow, utilRow];
}

/**
 * Constrói o modal de configuração de cada módulo do AutoMod.
 */
function buildConfigModal(module, cfg, guildId) {
  const moduleMap = {
    antispam: {
      title: "⚙️ Configurar Anti-Spam",
      fields: [
        { id: "limite", label: "Limite de mensagens (2–50)", value: String(cfg.antispam.limite) },
        { id: "janela", label: "Janela de tempo em segundos (1–60)", value: String(cfg.antispam.janela / 1000) },
        { id: "acao",   label: "Ação (delete | warn | mute | kick | ban)", value: cfg.antispam.acao },
      ],
    },
    antilink: {
      title: "⚙️ Configurar Anti-Link",
      fields: [
        { id: "acao",          label: "Ação (delete | warn | kick)", value: cfg.antilink.acao },
        { id: "bloquear_urls", label: "Bloquear URLs genéricas? (sim / não)", value: cfg.antilink.bloquearUrls ? "sim" : "não" },
      ],
    },
    filtro: {
      title: "⚙️ Configurar Filtro de Palavras",
      fields: [
        { id: "acao", label: "Ação (delete | warn | mute | kick)", value: cfg.filtro.acao || "delete" },
      ],
    },
    antiraid: {
      title: "⚙️ Configurar Anti-Raid",
      fields: [
        { id: "limite", label: "Limite de entradas (3–100)", value: String(cfg.antiraid.limite) },
        { id: "janela", label: "Janela de tempo em segundos (3–120)", value: String(cfg.antiraid.janela / 1000) },
        { id: "acao",   label: "Ação (kick | ban | lock)", value: cfg.antiraid.acao },
      ],
    },
    antijoin: {
      title: "⚙️ Configurar Anti-Join",
      fields: [
        { id: "acao", label: "Ação (kick | ban)", value: cfg.antijoin.acao },
      ],
    },
  };

  const def = moduleMap[module];
  if (!def) return null;

  const modal = new ModalBuilder()
    .setCustomId(`automod_modal_cfg_${module}_${guildId}`)
    .setTitle(def.title);

  modal.addComponents(
    ...def.fields.map((f) =>
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(f.id)
          .setLabel(f.label)
          .setStyle(TextInputStyle.Short)
          .setValue(f.value)
          .setRequired(true),
      ),
    ),
  );

  return modal;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configura o sistema de moderação automática")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    // ── Grupo: antispam ───────────────────────────────────────────────────────
    .addSubcommandGroup((g) =>
      g
        .setName("antispam")
        .setDescription("Proteção contra spam de mensagens")
        .addSubcommand((s) =>
          s.setName("ativar").setDescription("Ativa a proteção anti-spam")
        )
        .addSubcommand((s) =>
          s.setName("desativar").setDescription("Desativa a proteção anti-spam")
        )
        .addSubcommand((s) =>
          s
            .setName("configurar")
            .setDescription("Configura os parâmetros do anti-spam")
            .addIntegerOption((o) =>
              o
                .setName("limite")
                .setDescription("Máximo de mensagens permitidas na janela (padrão: 5)")
                .setMinValue(2)
                .setMaxValue(50)
            )
            .addIntegerOption((o) =>
              o
                .setName("janela")
                .setDescription("Janela de tempo em segundos (padrão: 5)")
                .setMinValue(1)
                .setMaxValue(60)
            )
            .addStringOption((o) =>
              o
                .setName("acao")
                .setDescription("Ação ao detectar spam (padrão: delete)")
                .addChoices(
                  { name: "Deletar mensagem", value: "delete" },
                  { name: "Deletar e registrar aviso", value: "warn" },
                  { name: "Silenciar 10 minutos", value: "mute" },
                  { name: "Expulsar", value: "kick" },
                  { name: "Banir", value: "ban" }
                )
            )
        )
    )

    // ── Grupo: antilink ───────────────────────────────────────────────────────
    .addSubcommandGroup((g) =>
      g
        .setName("antilink")
        .setDescription("Bloqueio de links de convite do Discord")
        .addSubcommand((s) =>
          s.setName("ativar").setDescription("Ativa o bloqueio de links de convite")
        )
        .addSubcommand((s) =>
          s.setName("desativar").setDescription("Desativa o bloqueio de links de convite")
        )
        .addSubcommand((s) =>
          s
            .setName("configurar")
            .setDescription("Define a ação ao detectar um link de convite")
            .addStringOption((o) =>
              o
                .setName("acao")
                .setDescription("Ação a tomar")
                .setRequired(true)
                .addChoices(
                  { name: "Deletar mensagem", value: "delete" },
                  { name: "Deletar e registrar aviso", value: "warn" },
                  { name: "Expulsar membro", value: "kick" }
                )
            )
            .addBooleanOption((o) =>
              o
                .setName("bloquear_urls")
                .setDescription("Bloquear também URLs genéricas (http/https), não só convites Discord")
            )
        )
    )

    // ── Grupo: filtro ─────────────────────────────────────────────────────────
    .addSubcommandGroup((g) =>
      g
        .setName("filtro")
        .setDescription("Filtro de palavras e frases proibidas")
        .addSubcommand((s) =>
          s.setName("ativar").setDescription("Ativa o filtro de palavras")
        )
        .addSubcommand((s) =>
          s.setName("desativar").setDescription("Desativa o filtro de palavras")
        )
        .addSubcommand((s) =>
          s
            .setName("configurar")
            .setDescription("Configura a ação ao detectar uma palavra proibida")
            .addStringOption((o) =>
              o
                .setName("acao")
                .setDescription("Ação ao detectar palavra proibida (padrão: delete)")
                .setRequired(true)
                .addChoices(
                  { name: "Deletar mensagem", value: "delete" },
                  { name: "Deletar e registrar aviso", value: "warn" },
                  { name: "Deletar e silenciar 10 min", value: "mute" },
                  { name: "Deletar e expulsar", value: "kick" }
                )
            )
        )
        .addSubcommand((s) =>
          s
            .setName("adicionar")
            .setDescription("Adiciona uma palavra ou frase ao filtro")
            .addStringOption((o) =>
              o
                .setName("palavra")
                .setDescription("Palavra ou frase a bloquear")
                .setRequired(true)
            )
        )
        .addSubcommand((s) =>
          s
            .setName("remover")
            .setDescription("Remove uma palavra ou frase do filtro")
            .addStringOption((o) =>
              o
                .setName("palavra")
                .setDescription("Palavra ou frase a remover")
                .setRequired(true)
            )
        )
        .addSubcommand((s) =>
          s.setName("listar").setDescription("Lista todas as palavras bloqueadas")
        )
    )

    // ── Grupo: antiraid ───────────────────────────────────────────────────────
    .addSubcommandGroup((g) =>
      g
        .setName("antiraid")
        .setDescription("Proteção contra raids (entrada em massa de membros)")
        .addSubcommand((s) =>
          s.setName("ativar").setDescription("Ativa a proteção anti-raid")
        )
        .addSubcommand((s) =>
          s.setName("desativar").setDescription("Desativa a proteção anti-raid")
        )
        .addSubcommand((s) =>
          s
            .setName("configurar")
            .setDescription("Configura os parâmetros do anti-raid")
            .addIntegerOption((o) =>
              o
                .setName("limite")
                .setDescription("Entradas em massa para acionar proteção (padrão: 10)")
                .setMinValue(3)
                .setMaxValue(100)
            )
            .addIntegerOption((o) =>
              o
                .setName("janela")
                .setDescription("Janela de tempo em segundos para contar entradas (padrão: 10)")
                .setMinValue(3)
                .setMaxValue(120)
            )
            .addStringOption((o) =>
              o
                .setName("acao")
                .setDescription("Ação ao detectar raid")
                .addChoices(
                  { name: "Expulsar entrantes", value: "kick" },
                  { name: "Banir entrantes", value: "ban" },
                  { name: "Travar canais de texto", value: "lock" }
                )
            )
        )
    )

    // ── Grupo: antijoin ───────────────────────────────────────────────────────
    .addSubcommandGroup((g) =>
      g
        .setName("antijoin")
        .setDescription("Bloqueia entradas de novos membros (modo anti-join)")
        .addSubcommand((s) =>
          s.setName("ativar").setDescription("Ativa o modo anti-join — novos membros são expulsos automaticamente")
        )
        .addSubcommand((s) =>
          s.setName("desativar").setDescription("Desativa o modo anti-join")
        )
        .addSubcommand((s) =>
          s
            .setName("configurar")
            .setDescription("Configura a ação do anti-join")
            .addStringOption((o) =>
              o
                .setName("acao")
                .setDescription("Ação ao entrar no servidor")
                .setRequired(true)
                .addChoices(
                  { name: "Expulsar", value: "kick" },
                  { name: "Banir", value: "ban" }
                )
            )
        )
    )

    // ── Subcomando: status ────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s.setName("status").setDescription("Exibe o status atual de todos os módulos do AutoMod")
    )

    // ── Subcomando: logs ──────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("logs")
        .setDescription("Define o canal de logs para ações do AutoMod")
        .addChannelOption((o) =>
          o
            .setName("canal")
            .setDescription("Canal de destino (deixe vazio para desativar os logs)")
            .addChannelTypes(ChannelType.GuildText)
        )
    )

    // ── Subcomando: painel ────────────────────────────────────────────────────
    .addSubcommand((s) =>
      s
        .setName("painel")
        .setDescription("Abre o painel unificado de AutoMod com botões interativos")
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup(false);
    const sub   = interaction.options.getSubcommand();

    // The painel sub-command replies directly (no deferral needed — config read is fast
    // and we want the panel to appear immediately without a "loading" state)
    const isPanel = !group && sub === "painel";
    if (!isPanel) await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const rawConfig = await getConfig(guildId);
      const config    = getFullConfig(rawConfig);

      // ── antispam ────────────────────────────────────────────────────────────
      if (group === "antispam") {
        if (sub === "ativar") {
          await mergeConfig(guildId, { antispam: { enabled: true } });
          return interaction.editReply({
            embeds: [createSuccessEmbed("Anti-spam **ativado** com sucesso!")],
          });
        }
        if (sub === "desativar") {
          await mergeConfig(guildId, { antispam: { enabled: false } });
          return interaction.editReply({
            embeds: [createSuccessEmbed("Anti-spam **desativado**.")],
          });
        }
        if (sub === "configurar") {
          const limite = interaction.options.getInteger("limite");
          const janela = interaction.options.getInteger("janela");
          const acao   = interaction.options.getString("acao");
          const patch  = {};
          if (limite !== null) patch.limite = limite;
          if (janela !== null) patch.janela = janela * 1000;
          if (acao   !== null) patch.acao   = acao;
          if (!Object.keys(patch).length) {
            return interaction.editReply({
              embeds: [createErrorEmbed("Forneça pelo menos uma opção para configurar.")],
            });
          }
          await mergeConfig(guildId, { antispam: patch });
          const updated = getFullConfig(await getConfig(guildId));
          return interaction.editReply({
            embeds: [
              createSuccessEmbed(
                `Anti-spam configurado!\n\n` +
                  `**Limite:** ${updated.antispam.limite} mensagens\n` +
                  `**Janela:** ${updated.antispam.janela / 1000}s\n` +
                  `**Ação:** \`${updated.antispam.acao}\``
              ),
            ],
          });
        }
      }

      // ── antilink ────────────────────────────────────────────────────────────
      if (group === "antilink") {
        if (sub === "ativar") {
          await mergeConfig(guildId, { antilink: { enabled: true } });
          return interaction.editReply({
            embeds: [createSuccessEmbed("Anti-link **ativado** com sucesso!")],
          });
        }
        if (sub === "desativar") {
          await mergeConfig(guildId, { antilink: { enabled: false } });
          return interaction.editReply({
            embeds: [createSuccessEmbed("Anti-link **desativado**.")],
          });
        }
        if (sub === "configurar") {
          const acao        = interaction.options.getString("acao");
          const bloquearUrls = interaction.options.getBoolean("bloquear_urls");
          const patch = { acao };
          if (bloquearUrls !== null) patch.bloquearUrls = bloquearUrls;
          await mergeConfig(guildId, { antilink: patch });
          const updated = getFullConfig(await getConfig(guildId));
          return interaction.editReply({
            embeds: [
              createSuccessEmbed(
                `Anti-link configurado!\n\n` +
                  `**Ação:** \`${updated.antilink.acao}\`\n` +
                  `**Bloquear URLs genéricas:** ${updated.antilink.bloquearUrls ? "Sim" : "Não"}`
              ),
            ],
          });
        }
      }

      // ── filtro ──────────────────────────────────────────────────────────────
      if (group === "filtro") {
        if (sub === "ativar") {
          await mergeConfig(guildId, { filtro: { enabled: true } });
          return interaction.editReply({
            embeds: [createSuccessEmbed("Filtro de palavras **ativado**!")],
          });
        }
        if (sub === "desativar") {
          await mergeConfig(guildId, { filtro: { enabled: false } });
          return interaction.editReply({
            embeds: [createSuccessEmbed("Filtro de palavras **desativado**.")],
          });
        }
        if (sub === "configurar") {
          const acao = interaction.options.getString("acao");
          await mergeConfig(guildId, { filtro: { acao } });
          return interaction.editReply({
            embeds: [createSuccessEmbed(`Filtro de palavras configurado! Ação: **${acao}**`)],
          });
        }
        if (sub === "adicionar") {
          const palavra  = interaction.options.getString("palavra").toLowerCase().trim();
          const palavras = [...(config.filtro.palavras || [])];
          if (palavras.includes(palavra)) {
            return interaction.editReply({
              embeds: [createErrorEmbed(`A palavra \`${palavra}\` já está na lista.`)],
            });
          }
          palavras.push(palavra);
          await mergeConfig(guildId, { filtro: { palavras } });
          return interaction.editReply({
            embeds: [
              createSuccessEmbed(
                `Palavra \`${palavra}\` adicionada ao filtro. Total: **${palavras.length}**`
              ),
            ],
          });
        }
        if (sub === "remover") {
          const palavra  = interaction.options.getString("palavra").toLowerCase().trim();
          const antes    = config.filtro.palavras || [];
          const palavras = antes.filter((p) => p !== palavra);
          if (palavras.length === antes.length) {
            return interaction.editReply({
              embeds: [createErrorEmbed(`A palavra \`${palavra}\` não está na lista.`)],
            });
          }
          await mergeConfig(guildId, { filtro: { palavras } });
          return interaction.editReply({
            embeds: [
              createSuccessEmbed(
                `Palavra \`${palavra}\` removida do filtro. Total: **${palavras.length}**`
              ),
            ],
          });
        }
        if (sub === "listar") {
          const palavras = config.filtro.palavras || [];
          if (!palavras.length) {
            return interaction.editReply({
              embeds: [
                createEmbed({
                  description: "📝 Nenhuma palavra está bloqueada no momento.",
                  color: Colors.Blurple,
                }),
              ],
            });
          }
          const list = palavras.map((word, i) => `${i + 1}. \`${word}\``).join("\n");
          return interaction.editReply({
            embeds: [
              createEmbed({
                title: "📋 Palavras Bloqueadas",
                description: list.substring(0, 4096),
                color: Colors.Blurple,
                footer: `Total: ${palavras.length} palavra(s)`,
              }),
            ],
          });
        }
      }

      // ── antiraid ────────────────────────────────────────────────────────────
      if (group === "antiraid") {
        if (sub === "ativar") {
          await mergeConfig(guildId, { antiraid: { enabled: true } });
          return interaction.editReply({
            embeds: [createSuccessEmbed("Anti-raid **ativado** com sucesso!")],
          });
        }
        if (sub === "desativar") {
          await mergeConfig(guildId, { antiraid: { enabled: false } });
          return interaction.editReply({
            embeds: [createSuccessEmbed("Anti-raid **desativado**.")],
          });
        }
        if (sub === "configurar") {
          const limite = interaction.options.getInteger("limite");
          const janela = interaction.options.getInteger("janela");
          const acao   = interaction.options.getString("acao");
          const patch  = {};
          if (limite !== null) patch.limite = limite;
          if (janela !== null) patch.janela = janela * 1000;
          if (acao   !== null) patch.acao   = acao;
          if (!Object.keys(patch).length) {
            return interaction.editReply({
              embeds: [createErrorEmbed("Forneça pelo menos uma opção para configurar.")],
            });
          }
          await mergeConfig(guildId, { antiraid: patch });
          const updated = getFullConfig(await getConfig(guildId));
          return interaction.editReply({
            embeds: [
              createSuccessEmbed(
                `Anti-raid configurado!\n\n` +
                  `**Limite:** ${updated.antiraid.limite} entradas\n` +
                  `**Janela:** ${updated.antiraid.janela / 1000}s\n` +
                  `**Ação:** \`${updated.antiraid.acao}\``
              ),
            ],
          });
        }
      }

      // ── antijoin ────────────────────────────────────────────────────────────
      if (group === "antijoin") {
        if (sub === "ativar") {
          await mergeConfig(guildId, { antijoin: { enabled: true } });
          return interaction.editReply({
            embeds: [
              createSuccessEmbed(
                "⚠️ Modo **anti-join ativado**!\n\nTodos os novos membros serão automaticamente expulsos/banidos."
              ),
            ],
          });
        }
        if (sub === "desativar") {
          await mergeConfig(guildId, { antijoin: { enabled: false } });
          return interaction.editReply({
            embeds: [createSuccessEmbed("Modo anti-join **desativado**.")],
          });
        }
        if (sub === "configurar") {
          const acao = interaction.options.getString("acao");
          await mergeConfig(guildId, { antijoin: { acao } });
          return interaction.editReply({
            embeds: [createSuccessEmbed(`Anti-join configurado! Ação: **${acao}**`)],
          });
        }
      }

      // ── status ──────────────────────────────────────────────────────────────
      if (!group && sub === "status") {
        const on  = (v) => (v ? "✅ Ativo" : "❌ Inativo");
        return interaction.editReply({
          embeds: [
            createEmbed({
              title: "🛡️ Status do AutoMod",
              color: 0xff6b35,
              fields: [
                {
                  name: "🚫 Anti-Spam",
                  value:
                    `${on(config.antispam.enabled)}\n` +
                    `Limite: ${config.antispam.limite} msgs / ${config.antispam.janela / 1000}s\n` +
                    `Ação: \`${config.antispam.acao}\``,
                  inline: true,
                },
                {
                  name: "🔗 Anti-Link",
                  value:
                    `${on(config.antilink.enabled)}\n` +
                    `Ação: \`${config.antilink.acao}\`\n` +
                    `URLs genéricas: ${config.antilink.bloquearUrls ? "✅ Sim" : "❌ Não"}`,
                  inline: true,
                },
                {
                  name: "🔤 Filtro de Palavras",
                  value:
                    `${on(config.filtro.enabled)}\n` +
                    `Palavras: ${(config.filtro.palavras || []).length}\n` +
                    `Ação: \`${config.filtro.acao || "delete"}\``,
                  inline: true,
                },
                {
                  name: "🚨 Anti-Raid",
                  value:
                    `${on(config.antiraid.enabled)}\n` +
                    `Limite: ${config.antiraid.limite} entradas / ${config.antiraid.janela / 1000}s\n` +
                    `Ação: \`${config.antiraid.acao}\``,
                  inline: true,
                },
                {
                  name: "🚪 Anti-Join",
                  value:
                    `${on(config.antijoin.enabled)}\n` +
                    `Ação: \`${config.antijoin.acao}\``,
                  inline: true,
                },
                {
                  name: "📝 Canal de Logs",
                  value: config.logChannelId
                    ? `<#${config.logChannelId}>`
                    : "Não configurado",
                  inline: true,
                },
              ],
              footer: "Use /automod <módulo> para configurar cada módulo",
            }),
          ],
        });
      }

      // ── logs ────────────────────────────────────────────────────────────────
      if (!group && sub === "logs") {
        const canal = interaction.options.getChannel("canal");
        await mergeConfig(guildId, { logChannelId: canal ? canal.id : null });
        if (canal) {
          return interaction.editReply({
            embeds: [
              createSuccessEmbed(
                `Logs do AutoMod definidos para <#${canal.id}>`
              ),
            ],
          });
        }
        return interaction.editReply({
          embeds: [createSuccessEmbed("Canal de logs do AutoMod removido.")],
        });
      }

      // ── painel ──────────────────────────────────────────────────────────────
      if (!group && sub === "painel") {
        const rows = buildPanelRows(config, guildId);
        return interaction.reply({
          embeds: [buildPanelEmbed(config)],
          components: rows,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (err) {
      const { logger } = require("../logger");
      logger.error({ err }, "Erro no comando /automod");
      const errPayload = { embeds: [createErrorEmbed("Ocorreu um erro ao processar o comando.")] };
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply(errPayload).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
      }
      return interaction.reply({ ...errPayload, flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
    }
  },

  // ── handleButton ─────────────────────────────────────────────────────────

  async handleButton(interaction) {
    const { logger } = require("../logger");

    // Verificar permissão
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        embeds: [createErrorEmbed("Apenas administradores podem usar o painel de AutoMod.")],
        flags: MessageFlags.Ephemeral,
      });
    }

    const customId = interaction.customId;
    // customId formats:
    //   automod_toggle_GUILDID_MODULE
    //   automod_cfg_GUILDID_MODULE
    //   automod_listwords_GUILDID
    //   automod_addword_GUILDID
    //   automod_remword_GUILDID
    //   automod_setlogs_GUILDID

    const parts = customId.split("_");
    // parts[0] = "automod"
    const action = parts[1]; // toggle | cfg | listwords | addword | remword | setlogs
    const guildId = interaction.guildId;

    try {
      // ── Toggle on/off ────────────────────────────────────────────────────
      if (action === "toggle") {
        const module = parts[3]; // antispam | antilink | filtro | antiraid | antijoin
        const rawConfig = await getConfig(guildId);
        const cfg = getFullConfig(rawConfig);
        const current = cfg[module]?.enabled ?? false;
        await mergeConfig(guildId, { [module]: { enabled: !current } });
        const updated = getFullConfig(await getConfig(guildId));
        return interaction.update({
          embeds: [buildPanelEmbed(updated)],
          components: buildPanelRows(updated, guildId),
        });
      }

      // ── Configure module (open modal) ────────────────────────────────────
      if (action === "cfg") {
        const module = parts[3]; // antispam | antilink | filtro | antiraid | antijoin
        const rawConfig = await getConfig(guildId);
        const cfg = getFullConfig(rawConfig);
        const modal = buildConfigModal(module, cfg, guildId);
        if (!modal) return interaction.reply({ embeds: [createErrorEmbed("Módulo inválido.")], flags: MessageFlags.Ephemeral });
        return interaction.showModal(modal);
      }

      // ── List blocked words ───────────────────────────────────────────────
      if (action === "listwords") {
        const rawConfig = await getConfig(guildId);
        const cfg = getFullConfig(rawConfig);
        const palavras = cfg.filtro.palavras || [];
        if (!palavras.length) {
          return interaction.reply({
            embeds: [createEmbed({ description: "📝 Nenhuma palavra está bloqueada no momento.", color: Colors.Blurple })],
            flags: MessageFlags.Ephemeral,
          });
        }
        const list = palavras.map((w, i) => `${i + 1}. \`${w}\``).join("\n");
        return interaction.reply({
          embeds: [createEmbed({ title: "📋 Palavras Bloqueadas", description: list.substring(0, 4096), color: Colors.Blurple, footer: `Total: ${palavras.length} palavra(s)` })],
          flags: MessageFlags.Ephemeral,
        });
      }

      // ── Add word (open modal) ────────────────────────────────────────────
      if (action === "addword") {
        const modal = new ModalBuilder()
          .setCustomId(`automod_modal_addword_${guildId}`)
          .setTitle("➕ Adicionar Palavra ao Filtro");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("palavra")
              .setLabel("Palavra ou frase a bloquear")
              .setStyle(TextInputStyle.Short)
              .setMaxLength(100)
              .setRequired(true),
          ),
        );
        return interaction.showModal(modal);
      }

      // ── Remove word (open modal) ─────────────────────────────────────────
      if (action === "remword") {
        const modal = new ModalBuilder()
          .setCustomId(`automod_modal_remword_${guildId}`)
          .setTitle("➖ Remover Palavra do Filtro");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("palavra")
              .setLabel("Palavra ou frase a remover")
              .setStyle(TextInputStyle.Short)
              .setMaxLength(100)
              .setRequired(true),
          ),
        );
        return interaction.showModal(modal);
      }

      // ── Set log channel (open modal) ─────────────────────────────────────
      if (action === "setlogs") {
        const modal = new ModalBuilder()
          .setCustomId(`automod_modal_setlogs_${guildId}`)
          .setTitle("📝 Canal de Logs do AutoMod");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("channel_id")
              .setLabel("ID do canal (deixe vazio para remover)")
              .setStyle(TextInputStyle.Short)
              .setMaxLength(25)
              .setRequired(false),
          ),
        );
        return interaction.showModal(modal);
      }
    } catch (err) {
      logger.error({ err, customId }, "Erro no handleButton do automod");
      return interaction.reply({
        embeds: [createErrorEmbed("Ocorreu um erro ao processar a ação.")],
        flags: MessageFlags.Ephemeral,
      }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
    }
  },

  // ── handleModal ──────────────────────────────────────────────────────────

  async handleModal(interaction) {
    const { logger } = require("../logger");
    const customId = interaction.customId;
    // automod_modal_TYPE_GUILDID
    // parts[2] = type: cfg_antispam | cfg_antilink | cfg_filtro | cfg_antiraid | cfg_antijoin | addword | remword | setlogs
    const withoutPrefix = customId.replace(/^automod_modal_/, "");
    const guildId = interaction.guildId;

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // ── Configure antispam ───────────────────────────────────────────────
      if (withoutPrefix.startsWith("cfg_antispam")) {
        const limite = parseInt(interaction.fields.getTextInputValue("limite"), 10);
        const janela = parseInt(interaction.fields.getTextInputValue("janela"), 10);
        const acao   = interaction.fields.getTextInputValue("acao").trim().toLowerCase();
        const acoes  = ["delete", "warn", "mute", "kick", "ban"];
        if (!acoes.includes(acao)) {
          return interaction.editReply({ embeds: [createErrorEmbed(`Ação inválida. Use: ${acoes.join(", ")}`)] });
        }
        const patch = {};
        if (!isNaN(limite) && limite >= 2 && limite <= 50) patch.limite = limite;
        if (!isNaN(janela) && janela >= 1 && janela <= 60)  patch.janela = janela * 1000;
        patch.acao = acao;
        await mergeConfig(guildId, { antispam: patch });
        const updated = getFullConfig(await getConfig(guildId));
        return interaction.editReply({
          embeds: [createSuccessEmbed(`Anti-spam configurado!\n\n**Limite:** ${updated.antispam.limite} mensagens\n**Janela:** ${updated.antispam.janela / 1000}s\n**Ação:** \`${updated.antispam.acao}\``)],
        });
      }

      // ── Configure antilink ───────────────────────────────────────────────
      if (withoutPrefix.startsWith("cfg_antilink")) {
        const acao        = interaction.fields.getTextInputValue("acao").trim().toLowerCase();
        const urlsRaw     = interaction.fields.getTextInputValue("bloquear_urls").trim().toLowerCase();
        const acoes       = ["delete", "warn", "kick"];
        if (!acoes.includes(acao)) {
          return interaction.editReply({ embeds: [createErrorEmbed(`Ação inválida. Use: ${acoes.join(", ")}`)] });
        }
        const bloquearUrls = urlsRaw === "sim" || urlsRaw === "s" || urlsRaw === "yes" || urlsRaw === "1" || urlsRaw === "true";
        await mergeConfig(guildId, { antilink: { acao, bloquearUrls } });
        const updated = getFullConfig(await getConfig(guildId));
        return interaction.editReply({
          embeds: [createSuccessEmbed(`Anti-link configurado!\n\n**Ação:** \`${updated.antilink.acao}\`\n**Bloquear URLs genéricas:** ${updated.antilink.bloquearUrls ? "Sim" : "Não"}`)],
        });
      }

      // ── Configure filtro ─────────────────────────────────────────────────
      if (withoutPrefix.startsWith("cfg_filtro")) {
        const acao  = interaction.fields.getTextInputValue("acao").trim().toLowerCase();
        const acoes = ["delete", "warn", "mute", "kick"];
        if (!acoes.includes(acao)) {
          return interaction.editReply({ embeds: [createErrorEmbed(`Ação inválida. Use: ${acoes.join(", ")}`)] });
        }
        await mergeConfig(guildId, { filtro: { acao } });
        return interaction.editReply({
          embeds: [createSuccessEmbed(`Filtro configurado! Ação: **${acao}**`)],
        });
      }

      // ── Configure antiraid ───────────────────────────────────────────────
      if (withoutPrefix.startsWith("cfg_antiraid")) {
        const limite = parseInt(interaction.fields.getTextInputValue("limite"), 10);
        const janela = parseInt(interaction.fields.getTextInputValue("janela"), 10);
        const acao   = interaction.fields.getTextInputValue("acao").trim().toLowerCase();
        const acoes  = ["kick", "ban", "lock"];
        if (!acoes.includes(acao)) {
          return interaction.editReply({ embeds: [createErrorEmbed(`Ação inválida. Use: ${acoes.join(", ")}`)] });
        }
        const patch = { acao };
        if (!isNaN(limite) && limite >= 3 && limite <= 100) patch.limite = limite;
        if (!isNaN(janela) && janela >= 3 && janela <= 120) patch.janela = janela * 1000;
        await mergeConfig(guildId, { antiraid: patch });
        const updated = getFullConfig(await getConfig(guildId));
        return interaction.editReply({
          embeds: [createSuccessEmbed(`Anti-raid configurado!\n\n**Limite:** ${updated.antiraid.limite} entradas\n**Janela:** ${updated.antiraid.janela / 1000}s\n**Ação:** \`${updated.antiraid.acao}\``)],
        });
      }

      // ── Configure antijoin ───────────────────────────────────────────────
      if (withoutPrefix.startsWith("cfg_antijoin")) {
        const acao  = interaction.fields.getTextInputValue("acao").trim().toLowerCase();
        const acoes = ["kick", "ban"];
        if (!acoes.includes(acao)) {
          return interaction.editReply({ embeds: [createErrorEmbed(`Ação inválida. Use: ${acoes.join(", ")}`)] });
        }
        await mergeConfig(guildId, { antijoin: { acao } });
        return interaction.editReply({
          embeds: [createSuccessEmbed(`Anti-join configurado! Ação: **${acao}**`)],
        });
      }

      // ── Add word ─────────────────────────────────────────────────────────
      if (withoutPrefix.startsWith("addword")) {
        const palavra = interaction.fields.getTextInputValue("palavra").toLowerCase().trim();
        const rawConfig = await getConfig(guildId);
        const cfg = getFullConfig(rawConfig);
        const palavras = [...(cfg.filtro.palavras || [])];
        if (palavras.includes(palavra)) {
          return interaction.editReply({ embeds: [createErrorEmbed(`A palavra \`${palavra}\` já está na lista.`)] });
        }
        palavras.push(palavra);
        await mergeConfig(guildId, { filtro: { palavras } });
        return interaction.editReply({
          embeds: [createSuccessEmbed(`Palavra \`${palavra}\` adicionada ao filtro. Total: **${palavras.length}**`)],
        });
      }

      // ── Remove word ──────────────────────────────────────────────────────
      if (withoutPrefix.startsWith("remword")) {
        const palavra = interaction.fields.getTextInputValue("palavra").toLowerCase().trim();
        const rawConfig = await getConfig(guildId);
        const cfg = getFullConfig(rawConfig);
        const antes = cfg.filtro.palavras || [];
        const palavras = antes.filter((p) => p !== palavra);
        if (palavras.length === antes.length) {
          return interaction.editReply({ embeds: [createErrorEmbed(`A palavra \`${palavra}\` não está na lista.`)] });
        }
        await mergeConfig(guildId, { filtro: { palavras } });
        return interaction.editReply({
          embeds: [createSuccessEmbed(`Palavra \`${palavra}\` removida. Total: **${palavras.length}**`)],
        });
      }

      // ── Set logs channel ─────────────────────────────────────────────────
      if (withoutPrefix.startsWith("setlogs")) {
        const channelIdRaw = interaction.fields.getTextInputValue("channel_id").trim();
        if (!channelIdRaw) {
          await mergeConfig(guildId, { logChannelId: null });
          return interaction.editReply({ embeds: [createSuccessEmbed("Canal de logs do AutoMod removido.")] });
        }
        const channel = interaction.guild.channels.cache.get(channelIdRaw);
        if (!channel || !channel.isTextBased()) {
          return interaction.editReply({ embeds: [createErrorEmbed("Canal não encontrado. Certifique-se de copiar o ID correto.")] });
        }
        await mergeConfig(guildId, { logChannelId: channel.id });
        return interaction.editReply({
          embeds: [createSuccessEmbed(`Logs do AutoMod definidos para <#${channel.id}>`)],
        });
      }
    } catch (err) {
      logger.error({ err, customId }, "Erro no handleModal do automod");
      return interaction.editReply({
        embeds: [createErrorEmbed("Ocorreu um erro ao processar a ação.")],
      }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
    }
  },
};
