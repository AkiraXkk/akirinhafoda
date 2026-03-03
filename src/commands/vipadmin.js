const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ChannelType } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipadmin")
    .setDescription("Administração do WDA-BOT VIP")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("setup").setDescription("Configura infraestrutura e logs")
        .addChannelOption(o => o.setName("logs").setDescription("Canal para logs de auditoria").setRequired(true))
        .addChannelOption(o => o.setName("categoria").setDescription("Categoria para canais VIP").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
        .addRoleOption(o => o.setName("separador").setDescription("Cargo separador de personalizados").setRequired(true))
        .addRoleOption(o => o.setName("fantasma").setDescription("Cargo fantasma (vigilante)").setRequired(false)))
    .addSubcommand(s => s.setName("tier").setDescription("Configura benefícios de um cargo VIP")
        .addStringOption(o => o.setName("id").setDescription("ID único (ex: supremo, diamante)").setRequired(true))
        .addRoleOption(o => o.setName("cargo").setDescription("Cargo correspondente no servidor").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("Lista tiers e membros ativos")),

  async execute(interaction) {
    const { vip: vipService, vipConfig } = interaction.client.services;
    const sub = interaction.options.getSubcommand();

    if (sub === "setup") {
      await vipService.setGuildConfig(interaction.guildId, {
        logChannelId: interaction.options.getChannel("logs").id,
        vipCategoryId: interaction.options.getChannel("categoria").id,
        separatorId: interaction.options.getRole("separador").id,
        cargoFantasmaId: interaction.options.getRole("fantasma")?.id
      });
      return interaction.reply("✅ Infraestrutura configurada com sucesso.");
    }

    if (sub === "list") {
      const tiers = await vipConfig.getGuildTiers(interaction.guildId);
      const report = await vipService.getFullVipReport(interaction.guildId);
      const embed = new EmbedBuilder().setTitle("📊 Relatório VIP").setColor("Blue")
        .addFields(
            { name: "Cargos Ativos", value: Object.keys(tiers).map(t => `• ${t.toUpperCase()} (<@&${tiers[t].roleId}>)`).join("\n") || "Nenhum" },
            { name: "Membros VIP", value: report.activeVips.map(v => `<@${v.userId}> (\`${v.tierId}\`)`).join("\n") || "Nenhum" }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "tier") {
      const id = interaction.options.getString("id").toLowerCase();
      const role = interaction.options.getRole("cargo");
      await vipConfig.setBase(interaction.guildId, id, role.id, role.name);

      const menu = new StringSelectMenuBuilder().setCustomId(`va_${interaction.guildId}_${id}`)
        .addOptions(
          { label: "Economia", value: "eco", description: "Daily, Midas, Preço", emoji: "💰" },
          { label: "Social", value: "soc", description: "Família, Damas, Cota", emoji: "👨‍👩‍👧" },
          { label: "Técnico", value: "tec", description: "Canais, Custom Role, Voz", emoji: "⚡" }
        );
      return interaction.reply({ content: `Configurando benefícios de: <@&${role.id}>`, components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }
  },

  async handleSelectMenu(interaction) {
    const [,, guildId, tierId] = interaction.customId.split("_");
    const val = interaction.values[0];
    const modal = new ModalBuilder().setCustomId(`vm_${val}_${guildId}_${tierId}`).setTitle(`Benefícios: ${tierId}`);

    if (val === "eco") {
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("d").setLabel("Bônus Daily Extra").setPlaceholder("Ex: 1000").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("m").setLabel("Mão de Midas? (sim/nao)").setMaxLength(3).setStyle(TextInputStyle.Short))
      );
    } else if (val === "soc") {
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("v").setLabel("Vagas Extras Família").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("da").setLabel("Cotas de VIP (Damas)").setPlaceholder("Ex: 3").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("cr").setLabel("ID do Cargo que o VIP pode dar").setStyle(TextInputStyle.Short).setRequired(true))
      );
    } else {
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("cc").setLabel("Pode criar Call? (sim/nao)").setStyle(TextInputStyle.Short)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("cp").setLabel("Pode Chat Privado? (sim/nao)").setStyle(TextInputStyle.Short)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("crp").setLabel("Cargo Personalizado? (sim/nao)").setStyle(TextInputStyle.Short)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("hq").setLabel("Áudio 1080p/96kbps? (sim/nao)").setStyle(TextInputStyle.Short))
      );
    }
    return interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const { vipConfig } = interaction.client.services;
    const [, type, guildId, tierId] = interaction.customId.split("_");
    const isSim = (id) => interaction.fields.getTextInputValue(id).toLowerCase() === "sim";

    if (type === "eco") {
      await vipConfig.updateTier(guildId, tierId, "eco", { daily: parseInt(interaction.fields.getTextInputValue("d")), midas: isSim("m") });
    } else if (type === "soc") {
      await vipConfig.updateTier(guildId, tierId, "soc", { vagas: parseInt(interaction.fields.getTextInputValue("v")), damas: parseInt(interaction.fields.getTextInputValue("da")), cotaRoleId: interaction.fields.getTextInputValue("cr") });
    } else {
      await vipConfig.updateTier(guildId, tierId, "tec", { canCall: isSim("cc"), chat_privado: isSim("cp"), hasCustomRole: isSim("crp"), high_quality_voice: isSim("hq") });
    }
    return interaction.reply({ content: "✅ Configurações salvas!", ephemeral: true });
  }
};
