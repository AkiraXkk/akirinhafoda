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
} = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const {
  getConfig,
  mergeConfig,
  getFullConfig,
} = require("../services/automodService");

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
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup(false);
    const sub   = interaction.options.getSubcommand();

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
    } catch (err) {
      const { logger } = require("../logger");
      logger.error({ err }, "Erro no comando /automod");
      return interaction.editReply({
        embeds: [createErrorEmbed("Ocorreu um erro ao processar o comando.")],
      }).catch(() => {});
    }
  },
};
