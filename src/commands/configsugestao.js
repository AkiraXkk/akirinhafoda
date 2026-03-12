const { SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  MessageFlags, } = require("discord.js");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { setGuildConfig } = require("../config/guildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("configsugestao")
    .setDescription("Configura o canal onde as sugestões dos membros vão aparecer (Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(opt => 
        opt.setName("canal")
        .setDescription("O canal de texto para as sugestões")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  async execute(interaction) {
    const canal = interaction.options.getChannel("canal");

    try {
        // Salva o ID do canal no seu banco de dados
        await setGuildConfig(interaction.guildId, { suggestionChannelId: canal.id });
        
        return interaction.reply({ 
            embeds: [createSuccessEmbed(`✅ Canal de sugestões configurado com sucesso para ${canal}!`)], 
            flags: MessageFlags.Ephemeral 
        });
    } catch (error) {
        console.error("Erro ao configurar canal de sugestões:", error);
        return interaction.reply({ 
            embeds: [createErrorEmbed("Ocorreu um erro ao salvar a configuração no banco de dados.")], 
            flags: MessageFlags.Ephemeral 
        });
    }
  }
};
