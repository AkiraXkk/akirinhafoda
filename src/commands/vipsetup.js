const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { createEmbed } = require("../embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipsetup")
    .setDescription("Configura o sistema de VIP para este servidor")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Define configurações do VIP")
        .addRoleOption((opt) =>
          opt.setName("cargo_vip").setDescription("Cargo que dá permissão de VIP").setRequired(false),
        )
        .addChannelOption((opt) =>
          opt
            .setName("categoria_vip")
            .setDescription("Categoria onde serão criadas as salas VIP")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) => sub.setName("info").setDescription("Mostra a configuração atual")),

  async execute(interaction) {
    const vipService = interaction.client.services.vip;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "config") {
      const role = interaction.options.getRole("cargo_vip");
      const category = interaction.options.getChannel("categoria_vip");
      
      const patch = {};
      if (role) patch.vipRoleId = role.id;
      if (category) patch.vipCategoryId = category.id;

      if (Object.keys(patch).length === 0) {
        await interaction.reply({
          content: "Você precisa fornecer pelo menos uma opção para configurar.",
          ephemeral: true,
        });
        return;
      }

      await vipService.setGuildConfig(guildId, patch);

      const embed = createEmbed({
        title: "Configuração VIP Atualizada",
        description: "As configurações foram salvas com sucesso.",
        fields: [
          {
            name: "Cargo VIP",
            value: role ? `${role}` : "Mantido",
            inline: true,
          },
          {
            name: "Categoria VIP",
            value: category ? `${category}` : "Mantido",
            inline: true,
          },
        ],
      });

      await interaction.reply({ embeds: [embed] });
    }

    if (sub === "info") {
      const config = vipService.getGuildConfig(guildId) || {};
      
      const role = config.vipRoleId ? `<@&${config.vipRoleId}>` : "Não configurado";
      const category = config.vipCategoryId ? `<#${config.vipCategoryId}>` : "Não configurado";

      const embed = createEmbed({
        title: "Configuração VIP do Servidor",
        fields: [
          { name: "Cargo VIP Base", value: role, inline: true },
          { name: "Categoria de Salas", value: category, inline: true },
        ],
        footer: "Use /vipsetup config para alterar",
      });

      await interaction.reply({ embeds: [embed] });
    }
  },
};
