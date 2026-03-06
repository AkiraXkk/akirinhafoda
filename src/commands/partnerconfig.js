const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");
const { createDataStore } = require("../store/dataStore");

const partnersStore = createDataStore("partners.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("partnerconfig")
    .setDescription("configuracoes administrativas do sistema de parceria")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("set")
        .setDescription("configura o canal de logs e cargos da staff")
        .addChannelOption(o => o.setName("logs").setDescription("canal onde os pedidos irao chegar"))
        .addRoleOption(o => o.setName("staff").setDescription("cargo que sera mencionado nos pedidos"))
        .addBooleanOption(o => o.setName("ativo").setDescription("define se o sistema esta aberto ao publico"))
    )
    .addSubcommand(sub =>
      sub.setName("ranks")
        .setDescription("configura os cargos de ranking para quem faz parceria")
        .addRoleOption(o => o.setName("bronze").setDescription("cargo para mais de 350 membros").setRequired(true))
        .addRoleOption(o => o.setName("prata").setDescription("cargo para mais de 750 membros").setRequired(true))
        .addRoleOption(o => o.setName("ouro").setDescription("cargo para mais de 1000 membros").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("info")
        .setDescription("consulta os detalhes de uma parceria especifica")
        .addStringOption(o => o.setName("id").setDescription("digite o id da parceria gerado no log").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guildId } = interaction;
    let guildConfig = await getGuildConfig(guildId) || {};
    let pConfig = guildConfig.partnership || {};

    if (sub === "set") {
      const logChan = interaction.options.getChannel("logs");
      const role = interaction.options.getRole("staff");
      const active = interaction.options.getBoolean("ativo");

      if (logChan) pConfig.logChannelId = logChan.id;
      if (active !== null) pConfig.enabledForAll = active;
      
      if (role) {
        if (!Array.isArray(pConfig.staffRoles)) pConfig.staffRoles = [];
        if (pConfig.staffRoles.includes(role.id)) {
          pConfig.staffRoles = pConfig.staffRoles.filter(id => id !== role.id);
        } else {
          pConfig.staffRoles.push(role.id);
        }
      }

      await setGuildConfig(guildId, { partnership: pConfig });
      return interaction.reply({ content: "As configurações foram atualizadas e salvas.", ephemeral: true });
    }

    if (sub === "ranks") {
      pConfig.ranks = {
        bronze: interaction.options.getRole("bronze").id,
        prata: interaction.options.getRole("prata").id,
        ouro: interaction.options.getRole("ouro").id
      };
      
      await setGuildConfig(guildId, { partnership: pConfig });
      return interaction.reply({ content: "Os cargos de ranking foram vinculados.", ephemeral: true });
    }

    if (sub === "info") {
      const partners = await partnersStore.load();
      const searchId = interaction.options.getString("id").toUpperCase();
      const data = partners[searchId];
      
      if (!data) return interaction.reply({ content: "Nenhuma parceria encontrada com este ID.", ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle(`Informações do ID: ${data.id}`)
        .addFields(
          { name: "Nome do Servidor", value: data.serverName, inline: true },
          { name: "Membros Informados", value: `${data.memberCount}`, inline: true },
          { name: "Situação", value: data.status, inline: true },
          { name: "Solicitante", value: `<@${data.requesterId}>`, inline: true }
        )
        .setTimestamp(new Date(data.date));
        
      if (data.processedBy) {
        embed.addFields({ name: "Processado por", value: `<@${data.processedBy}>`, inline: true });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};