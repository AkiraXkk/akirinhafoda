const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { createEmbed, createErrorEmbed, createSuccessEmbed } = require("../embeds");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");
const { createDataStore } = require("../store/dataStore");

const pending = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("resetconfig")
    .setDescription("Reseta configurações do bot (Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("vip")
        .setDescription("Reseta VIP/Tiers/Família e limpa ativos (canais/cargos) para reconfigurar do zero")
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ embeds: [createErrorEmbed("Use este comando em um servidor.")], ephemeral: true });
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ embeds: [createErrorEmbed("Apenas administradores podem usar isso.")], ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    if (sub !== "vip") return;

    const token = `${interaction.guildId}:${interaction.user.id}:${Date.now()}`;
    pending.set(token, { guildId: interaction.guildId, userId: interaction.user.id, createdAt: Date.now() });

    setTimeout(() => pending.delete(token), 60_000);

    const embed = createEmbed({
      title: "⚠️ RESET VIP / FAMÍLIA / TIERS",
      description: [
        "**Isso vai resetar o sistema VIP e Família deste servidor.**",
        "",
        "O reset inclui:",
        "- Limpar **tiers VIP** configurados (`/vipadmin tier`)",
        "- Limpar **config VIP do servidor** (categorias/separadores)",
        "- Apagar **canais VIP** (chat/voz) e **cargos personalizados** salvos",
        "- Apagar **famílias**, incluindo cargos/canais de família",
        "- Limpar **configurações relacionadas** do `guildConfigs.json` (VIP/Ticket/Família)",
        "",
        "**Ação irreversível.** Depois disso você terá que reconfigurar tudo.",
      ].join("\n"),
      color: 0xff0000,
      footer: { text: "Confirmação expira em 60 segundos" },
      user: interaction.user,
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`resetconfig_confirm_${token}`)
        .setLabel("✅ Confirmar")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`resetconfig_cancel_${token}`)
        .setLabel("❌ Cancelar")
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },

  async handleButton(interaction) {
    if (!interaction.customId.startsWith("resetconfig_")) return;

    const parts = interaction.customId.split("_");
    const action = parts[1]; // confirm|cancel
    const token = parts.slice(2).join("_");

    const entry = pending.get(token);
    if (!entry) {
      return interaction.reply({ embeds: [createErrorEmbed("Confirmação expirada. Use o comando novamente.")], ephemeral: true });
    }

    if (interaction.user.id !== entry.userId || interaction.guildId !== entry.guildId) {
      return interaction.reply({ embeds: [createErrorEmbed("Você não pode confirmar/cancelar esta ação.")], ephemeral: true });
    }

    pending.delete(token);

    if (action === "cancel") {
      return interaction.update({ embeds: [createSuccessEmbed("Reset cancelado.")], components: [] });
    }

    // Confirm
    await interaction.update({ embeds: [createEmbed({ title: "⏳ Reset em andamento...", description: "Aguarde.", color: 0xf1c40f })], components: [] });

    const guild = interaction.guild;
    const client = interaction.client;

    const vipService = client.services.vip;
    const vipConfig = client.services.vipConfig;
    const vipRoleManager = client.services.vipRole;
    const vipChannelManager = client.services.vipChannel;
    const familyService = client.services.family;

    // 1) Apagar canais/cargos VIP salvos (settings) e VIP state
    try {
      if (vipService) {
        const userIds = typeof vipService.listSettingsUserIds === "function" ? vipService.listSettingsUserIds(interaction.guildId) : [];

        if (guild && vipChannelManager?.deleteVipChannels) {
          for (const userId of userIds) {
            await vipChannelManager.deleteVipChannels(userId, { guildId: guild.id }).catch(() => {});
          }
        }

        if (guild && vipRoleManager?.deletePersonalRole) {
          for (const userId of userIds) {
            await vipRoleManager.deletePersonalRole(userId, { guildId: guild.id }).catch(() => {});
          }
        }

        if (typeof vipService.resetAll === "function") {
          await vipService.resetAll({ guildId: interaction.guildId });
        }
      }
    } catch {
      // ignore
    }

    // 2) Apagar famílias (cargos/canais) e limpar store
    try {
      if (familyService?.resetAll && guild) {
        await familyService.resetAll(guild);
      } else {
        const famStore = createDataStore("families.json");
        await famStore.save({});
      }
    } catch {
      // ignore
    }

    // 3) Limpar tiers VIP
    try {
      if (vipConfig?.getGuildTiers && vipConfig?.removeGuildTier) {
        const tiers = await vipConfig.getGuildTiers(guild.id);
        for (const tierId of Object.keys(tiers || {})) {
          await vipConfig.removeGuildTier(guild.id, tierId);
        }
      }
    } catch {
      // ignore
    }

    // 4) Limpar configs do guildConfigs.json relacionadas
    try {
      await getGuildConfig(guild.id);
      await setGuildConfig(guild.id, {
        // VIP
        vipRoleId: null,
        vipCategoryId: null,
        vipArchiveCategoryId: null,
        familyCategoryId: null,
        vipSeparatorRoleId: null,
        familySeparatorRoleId: null,
        personalSeparatorRoleId: null,
        authorizedVipStaff: null,

        // Tickets/família (dependências comuns)
        ticketCategoryId: null,
        ticketChannelId: null,
      });
    } catch {
      // ignore
    }

    return interaction.followUp({
      embeds: [createSuccessEmbed("Reset concluído. Agora reconfigure VIP/Tiers/Família do zero." )],
      ephemeral: true,
    });
  },
};
