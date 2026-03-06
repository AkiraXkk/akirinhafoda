const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { createSuccessEmbed } = require("../embeds");

// ID do canal onde as sugestões vão ficar
const CANAL_SUGESTOES_ID = "COLOQUE_O_ID_AQUI";

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
        const canal = interaction.guild.channels.cache.get(CANAL_SUGESTOES_ID);

        if (!canal) {
            return interaction.reply({ content: "Canal de sugestões não configurado.", ephemeral: true });
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
            ephemeral: true 
        });
    }
};
