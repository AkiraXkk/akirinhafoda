const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("jogar")
        .setDescription("Procura membros para jogar ou conversar em call")
        .addStringOption(opt => opt.setName("jogo").setDescription("Qual jogo ou assunto? (Ex: Valorant, Bate-papo)").setRequired(true))
        .addIntegerOption(opt => opt.setName("vagas").setDescription("Quantas vagas disponíveis?").setRequired(true)),

    async execute(interaction) {
        const jogo = interaction.options.getString("jogo");
        const vagas = interaction.options.getInteger("vagas");
        const member = interaction.member;

        // Verifica se a pessoa que chamou está em um canal de voz
        if (!member.voice.channel) {
            return interaction.reply({ content: "Você precisa estar em um canal de voz para chamar a galera!", flags: MessageFlags.Ephemeral });
        }

        const channelURL = `https://discord.com/channels/${interaction.guildId}/${member.voice.channel.id}`;

        const embed = new EmbedBuilder()
            .setTitle("🎮 Procurando Grupo! (LFG)")
            .setDescription(`**${member.user.username}** está chamando a galera para call!\n\n**🎮 Jogo/Assunto:** \`${jogo}\`\n**👥 Vagas:** \`${vagas}\`\n**🔊 Canal:** <#${member.voice.channel.id}>`)
            .setColor(0x00FF00)
            .setThumbnail(member.user.displayAvatarURL());

        const button = new ButtonBuilder()
            .setLabel("Entrar na Call")
            .setStyle(ButtonStyle.Link)
            .setURL(channelURL); // Botão que leva direto pra call

        const row = new ActionRowBuilder().addComponents(button);

        // Envia marcando "Here" para chamar atenção (ajuste se preferir marcar um cargo de "Gamer")
        await interaction.reply({ 
            content: "<@&929905406501859338> Bora movimentar a call!", 
            embeds: [embed], 
            components: [row] 
        });
    }
};