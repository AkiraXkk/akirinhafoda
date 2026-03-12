const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Configura canais de logs do sistema VIP")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s.setName("set").setDescription("Define um canal para um tipo de log").addChannelOption((o) =>
        o.setName("canal").setDescription("Canal de destino").addChannelTypes(ChannelType.GuildText).setRequired(true)
      ).addStringOption((o) =>
        o.setName("tipo").setDescription("Tipo de log").setRequired(true).addChoices(
          { name: "Staff (ações de admin)", value: "staff" },
          { name: "Usuário (ações do VIP)", value: "user" },
          { name: "Economia (compras/vendas)", value: "economy" },
          { name: "Sistema (erros)", value: "system" }
        )
      )
    )
    .addSubcommand((s) =>
      s.setName("announce").setDescription("Define o canal de anúncios de novos VIPs").addChannelOption((o) =>
        o.setName("canal").setDescription("Canal de anúncios").addChannelTypes(ChannelType.GuildText).setRequired(true)
      )
    )
    .addSubcommand((s) =>
      s.setName("test").setDescription("Envia uma mensagem de teste para todos os canais configurados")
    ),

  async execute(interaction) {
    const logManager = interaction.client.services?.logManager;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
      const channel = interaction.options.getChannel("canal");
      const type = interaction.options.getString("tipo");

      // Salvar no guildConfigs (poderia usar vipConfig também)
      const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");
      const config = await getGuildConfig(guildId);
      const logChannels = config.logChannels || {};
      logChannels[type] = channel.id;
      await setGuildConfig(guildId, { logChannels });

      return interaction.reply({
        embeds: [createSuccessEmbed(`Canal ${channel} definido para logs de **${type}**.`)],
        ephemeral: true,
      });
    }

    if (sub === "announce") {
      const channel = interaction.options.getChannel("canal");
      const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");
      const config = await getGuildConfig(guildId);
      await setGuildConfig(guildId, { announcementChannelId: channel.id });

      return interaction.reply({
        embeds: [createSuccessEmbed(`Canal ${channel} definido para anúncios de novos VIPs.`)],
        ephemeral: true,
      });
    }

    if (sub === "test") {
      if (!logManager) {
        return interaction.reply({ embeds: [createErrorEmbed("LogManager não disponível.")], ephemeral: true });
      }

      const { getGuildConfig } = require("../config/guildConfig");
      const config = await getGuildConfig(guildId);
      const logChannels = config.logChannels || {};

      const promises = Object.entries(logChannels).map(async ([type, channelId]) => {
        const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (!channel) return;

        await channel.send({
          embeds: [
            createSuccessEmbed(`Teste de log **${type}** em ${new Date().toISOString()}`),
          ],
        });
      });

      await Promise.allSettled(promises);
      return interaction.reply({
        embeds: [createSuccessEmbed("Mensagens de teste enviadas para todos os canais configurados.")],
        ephemeral: true,
      });
    }
  },
};
