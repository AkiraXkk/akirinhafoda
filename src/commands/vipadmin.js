const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} = require("discord.js");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipadmin")
    .setDescription("Administração total do sistema VIP")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("list").setDescription("Lista Tiers e VIPs ativos"))
    .addSubcommand(s =>
      s.setName("tier")
        .setDescription("Configura um Tier VIP (interativo)")
        .addStringOption(o => o.setName("id").setDescription("ID do Tier (ex: classic)").setRequired(true))
        .addRoleOption(o => o.setName("cargo").setDescription("Cargo do Tier").setRequired(true))
    )
    .addSubcommand(s =>
        s.setName("setup")
          .setDescription("Configura infraestrutura VIP")
          .addRoleOption(o => o.setName("cargo_fantasma").setDescription("Cargo com habilidade de ver canais bloqueados"))
          // ... (outras opções de setup que você já tinha podem ser mantidas aqui)
    ),

  async execute(interaction) {
    const { vip: vipService, vipConfig } = interaction.client.services;
    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      const { tiers, activeVips } = await vipService.getFullVipReport(interaction.guildId);
      const embed = new EmbedBuilder().setTitle("📊 Painel VIP").setColor("#5865F2");

      const tierText = Object.entries(tiers).map(([id, data]) => {
          const b = data.benefits || {};
          return `• **${id.toUpperCase()}**: <@&${data.roleId}>\n  └ 💰 Preço: \`${b.economy?.preco_shop || 0}\` | ✨ Midas: \`${b.economy?.mao_de_midas ? 'Sim' : 'Não'}\` | 🎁 Cotas: \`${b.social?.vips_para_dar || 0}x ${b.social?.tipo_cota || 'N/A'}\``;
      }).join('\n\n') || "Sem tiers.";

      embed.addFields({ name: "💎 Configurações", value: tierText });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "tier") {
      const id = interaction.options.getString("id").toLowerCase();
      const role = interaction.options.getRole("cargo");

      // Inicializa o tier se não existir
      await vipConfig.setGuildTier(interaction.guildId, id, { roleId: role.id, name: role.name });

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`vipadmin_tier_category_${interaction.guildId}_${id}`)
        .setPlaceholder("O que deseja configurar?")
        .addOptions(
          { label: "💰 Economia (Shop/Daily/Midas)", value: "economy", emoji: "💰" },
          { label: "👥 Social (Família/Damas/Cotas)", value: "social", emoji: "👥" },
          { label: "⚡ Técnico (Fantasma/Perms)", value: "tech", emoji: "⚡" }
        );

      return interaction.reply({
        embeds: [createSuccessEmbed(`Configurando Tier: **${id}**\nSelecione a categoria abaixo:`)],
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
      });
    }
  },

  async handleSelectMenu(interaction) {
    const [,,, guildId, tierId] = interaction.customId.split("_");
    const category = interaction.values[0];

    if (category === "economy") {
      const modal = new ModalBuilder().setCustomId(`vip_modal_eco_${guildId}_${tierId}`).setTitle(`Economia: ${tierId}`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("preco_shop").setLabel("Preço na Loja").setStyle(TextInputStyle.Short).setPlaceholder("Ex: 50000")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("daily_fixo").setLabel("Bônus Daily Fixo").setStyle(TextInputStyle.Short).setPlaceholder("Ex: 1000")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("midas").setLabel("Mão de Midas? (sim/nao)").setStyle(TextInputStyle.Short).setMaxLength(3))
      );
      return interaction.showModal(modal);
    }

    if (category === "social") {
      const modal = new ModalBuilder().setCustomId(`vip_modal_soc_${guildId}_${tierId}`).setTitle(`Social: ${tierId}`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("limite_familia").setLabel("Vagas Família").setStyle(TextInputStyle.Short)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("vips_para_dar").setLabel("Qtd de brindes (Cotas)").setStyle(TextInputStyle.Short).setPlaceholder("Ex: 2")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("tipo_cota").setLabel("Qual VIP ele pode dar?").setStyle(TextInputStyle.Short).setPlaceholder("Ex: classic"))
      );
      return interaction.showModal(modal);
    }
  }
};
