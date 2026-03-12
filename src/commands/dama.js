// ============================================================
//  dama.js  —  Refatorado
//  Novidades:
//   • Validação de permissão via Cargo Base VIP (vipBaseRoleId)
//     além do damaPermRoleId e dos cargos VIP individuais
//   • Botão "⚙️ Separadores" agora abre modal funcional para
//     salvar vipRoleSeparatorId e familyRoleSeparatorId
//   • Botão "🗑️ Remover Cargo VIP" abre seletor de cargo para
//     remover da lista de damaVipRoles
//   • buildPanelEmbed refletindo o estado completo dos separadores
// ============================================================

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  RoleSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");

const couplesStore = createDataStore("couples.json");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getDamaVipRoles(guildId) {
  const config = await getGuildConfig(guildId);
  return config?.damaVipRoles || {};
}

async function resolveMaxDamas(member, guildId) {
  const damaVipRoles = await getDamaVipRoles(guildId);
  let max = 1;
  for (const [roleId, data] of Object.entries(damaVipRoles)) {
    if (member.roles.cache.has(roleId) && data.maxDamas > max) max = data.maxDamas;
  }
  return max;
}

async function buildPanelEmbed(guildId) {
  const config       = await getGuildConfig(guildId);
  const damaVipRoles = config?.damaVipRoles || {};
  const hasVipRoles  = Object.keys(damaVipRoles).length > 0;

  // Lê separadores do vipService se disponível (fallback para guildConfig)
  const vipSepId = config?.vipRoleSeparatorId    || config?.vipSepId;
  const famSepId = config?.familyRoleSeparatorId || config?.famSepId;

  const rolesDesc = hasVipRoles
    ? Object.entries(damaVipRoles)
        .map(([id, d]) => `> <@&${id}> — **${d.maxDamas}** dama(s)`)
        .join("\n")
    : "> Nenhum cargo VIP configurado.";

  return createEmbed({
    title: "⚙️ Painel Admin — Sistema de Damas",
    description: [
      `**Cargo de Dama:** ${config?.damaRoleId   ? `<@&${config.damaRoleId}>`   : "❌ Não definido"}`,
      `**Cargo base VIP (permissão):** ${config?.damaPermRoleId ? `<@&${config.damaPermRoleId}>` : "❌ Não definido"}`,
      `**Cargo Base VIP Global:** ${config?.vipBaseRoleId  ? `<@&${config.vipBaseRoleId}>`  : "❌ Não definido"}`,
      `**Separador VIP:** ${vipSepId ? `<@&${vipSepId}>` : "❌ Não definido"}`,
      `**Separador Família:** ${famSepId ? `<@&${famSepId}>` : "❌ Não definido"}`,
      "",
      "**Cargos VIP e limites de damas:**",
      rolesDesc,
      "",
      "Membros com múltiplos cargos VIP terão o **maior** limite aplicado.",
      "O Cargo Base VIP global também é aceito como permissão para usar `/dama set`.",
    ].join("\n"),
    color: 0x5865f2,
    footer: { text: "Apenas administradores podem usar este painel." },
  });
}

function buildPanelComponents(hasVipRoles) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("dama_cfg:set_roles")
      .setLabel("🎭 Definir Cargos Base")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("dama_cfg:add_vip")
      .setLabel("➕ Adicionar Cargo VIP")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("dama_cfg:remove_vip")
      .setLabel("🗑️ Remover Cargo VIP")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!hasVipRoles),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("dama_cfg:separadores")
      .setLabel("⚙️ Separadores")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("dama_cfg:close")
      .setLabel("✖ Fechar")
      .setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2];
}

// ─── Módulo Principal ──────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dama")
    .setDescription("Sistema de Primeira Dama")
    .addSubcommand((sub) =>
      sub.setName("set")
        .setDescription("Define sua primeira dama")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Sua dama").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName("remove")
        .setDescription("Remove dama específica ou todas")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Dama específica (opcional)"))
    )
    .addSubcommand((sub) =>
      sub.setName("config").setDescription("Abre o painel de configuração do sistema de Damas (Admin)")
    ),

  // ─── EXECUTE ────────────────────────────────────────────────────────────────
  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId  = interaction.user.id;

    // ── config ─────────────────────────────────────────────────────────────────
    if (sub === "config") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [createErrorEmbed("Você precisa de permissão de Gerenciar Servidor.")], flags: MessageFlags.Ephemeral });
      }
      const config      = await getGuildConfig(guildId);
      const hasVipRoles = Object.keys(config?.damaVipRoles || {}).length > 0;
      return interaction.reply({
        embeds:     [await buildPanelEmbed(guildId)],
        components: buildPanelComponents(hasVipRoles),
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── set ────────────────────────────────────────────────────────────────────
    if (sub === "set") {
      const config = await getGuildConfig(guildId);

      if (!config?.damaPermRoleId || !config?.damaRoleId) {
        return interaction.reply({ embeds: [createErrorEmbed("O sistema de Dama não está configurado. Use `/dama config`.")], flags: MessageFlags.Ephemeral });
      }

      const damaVipRoles = config?.damaVipRoles || {};

      // Permissão: damaPermRoleId OU cargo base VIP global OU qualquer cargo VIP configurado
      const vipService      = interaction.client.services?.vip;
      const vipBaseRoleId   = vipService?.getGuildConfig(guildId)?.vipBaseRoleId || config?.vipBaseRoleId;
      const hasPermission   =
        interaction.member.roles.cache.has(config.damaPermRoleId) ||
        (vipBaseRoleId && interaction.member.roles.cache.has(vipBaseRoleId)) ||
        Object.keys(damaVipRoles).some((id) => interaction.member.roles.cache.has(id));

      if (!hasPermission) {
        return interaction.reply({
          embeds: [createErrorEmbed(`Você precisa ter o cargo <@&${config.damaPermRoleId}> ou um cargo VIP.`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      const target = interaction.options.getUser("usuario");

      if (target.id === userId) return interaction.reply({ embeds: [createErrorEmbed("Você não pode se definir como sua própria dama.")], flags: MessageFlags.Ephemeral });
      if (target.bot)          return interaction.reply({ embeds: [createErrorEmbed("Você não pode definir um bot como dama.")], flags: MessageFlags.Ephemeral });

      const maxDamas     = await resolveMaxDamas(interaction.member, guildId);
      const currentCouples = await couplesStore.load();
      const userCouples  = Object.entries(currentCouples).filter(([_, couple]) => couple.manId === userId);

      if (userCouples.length >= maxDamas) {
        return interaction.reply({ embeds: [createErrorEmbed(`Você já atingiu o limite de **${maxDamas}** dama(s).`)], flags: MessageFlags.Ephemeral });
      }

      const existingCouple = Object.values(currentCouples).find(
        (c) => c.manId === userId && c.womanId === target.id
      );
      if (existingCouple) {
        return interaction.reply({ embeds: [createErrorEmbed("Esta pessoa já é sua dama.")], flags: MessageFlags.Ephemeral });
      }

      await couplesStore.update(`${userId}_${target.id}`, () => ({
        manId:    userId,
        womanId:  target.id,
        guildId,
        createdAt: Date.now(),
      }));

      if (config.damaRoleId) {
        const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (targetMember) await targetMember.roles.add(config.damaRoleId).catch(() => {});
      }

      return interaction.reply({ embeds: [createSuccessEmbed(`**${target.username}** agora é sua primeira dama! 💍`)], flags: MessageFlags.Ephemeral });
    }

    // ── remove ─────────────────────────────────────────────────────────────────
    if (sub === "remove") {
      const target         = interaction.options.getUser("usuario");
      const currentCouples = await couplesStore.load();
      const config         = await getGuildConfig(guildId);

      if (target) {
        const coupleKey = `${userId}_${target.id}`;
        const couple    = currentCouples[coupleKey];

        if (!couple || couple.manId !== userId) {
          return interaction.reply({ embeds: [createErrorEmbed("Esta pessoa não é sua dama.")], flags: MessageFlags.Ephemeral });
        }

        await couplesStore.update(coupleKey, () => null);

        if (config?.damaRoleId) {
          const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
          if (targetMember) await targetMember.roles.remove(config.damaRoleId).catch(() => {});
        }

        return interaction.reply({ embeds: [createSuccessEmbed(`**${target.username}** foi removida de suas damas.`)], flags: MessageFlags.Ephemeral });
      }

      // Remove todas
      const userCouples = Object.entries(currentCouples).filter(([_, couple]) => couple.manId === userId);
      if (userCouples.length === 0) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não tem damas para remover.")], flags: MessageFlags.Ephemeral });
      }

      for (const [key, couple] of userCouples) {
        await couplesStore.update(key, () => null);
        if (config?.damaRoleId) {
          const targetMember = await interaction.guild.members.fetch(couple.womanId).catch(() => null);
          if (targetMember) await targetMember.roles.remove(config.damaRoleId).catch(() => {});
        }
      }

      return interaction.reply({ embeds: [createSuccessEmbed(`Todas as suas **${userCouples.length}** dama(s) foram removidas.`)], flags: MessageFlags.Ephemeral });
    }
  },

  // ─── HANDLE BUTTON ──────────────────────────────────────────────────────────
  async handleButton(interaction) {
    const customId = interaction.customId;

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ embeds: [createErrorEmbed("Sem permissão.")], flags: MessageFlags.Ephemeral });
    }

    // ── Fechar ─────────────────────────────────────────────────────────────────
    if (customId === "dama_cfg:close") {
      return interaction.message.delete().catch(() => {});
    }

    // ── Definir Cargos Base ────────────────────────────────────────────────────
    if (customId === "dama_cfg:set_roles") {
      const config = await getGuildConfig(interaction.guildId);

      const modal = new ModalBuilder()
        .setCustomId("dama_set_roles_modal")
        .setTitle("Definir Cargos Base do Sistema de Damas")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("damaRoleId")
              .setLabel("ID do Cargo de Dama")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(config?.damaRoleId || ""),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("damaPermRoleId")
              .setLabel("ID do Cargo base (permissão para /dama set)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(config?.damaPermRoleId || ""),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("vipBaseRoleId")
              .setLabel("ID do Cargo Base VIP global (opcional)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(config?.vipBaseRoleId || ""),
          ),
        );

      return interaction.showModal(modal);
    }

    // ── Adicionar Cargo VIP ────────────────────────────────────────────────────
    if (customId === "dama_cfg:add_vip") {
      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId("dama_vip_role_select")
        .setPlaceholder("Selecione o cargo VIP para configurar");

      return interaction.reply({
        content:    "Selecione o cargo VIP:",
        components: [new ActionRowBuilder().addComponents(roleSelect)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── Remover Cargo VIP ──────────────────────────────────────────────────────
    if (customId === "dama_cfg:remove_vip") {
      const config       = await getGuildConfig(interaction.guildId);
      const damaVipRoles = config?.damaVipRoles || {};

      if (Object.keys(damaVipRoles).length === 0) {
        return interaction.reply({ embeds: [createErrorEmbed("Nenhum cargo VIP configurado.")], flags: MessageFlags.Ephemeral });
      }

      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId("dama_vip_role_remove")
        .setPlaceholder("Selecione o cargo VIP a remover da lista");

      return interaction.reply({
        content:    "Selecione o cargo VIP que deseja remover:",
        components: [new ActionRowBuilder().addComponents(roleSelect)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── Separadores ────────────────────────────────────────────────────────────
    if (customId === "dama_cfg:separadores") {
      const config = await getGuildConfig(interaction.guildId);

      const modal = new ModalBuilder()
        .setCustomId("dama_separadores_modal")
        .setTitle("⚙️ Configurar Separadores")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("vipRoleSeparatorId")
              .setLabel("ID do Separador VIP")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(config?.vipRoleSeparatorId || ""),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("familyRoleSeparatorId")
              .setLabel("ID do Separador de Família")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(config?.familyRoleSeparatorId || ""),
          ),
        );

      return interaction.showModal(modal);
    }
  },

  // ─── HANDLE ROLE SELECT MENU ────────────────────────────────────────────────
  async handleRoleSelectMenu(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return;

    const guildId = interaction.guildId;

    // ── Adicionar configuração de cargo VIP ───────────────────────────────────
    if (interaction.customId === "dama_vip_role_select") {
      const roleId = interaction.values[0];

      const config        = await getGuildConfig(guildId);
      const damaVipRoles  = config?.damaVipRoles || {};
      const currentConfig = damaVipRoles[roleId];

      const modal = new ModalBuilder()
        .setCustomId(`dama_vip_config_${roleId}`)
        .setTitle("Configurar Cargo VIP")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("max_damas")
              .setLabel("Número de damas para este cargo")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(currentConfig?.maxDamas ? String(currentConfig.maxDamas) : ""),
          ),
        );

      return interaction.showModal(modal);
    }

    // ── Remover cargo VIP da lista ────────────────────────────────────────────
    if (interaction.customId === "dama_vip_role_remove") {
      const roleId = interaction.values[0];

      const config       = await getGuildConfig(guildId);
      const damaVipRoles = { ...(config?.damaVipRoles || {}) };

      if (!damaVipRoles[roleId]) {
        return interaction.reply({ embeds: [createErrorEmbed(`O cargo <@&${roleId}> não está na lista de cargos VIP.`)], flags: MessageFlags.Ephemeral });
      }

      delete damaVipRoles[roleId];
      await setGuildConfig(guildId, { damaVipRoles });

      return interaction.reply({
        embeds:    [createSuccessEmbed(`✅ Cargo <@&${roleId}> removido da lista de cargos VIP com damas.`)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  // ─── HANDLE MODAL ───────────────────────────────────────────────────────────
  async handleModal(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ embeds: [createErrorEmbed("Sem permissão.")], flags: MessageFlags.Ephemeral });
    }

    const guildId  = interaction.guildId;
    const customId = interaction.customId;

    // ── Cargos Base ────────────────────────────────────────────────────────────
    if (customId === "dama_set_roles_modal") {
      const damaRoleId    = interaction.fields.getTextInputValue("damaRoleId").trim();
      const damaPermRoleId = interaction.fields.getTextInputValue("damaPermRoleId").trim();
      const vipBaseRoleId  = interaction.fields.getTextInputValue("vipBaseRoleId").trim() || null;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

      const damaRole = await interaction.guild.roles.fetch(damaRoleId).catch(() => null);
      const permRole = await interaction.guild.roles.fetch(damaPermRoleId).catch(() => null);

      if (!damaRole) return interaction.editReply({ embeds: [createErrorEmbed(`Cargo de dama com ID \`${damaRoleId}\` não encontrado.`)] });
      if (!permRole) return interaction.editReply({ embeds: [createErrorEmbed(`Cargo de permissão com ID \`${damaPermRoleId}\` não encontrado.`)] });

      if (vipBaseRoleId) {
        const baseRole = await interaction.guild.roles.fetch(vipBaseRoleId).catch(() => null);
        if (!baseRole) return interaction.editReply({ embeds: [createErrorEmbed(`Cargo Base VIP com ID \`${vipBaseRoleId}\` não encontrado.`)] });
      }

      await setGuildConfig(guildId, { damaRoleId, damaPermRoleId, vipBaseRoleId });

      return interaction.editReply({
        embeds: [createSuccessEmbed(
          `✅ Cargos definidos!\n\n🎭 Dama: <@&${damaRoleId}>\n🔑 Permissão: <@&${damaPermRoleId}>` +
          (vipBaseRoleId ? `\n🌐 Base VIP Global: <@&${vipBaseRoleId}>` : "")
        )],
      });
    }

    // ── Separadores ────────────────────────────────────────────────────────────
    if (customId === "dama_separadores_modal") {
      const vipSepId = interaction.fields.getTextInputValue("vipRoleSeparatorId").trim()    || null;
      const famSepId = interaction.fields.getTextInputValue("familyRoleSeparatorId").trim() || null;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

      for (const [label, id] of [["Separador VIP", vipSepId], ["Separador Família", famSepId]]) {
        if (id) {
          const role = await interaction.guild.roles.fetch(id).catch(() => null);
          if (!role) return interaction.editReply({ embeds: [createErrorEmbed(`${label}: cargo com ID \`${id}\` não encontrado.`)] });
        }
      }

      await setGuildConfig(guildId, { vipRoleSeparatorId: vipSepId, familyRoleSeparatorId: famSepId });

      return interaction.editReply({
        embeds: [createSuccessEmbed(
          `✅ Separadores atualizados!\n\n📌 VIP: ${vipSepId ? `<@&${vipSepId}>` : "—"}\n📌 Família: ${famSepId ? `<@&${famSepId}>` : "—"}`
        )],
      });
    }

    // ── Configurar Cargo VIP (maxDamas) ────────────────────────────────────────
    if (customId.startsWith("dama_vip_config_")) {
      const roleId    = customId.split("dama_vip_config_")[1];
      const maxDamasRaw = interaction.fields.getTextInputValue("max_damas").trim();
      const maxDamas  = parseInt(maxDamasRaw, 10);

      if (!Number.isFinite(maxDamas) || maxDamas < 1) {
        return interaction.reply({ embeds: [createErrorEmbed("Número inválido. Insira um inteiro maior que 0.")], flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

      const config       = await getGuildConfig(guildId);
      const damaVipRoles = { ...(config?.damaVipRoles || {}) };
      damaVipRoles[roleId] = { maxDamas };

      await setGuildConfig(guildId, { damaVipRoles });

      return interaction.editReply({
        embeds: [createSuccessEmbed(`Cargo <@&${roleId}> agora pode ter **${maxDamas}** dama(s).`)],
      });
    }
  },
};
