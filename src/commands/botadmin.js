const { SlashCommandBuilder, PermissionFlagsBits,
  MessageFlags, } = require("discord.js");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { setGuildConfig, getGuildConfig } = require("../config/guildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("botadmin")
    .setDescription("Administração de Canais e Servidor")
    .addSubcommand((sub) =>
      sub
        .setName("comandos")
        .setDescription("Configura canais permitidos para o bot")
        .addChannelOption((opt) => opt.setName("canal_diversao").setDescription("Canal de diversão").setRequired(false))
        .addChannelOption((opt) => opt.setName("canal_utilidade").setDescription("Canal de utilidade").setRequired(false))
        .addRoleOption((opt) => opt.setName("cargo_bypass").setDescription("Cargo que ignora restrição").setRequired(false))
    )
    .addSubcommand((sub) => sub.setName("leaveguild").setDescription("Faz o bot sair deste servidor")),

  async execute(interaction) {
    // Aqui qualquer Adm do servidor pode usar (exceto o leaveguild se você quiser travar pro dono)
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ embeds: [createErrorEmbed("Permissão insuficiente.")], flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "comandos") {
      const canalDiversao = interaction.options.getChannel("canal_diversao");
      const canalUtilidade = interaction.options.getChannel("canal_utilidade");
      const cargoBypass = interaction.options.getRole("cargo_bypass");

      const atual = await getGuildConfig(interaction.guildId);
      const patch = {};

      if (canalDiversao) {
        const lista = new Set(atual.allowedFunChannels || []);
        lista.add(canalDiversao.id);
        patch.allowedFunChannels = Array.from(lista);
      }
      if (canalUtilidade) {
        const lista = new Set(atual.allowedUtilityChannels || []);
        lista.add(canalUtilidade.id);
        patch.allowedUtilityChannels = Array.from(lista);
      }
      if (cargoBypass) {
        const lista = new Set(atual.commandBypassRoleIds || []);
        lista.add(cargoBypass.id);
        patch.commandBypassRoleIds = Array.from(lista);
      }

      await setGuildConfig(interaction.guildId, patch);
      return interaction.reply({ embeds: [createSuccessEmbed("Configuração salva!")], flags: MessageFlags.Ephemeral });
    }

    if (sub === "leaveguild") {
      const ownerId = process.env.OWNER_ID;
      if (interaction.user.id !== ownerId) return interaction.reply({ content: "Só o dono tira o bot do server.", flags: MessageFlags.Ephemeral });

      await interaction.reply({ content: "👋 Saindo em 3 segundos...", flags: MessageFlags.Ephemeral });
      setTimeout(() => interaction.guild.leave(), 3000);
    }
  }
};