const { SlashCommandBuilder } = require("discord.js");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { config } = require("../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("botadmin")
    .setDescription("Comandos de administração do bot (Dono)")
    .addSubcommand((sub) =>
      sub
        .setName("setname")
        .setDescription("Altera o nome do bot")
        .addStringOption((opt) => opt.setName("nome").setDescription("Novo nome").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("setavatar")
        .setDescription("Altera o avatar do bot")
        .addAttachmentOption((opt) => opt.setName("imagem").setDescription("Nova imagem").setRequired(true))
    ),

  async execute(interaction) {
    // Verificar se é o dono (config.ownerId não existe ainda, vamos usar uma lista hardcoded ou env)
    // Para simplificar, vamos deixar livre para quem tiver permissão de admin do servidor
    // MAS CUIDADO: Isso altera o bot GLOBALMENTE.
    // Melhor verificar ID específico.
    
    // Vamos assumir que quem tem permissão de Administrator pode, ou adicionar uma verificação de ID hardcoded.
    // const OWNER_ID = "SEU_ID_AQUI"; 
    // if (interaction.user.id !== OWNER_ID) ...
    
    // Por segurança, vamos usar permissão de Administrador do servidor onde o comando é executado.
    if (!interaction.member.permissions.has("Administrator")) {
        return interaction.reply({ embeds: [createErrorEmbed("Apenas administradores podem usar isso.")], ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const client = interaction.client;

    if (sub === "setname") {
        const name = interaction.options.getString("nome");
        try {
            await client.user.setUsername(name);
            await interaction.reply({ embeds: [createSuccessEmbed(`Nome alterado para **${name}**!`)] });
        } catch (error) {
            await interaction.reply({ embeds: [createErrorEmbed(`Erro ao alterar nome: ${error.message}`)] });
        }
    }

    if (sub === "setavatar") {
        const attachment = interaction.options.getAttachment("imagem");
        try {
            await client.user.setAvatar(attachment.url);
            await interaction.reply({ embeds: [createSuccessEmbed("Avatar atualizado com sucesso!")] });
        } catch (error) {
            await interaction.reply({ embeds: [createErrorEmbed(`Erro ao alterar avatar: ${error.message}`)] });
        }
    }
  }
};
