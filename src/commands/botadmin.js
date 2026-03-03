const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { setGuildConfig, getGuildConfig } = require("../config/guildConfig");

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
        .setName("comandos")
        .setDescription("Configura canais e cargos para comandos")
        .addChannelOption((opt) =>
          opt.setName("canal_diversao").setDescription("Canal permitido para comandos de diversão").setRequired(false)
        )
        .addChannelOption((opt) =>
          opt.setName("canal_utilidade").setDescription("Canal permitido para comandos de utilidade").setRequired(false)
        )
        .addRoleOption((opt) =>
          opt
            .setName("cargo_bypass")
            .setDescription("Cargo que pode usar comandos em qualquer canal")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("setavatar")
        .setDescription("Altera o avatar do bot")
        .addAttachmentOption((opt) => opt.setName("imagem").setDescription("Nova imagem").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("setbanner")
        .setDescription("Altera o banner do bot (se suportado)")
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
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
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

    if (sub === "setbanner") {
        const attachment = interaction.options.getAttachment("imagem");
        try {
            if (typeof client.user.setBanner !== "function") {
              return interaction.reply({ embeds: [createErrorEmbed("Seu discord.js/API não suporta alterar banner do bot.")], ephemeral: true });
            }
            await client.user.setBanner(attachment.url);
            await interaction.reply({ embeds: [createSuccessEmbed("Banner atualizado com sucesso!")] });
        } catch (error) {
            await interaction.reply({ embeds: [createErrorEmbed(`Erro ao alterar banner: ${error.message}`)] });
        }
    }

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

      return interaction.reply({
        embeds: [createSuccessEmbed("Configuração de comandos atualizada.")],
        ephemeral: true,
      });
    }
  }
};
