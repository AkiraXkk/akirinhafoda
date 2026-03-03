const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} = require("discord.js");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { setGuildConfig } = require("../config/guildConfig");
const { checkCommandPermissions } = require("../utils/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipadmin")
    .setDescription("Administração total do sistema VIP")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("list").setDescription("Lista VIPs ativos e Tiers configurados"))
    .addSubcommand((s) =>
      s
        .setName("tier")
        .setDescription("Configura um Tier VIP (interativo)")
        .addStringOption((o) => o.setName("id").setDescription("ID único (ex: gold)").setRequired(true))
        .addRoleOption((o) => o.setName("cargo").setDescription("Cargo do Tier VIP").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("setup")
        .setDescription("Configura cargos de separador e categorias")
        .addRoleOption((o) => o.setName("cargo_base").setDescription("Cargo VIP principal"))
        .addChannelOption((o) => o.setName("categoria_vip").addChannelTypes(ChannelType.GuildCategory).setDescription("Categoria VIP"))
        .addChannelOption((o) => o.setName("categoria_familia").addChannelTypes(ChannelType.GuildCategory).setDescription("Categoria Família"))
        .addRoleOption((o) => o.setName("sep_vip").setDescription("Separador VIP"))
        .addRoleOption((o) => o.setName("sep_familia").setDescription("Separador Família"))
        .addRoleOption((o) => o.setName("sep_personalizados").setDescription("Separador Personalizados"))
    )
    .addSubcommand((s) => s.setName("config-staff").setDescription("Cargos autorizados"))
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Concede VIP manualmente")
        .addUserOption((o) => o.setName("usuario").setRequired(true).setDescription("Alvo"))
        .addIntegerOption((o) => o.setName("dias").setRequired(true).setDescription("Dias (0=perm)"))
        .addStringOption((o) => o.setName("tier").setDescription("ID do Tier"))
    )
    .addSubcommand((s) =>
      s.setName("remove").setDescription("Remove VIP").addUserOption((o) => o.setName("usuario").setRequired(true).setDescription("Alvo"))
    )
    .addSubcommand((s) =>
      s.setName("delete-family").setDescription("Exclui família").addUserOption((o) => o.setName("usuario").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("delete-vip-assets").setDescription("Limpa cargos/canais").addUserOption((o) => o.setName("usuario").setRequired(true))
    ),

  async execute(interaction) {
    const permissionCheck = await checkCommandPermissions(interaction, { checkStaff: true, checkChannel: true });
    if (!permissionCheck.allowed) return interaction.reply({ embeds: [createErrorEmbed(permissionCheck.reason)], ephemeral: true });

    const { vip: vipService, vipConfig, family: familyService, vipRole: vipRoleManager, vipChannel: vipChannelManager, log: logService } = interaction.client.services;
    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      const { tiers, activeVips } = await vipService.getFullVipReport(interaction.guildId);
      const embed = new EmbedBuilder().setTitle("📊 Painel VIP").setColor("#5865F2").setTimestamp();

      const tierText = Object.entries(tiers).map(([id, data]) => 
        `• **${id.toUpperCase()}**: <@&${data.roleId}>\n  └ 💰 Preço: \`${data.benefits?.economy?.preco_shop || 0}\` | 👥 Vagas: \`${data.benefits?.social?.limite_familia || 0}\``
      ).join('\n\n') || "Sem tiers.";

      const vipsText = activeVips.map(v => 
        `• <@${v.userId}> | \`${v.tierId}\` | <t:${Math.floor(v.expiresAt / 1000)}:R>`
      ).join('\n') || "Sem VIPs.";

      embed.addFields({ name: "💎 Configurações", value: tierText }, { name: "👥 Ativos", value: vipsText });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "tier") {
      const id = interaction.options.getString("id");
      const role = interaction.options.getRole("cargo");
      await vipConfig.setGuildTier(interaction.guildId, id, { roleId: role.id, name: role.name });

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`vipadmin_tier_category_${interaction.guildId}_${id}`)
        .setPlaceholder("Configurar benefícios")
        .addOptions(
          { label: "💰 Economia", value: "economy" },
          { label: "👥 Social", value: "social" },
          { label: "⚡ Técnico", value: "tech" }
        );

      return interaction.reply({
        embeds: [createSuccessEmbed(`Tier **${id}** iniciado. Escolha a categoria:`)],
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
      });
    }

    // Lógica resumida para os demais subcomandos (Add/Remove/Setup)
    if (sub === "add") {
      const alvo = interaction.options.getUser("usuario");
      const dias = interaction.options.getInteger("dias");
      const tierId = interaction.options.getString("tier");
      await vipService.addVip(interaction.guildId, alvo.id, { days: dias, tierId });
      return interaction.reply({ embeds: [createSuccessEmbed(`VIP adicionado para ${alvo}.`) ] });
    }

    if (sub === "remove") {
      const alvo = interaction.options.getUser("usuario");
      await vipService.removeVip(interaction.guildId, alvo.id);
      return interaction.reply({ embeds: [createSuccessEmbed(`VIP removido de ${alvo}.`) ] });
    }
    
    // ... manter as outras lógicas de delete-family e setup conforme seu original ...
  },

  async handleSelectMenu(interaction) {
    if (interaction.customId === "vipadmin_staff_roles") {
      await setGuildConfig(interaction.guildId, { authorizedVipStaff: interaction.values });
      return interaction.update({ embeds: [createSuccessEmbed("Cargos atualizados.")], components: [] });
    }

    if (interaction.customId.startsWith("vipadmin_tier_category_")) {
      const [,,, guildId, tierId] = interaction.customId.split("_");
      const category = interaction.values[0];

      if (category === "economy") {
        const modal = new ModalBuilder().setCustomId(`vipadmin_tier_modal_economy_${guildId}_${tierId}`).setTitle("Economia");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("valor_daily_extra").setLabel("Daily Extra").setStyle(TextInputStyle.Short)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("preco_shop").setLabel("Preço Shop").setStyle(TextInputStyle.Short)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bonus_inicial").setLabel("Bônus Ativação").setStyle(TextInputStyle.Short))
        );
        return interaction.showModal(modal);
      }

      if (category === "social") {
        const modal = new ModalBuilder().setCustomId(`vipadmin_tier_modal_social_${guildId}_${tierId}`).setTitle("Social");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("limite_familia").setLabel("Vagas Família").setStyle(TextInputStyle.Short)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("limite_damas").setLabel("Vagas Damas").setStyle(TextInputStyle.Short))
        );
        return interaction.showModal(modal);
      }
    }
  }
};
