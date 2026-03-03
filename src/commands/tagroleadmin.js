const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

function parseTags(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tagroleadmin")
    .setDescription("Configura varredura automática de tag para dar/remover cargo")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand((s) =>
      s
        .setName("status")
        .setDescription("Ver configurações atuais")
    )

    .addSubcommand((s) =>
      s
        .setName("setup")
        .setDescription("Configurar cargo e tags")
        .addRoleOption((o) => o.setName("role").setDescription("Cargo a dar/remover").setRequired(true))
        .addStringOption((o) => o.setName("tags").setDescription("Tags separadas por vírgula (ex: [WDA],WDA,【WDA】)").setRequired(true))
        .addIntegerOption((o) => o.setName("interval_hours").setDescription("Intervalo em horas").setMinValue(1).setRequired(false))
        .addBooleanOption((o) => o.setName("enabled").setDescription("Ativar varredura").setRequired(false))
        .addBooleanOption((o) => o.setName("remove_missing").setDescription("Remover cargo quando não tiver tag").setRequired(false))
        .addBooleanOption((o) => o.setName("include_displayname").setDescription("Checar nickname/displayName").setRequired(false))
        .addBooleanOption((o) => o.setName("include_username").setDescription("Checar username").setRequired(false))
        .addBooleanOption((o) => o.setName("include_globalname").setDescription("Checar globalName").setRequired(false))
    )

    .addSubcommand((s) =>
      s
        .setName("run")
        .setDescription("Rodar varredura agora")
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Use em um servidor.", ephemeral: true });

    const tagRoleService = interaction.client.services?.tagRole;
    const tagRoleManager = interaction.client.services?.tagRoleManager;
    if (!tagRoleService) {
      return interaction.reply({ content: "Serviço tagRole indisponível.", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "status") {
      const cfg = await tagRoleService.getConfig(guildId);
      const embed = new EmbedBuilder()
        .setTitle("🏷️ Tag Role - Status")
        .setColor(0x3498db)
        .addFields(
          { name: "Ativo", value: cfg.enabled ? "✅" : "❌", inline: true },
          { name: "Cargo", value: cfg.roleId ? `<@&${cfg.roleId}>` : "(não configurado)", inline: true },
          { name: "Intervalo (h)", value: String(cfg.intervalHours || 0), inline: true },
          { name: "Remove missing", value: cfg.removeMissing ? "✅" : "❌", inline: true },
          { name: "Tags", value: (cfg.tags || []).join(", ") || "(vazio)", inline: false },
          { name: "Checagens", value: `displayName=${cfg.includeDisplayName ? "on" : "off"} | username=${cfg.includeUsername ? "on" : "off"} | globalName=${cfg.includeGlobalName ? "on" : "off"}`, inline: false }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "setup") {
      const role = interaction.options.getRole("role");
      const tagsRaw = interaction.options.getString("tags");
      const intervalHours = interaction.options.getInteger("interval_hours");
      const enabled = interaction.options.getBoolean("enabled");
      const removeMissing = interaction.options.getBoolean("remove_missing");
      const includeDisplayName = interaction.options.getBoolean("include_displayname");
      const includeUsername = interaction.options.getBoolean("include_username");
      const includeGlobalName = interaction.options.getBoolean("include_globalname");

      const tags = parseTags(tagsRaw);

      const patch = {
        roleId: role.id,
        tags,
      };
      if (typeof intervalHours === "number") patch.intervalHours = intervalHours;
      if (typeof enabled === "boolean") patch.enabled = enabled;
      if (typeof removeMissing === "boolean") patch.removeMissing = removeMissing;
      if (typeof includeDisplayName === "boolean") patch.includeDisplayName = includeDisplayName;
      if (typeof includeUsername === "boolean") patch.includeUsername = includeUsername;
      if (typeof includeGlobalName === "boolean") patch.includeGlobalName = includeGlobalName;

      const cfg = await tagRoleService.updateConfig(guildId, patch);

      if (tagRoleManager?.start) {
        await tagRoleManager.start();
      }

      return interaction.reply({ content: `✅ Configurado. Ativo=${cfg.enabled ? "sim" : "não"}. Cargo=<@&${cfg.roleId}>. Tags=${(cfg.tags || []).join(", ")}`, ephemeral: true });
    }

    if (sub === "run") {
      if (!tagRoleManager?.applyOnce) {
        return interaction.reply({ content: "Manager indisponível.", ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const res = await tagRoleManager.applyOnce();
      if (!res.ok) return interaction.editReply("❌ Falha ao executar varredura.");
      if (res.skipped) return interaction.editReply(`⚠️ Varredura ignorada: ${res.reason}`);
      return interaction.editReply(`✅ Varredura concluída. Scanned=${res.scanned} Added=${res.added} Removed=${res.removed}`);
    }
  }
};
