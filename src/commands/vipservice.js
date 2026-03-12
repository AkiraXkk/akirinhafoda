const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");

// Comando utilitário para interagir diretamente com o vipService (debug/admin)
module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipservice")
    .setDescription("Utilitários do serviço VIP (debug)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s.setName("addhook").setDescription("Adiciona um hook manualmente (debug)").addStringOption((o) =>
        o.setName("type").setDescription("Tipo: onAdd/onRemove/onExpire").setRequired(true)
      )
    )
    .addSubcommand((s) =>
      s.setName("report").setDescription("Relatório completo de VIPs do servidor")
    )
    .addSubcommand((s) =>
      s.setName("expire").setDescription("Força expiração de um VIP (debug)").addUserOption((o) =>
        o.setName("usuario").setDescription("Usuário").setRequired(true)
      )
    ),

  async execute(interaction) {
    const vipService = interaction.client.services.vip;
    const logManager = interaction.client.services.logManager;
    const sub = interaction.options.getSubcommand();

    if (sub === "addhook") {
      const type = interaction.options.getString("type");
      if (!["onAdd", "onRemove", "onExpire"].includes(type)) {
        return interaction.reply({ embeds: [createErrorEmbed("Tipo inválido.")], flags: MessageFlags.Ephemeral });
      }
      vipService.addHook(type, async (payload) => {
        console.log(`[HOOK:${type}]`, payload);
      });
      return interaction.reply({ embeds: [createSuccessEmbed(`Hook ${type} adicionado (console log).`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === "report") {
      const report = await vipService.getFullVipReport(interaction.guildId);
      const lines = report.activeVips.map((v) => {
        const remaining = v.expiresAt ? Math.ceil((v.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)) : "∞";
        return `<@${v.userId}> | tier: ${v.tierId || "-"} | expira: ${remaining}d`;
      });
      const embed = createSuccessEmbed(lines.join("\n") || "Nenhum VIP ativo.");
      embed.setTitle(`📋 Relatório VIP (${report.activeVips.length})`);
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === "expire") {
      const user = interaction.options.getUser("usuario");
      const entry = vipService.getVip(interaction.guildId, user.id);
      if (!entry) {
        return interaction.reply({ embeds: [createErrorEmbed("Usuário não é VIP.")], flags: MessageFlags.Ephemeral });
      }
      await vipService.removeVip(interaction.guildId, user.id);
      return interaction.reply({ embeds: [createSuccessEmbed(`VIP de ${user} expirado (forçado).`)], flags: MessageFlags.Ephemeral });
    }
  },
};
