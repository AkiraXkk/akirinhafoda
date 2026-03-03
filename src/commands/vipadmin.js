const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType } = require("discord.js");
const { createSuccessEmbed } = require("../embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipadmin")
    .setDescription("Administração total do sistema VIP")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    // SETUP
    .addSubcommand(s => s.setName("setup").setDescription("Configura a infraestrutura do sistema")
        .addRoleOption(o => o.setName("fantasma").setDescription("Cargo que terá acesso fantasma").setRequired(false))
        .addRoleOption(o => o.setName("separador").setDescription("Cargo separador de cargos personalizados").setRequired(false))
        .addChannelOption(o => o.setName("categoria").setDescription("Categoria para canais VIP").addChannelTypes(ChannelType.GuildCategory).setRequired(false)))
    // TIER
    .addSubcommand(s => s.setName("tier").setDescription("Configura benefícios de um Tier")
        .addStringOption(o => o.setName("id").setDescription("ID do Tier (ex: black)").setRequired(true))
        .addRoleOption(o => o.setName("cargo").setDescription("Cargo associado a este Tier").setRequired(true)))
    // ADD (GIVE) - Onde estava o erro
    .addSubcommand(s => s.setName("add").setDescription("Dá VIP a um usuário manualmente")
        .addUserOption(o => o.setName("user").setDescription("Usuário que receberá o VIP").setRequired(true))
        .addStringOption(o => o.setName("id").setDescription("ID do Tier VIP").setRequired(true))
        .addIntegerOption(o => o.setName("dias").setDescription("Quantidade de dias de VIP").setRequired(true))),

  async execute(interaction) {
    const { vip: vipService, vipConfig } = interaction.client.services;
    const sub = interaction.options.getSubcommand();

    if (sub === "setup") {
        await vipService.setGuildConfig(interaction.guildId, {
            cargoFantasmaId: interaction.options.getRole("fantasma")?.id,
            personalSeparatorRoleId: interaction.options.getRole("separador")?.id,
            vipCategoryId: interaction.options.getChannel("categoria")?.id
        });
        return interaction.reply({ content: "✅ Infraestrutura configurada!", ephemeral: true });
    }

    if (sub === "add") {
        const target = interaction.options.getMember("user");
        const tid = interaction.options.getString("id").toLowerCase();
        const days = interaction.options.getInteger("dias");

        const tConf = await vipConfig.getTierConfig(interaction.guildId, tid);
        if (!tConf) return interaction.reply({ content: "❌ Este Tier não existe nas configurações.", ephemeral: true });

        await vipService.addVip(interaction.guildId, target.id, { days, tierId: tid });
        if (tConf.roleId) await target.roles.add(tConf.roleId).catch(() => {});

        return interaction.reply({ embeds: [createSuccessEmbed(`✅ **${target.user.username}** agora é VIP **${tid.toUpperCase()}** por ${days} dias!`)] });
    }

    if (sub === "tier") {
        const id = interaction.options.getString("id").toLowerCase();
        const role = interaction.options.getRole("cargo");
        await vipConfig.setGuildTier(interaction.guildId, id, { roleId: role.id, name: role.name });

        const menu = new StringSelectMenuBuilder().setCustomId(`va_${interaction.guildId}_${id}`)
            .addOptions(
                { label: "Economia (Daily/Midas)", value: "eco", emoji: "💰" }, 
                { label: "Técnico (Perso/Fantasma)", value: "tec", emoji: "⚡" }
            );
        return interaction.reply({ content: `🛠️ Configurando VIP: **${id.toUpperCase()}**`, components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }
  },

  async handleSelectMenu(interaction) {
    const [,, guildId, tierId] = interaction.customId.split("_");
    const val = interaction.values[0];
    const modal = new ModalBuilder().setCustomId(`vm_${val}_${guildId}_${tierId}`).setTitle(`Configuração: ${tierId}`);

    if (val === "eco") {
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("p").setLabel("Preço no Shop").setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("d").setLabel("Bônus Daily Extra").setStyle(TextInputStyle.Short).setPlaceholder("Ex: 1000")),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("m").setLabel("Mão de Midas? (sim/nao)").setStyle(TextInputStyle.Short).setMaxLength(3))
        );
    } else {
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("cp").setLabel("Cargo Personalizado? (sim/nao)").setStyle(TextInputStyle.Short).setMaxLength(3)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ft").setLabel("VIP Fantasma? (sim/nao)").setStyle(TextInputStyle.Short).setMaxLength(3))
        );
    }
    return interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const { vipConfig } = interaction.client.services;
    const [, type, guildId, tierId] = interaction.customId.split("_");
    const isSim = (id) => interaction.fields.getTextInputValue(id).toLowerCase() === "sim";

    if (type === "eco") {
        await vipConfig.updateTierBenefits(guildId, tierId, "economy", {
            preco_shop: parseInt(interaction.fields.getTextInputValue("p")) || 0,
            valor_daily_extra: parseInt(interaction.fields.getTextInputValue("d")) || 0,
            mao_de_midas: isSim("m")
        });
    } else {
        await vipConfig.updateTierBenefits(guildId, tierId, "tech", {
            hasSecondRole: isSim("cp"),
            fantasma: isSim("ft")
        });
    }
    return interaction.reply({ content: `✅ Benefícios do VIP **${tierId}** atualizados!`, ephemeral: true });
  }
};
