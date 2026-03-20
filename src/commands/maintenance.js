const { logger } = require("../logger");
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder,
  MessageFlags, } = require("discord.js");
const { createDataStore } = require("../store/dataStore");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");

const maintenanceStore = createDataStore("maintenance.json");

// Função para gerar a Embed de Manutenção com o tempo atualizado
function getMaintenanceEmbed(startTime) {
    const uptime = Math.floor((Date.now() - startTime) / 1000 / 60); // Minutos
    return new EmbedBuilder()
        .setTitle("⚠️ Aviso de Manutenção")
        .setDescription("O bot está passando por uma manutenção técnica para melhorias.")
        .addFields(
            { name: "Status", value: "🔴 Instável / Em Manutenção", inline: true },
            { name: "Duração Atual", value: `\`${uptime} minutos\``, inline: true },
            { name: "Última Atualização", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: false }
        )
        .setFooter({ text: "A cada 2 minutos esta mensagem é atualizada automaticamente." })
        .setColor(0xFFA500);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("maintenance")
    .setDescription("Gerencia o modo de manutenção do bot")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("on")
        .setDescription("Ativa o modo de manutenção")
        .addChannelOption(opt => opt.setName("canal").setDescription("Canal para o aviso público").setRequired(true).addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand(sub => sub.setName("off").setDescription("Desativa o modo de manutenção")),

  async execute(interaction) {
    const ownerId = process.env.OWNER_ID;
    if (ownerId && interaction.user.id !== ownerId) {
      return interaction.reply({ embeds: [createErrorEmbed("Apenas o dono do bot pode usar isso.")], flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();
    const presenceService = interaction.client.services?.presence; // Usaremos o serviço para gerenciar o loop

    if (sub === "on") {
      const channel = interaction.options.getChannel("canal");
      const startTime = Date.now();
      
      const embed = getMaintenanceEmbed(startTime);
      const message = await channel.send({ embeds: [embed] });

      const data = {
        enabled: true,
        channelId: channel.id,
        messageId: message.id,
        startTime: startTime
      };

      await maintenanceStore.update("global", () => data);

      // Inicia o loop de 2 minutos no serviço de presença (ou um gerenciador global)
      if (presenceService?.startMaintenanceLoop) {
          presenceService.startMaintenanceLoop(interaction.client, data);
      }

      return interaction.reply({ embeds: [createSuccessEmbed("Modo manutenção ativo. A cada 2 min a mensagem será atualizada.")], flags: MessageFlags.Ephemeral });
    }

    if (sub === "off") {
      const config = await maintenanceStore.load();
      const current = config["global"];

      if (!current?.enabled) return interaction.reply({ embeds: [createErrorEmbed("Não está em manutenção.")], flags: MessageFlags.Ephemeral });

      // Para o loop
      if (presenceService?.stopMaintenanceLoop) presenceService.stopMaintenanceLoop();

      // Envia aviso de normalização
      const channel = interaction.guild.channels.cache.get(current.channelId);
      if (channel) {
          const embedNormalizado = new EmbedBuilder()
            .setTitle("✅ Manutenção Concluída")
            .setDescription("O sistema foi normalizado. Obrigado pela paciência!")
            .setColor(0x00FF00);
          await channel.send({ embeds: [embedNormalizado] });
          
          // Opcional: apagar a mensagem de manutenção antiga
          const oldMsg = await channel.messages.fetch(current.messageId).catch(() => null);
          if (oldMsg) await oldMsg.delete().catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
      }

      await maintenanceStore.update("global", () => ({ enabled: false }));
      return interaction.reply({ embeds: [createSuccessEmbed("Modo manutenção desativado.")], flags: MessageFlags.Ephemeral });
    }
  }
};
