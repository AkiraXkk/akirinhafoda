const { SlashCommandBuilder, EmbedBuilder,
  MessageFlags, } = require("discord.js");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { getGuildConfig } = require("../config/guildConfig");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("sugerir")
        .setDescription("Envia uma sugestão para melhorar o servidor")
        .addStringOption(opt => 
            opt.setName("ideia")
            .setDescription("Descreva sua ideia detalhadamente")
            .setRequired(true)
        ),

    async execute(interaction) {
        const ideia = interaction.options.getString("ideia");
        
        // Puxa a configuração dinâmica do servidor
        const guildConfig = await getGuildConfig(interaction.guildId);
        const canalId = guildConfig.suggestionChannelId;

        if (!canalId) {
            return interaction.reply({ 
                embeds: [createErrorEmbed("O canal de sugestões ainda não foi configurado. Peça a um Staff para configurá-lo.")], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const canal = interaction.guild.channels.cache.get(canalId);

        if (!canal) {
            return interaction.reply({ 
                embeds: [createErrorEmbed("O canal de sugestões configurado não foi encontrado. Talvez tenha sido apagado.")], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const embed = new EmbedBuilder()
            .setAuthor({ name: `Sugestão de ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setDescription(`**Ideia:**\n${ideia}`)
            .setColor(0x2b2d31)
            .setFooter({ text: "Vote usando as reações abaixo!" })
            .setTimestamp();

        const msg = await canal.send({ embeds: [embed] });
        
        // Adiciona as reações automaticamente
        await msg.react("👍");
        await msg.react("👎");

        return interaction.reply({ 
            embeds: [createSuccessEmbed(`Sua sugestão foi enviada para o canal ${canal}!`)], 
            flags: MessageFlags.Ephemeral 
        });
    }
};
