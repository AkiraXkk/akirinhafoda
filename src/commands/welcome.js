const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Configura o sistema de boas-vindas do servidor")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Configura o canal e mensagem de boas-vindas")
        .addChannelOption((opt) =>
          opt
            .setName("canal")
            .setDescription("Canal para enviar as mensagens de boas-vindas")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("mensagem")
            .setDescription("Mensagem de boas-vindas (use {user}, {username}, {server}, {count})")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("titulo")
            .setDescription("Título da mensagem de boas-vindas")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("cor")
            .setDescription("Cor do embed (hexadecimal)")
            .setRequired(false)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("tempo_exclusao")
            .setDescription("Tempo para excluir mensagem (segundos, 0 para não excluir)")
            .setMinValue(0)
            .setMaxValue(300)
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt
            .setName("mencionar")
            .setDescription("Mencionar o usuário na mensagem")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("preview")
        .setDescription("Mostra como ficará a mensagem de boas-vindas")
    )
    .addSubcommand((sub) =>
      sub
        .setName("disable")
        .setDescription("Desativa o sistema de boas-vindas")
    )
    .addSubcommand((sub) =>
      sub
        .setName("test")
        .setDescription("Envia uma mensagem de teste")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "setup") {
      const channel = interaction.options.getChannel("canal");
      const message = interaction.options.getString("mensagem");
      const title = interaction.options.getString("titulo");
      const color = interaction.options.getString("cor");
      const deleteTime = interaction.options.getInteger("tempo_exclusao");
      const mention = interaction.options.getBoolean("mencionar");

      const config = await getGuildConfig(guildId);

      // Atualizar configuração
      config.welcomeChannelId = channel.id;
      if (message) config.welcomeMessage = message;
      if (title) config.welcomeTitle = title;
      if (color) config.welcomeColor = color;
      if (deleteTime !== null) config.welcomeDeleteTime = deleteTime;
      if (mention !== null) config.welcomePing = mention;

      await setGuildConfig(guildId, config);

      const embed = createSuccessEmbed(
        `✅ Sistema de boas-vindas configurado com sucesso!\n\n` +
        `📢 Canal: ${channel}\n` +
        `⏰ Tempo de exclusão: ${deleteTime === 0 ? "Não exclui" : `${deleteTime} segundos`}\n` +
        `🔔 Menção: ${mention ? "Ativada" : "Desativada"}\n\n` +
        `Use \`/welcome preview\` para ver como ficará!`
      );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "preview") {
      const config = await getGuildConfig(guildId);
      
      if (!config.welcomeChannelId) {
        return interaction.reply({
          embeds: [createErrorEmbed("Sistema de boas-vindas não configurado! Use `/welcome setup`.")],
          ephemeral: true
        });
      }

      // Simular mensagem de boas-vindas
      const message = (config.welcomeMessage || "Bem-vindo ao servidor, {user}! 🎉")
        .replace("{user}", interaction.user.toString())
        .replace("{username}", interaction.user.username)
        .replace("{server}", interaction.guild.name)
        .replace("{count}", interaction.guild.memberCount);

      const embed = createEmbed({
        title: config.welcomeTitle || "👋 Bem-vindo(a)!",
        description: message,
        thumbnail: interaction.user.displayAvatarURL({ dynamic: true, size: 256 }),
        color: parseInt(config.welcomeColor || "3498db", 16),
        footer: { 
          text: `${config.welcomeFooter || `Membro #${interaction.guild.memberCount} • Esta mensagem será excluída em ${config.welcomeDeleteTime || 30} segundos`} • WDA - Todos os direitos reservados` 
        },
        timestamp: new Date()
      });

      return interaction.reply({
        content: "📋 **Prévia da mensagem de boas-vindas:**",
        embeds: [embed],
        ephemeral: true
      });
    }

    if (sub === "disable") {
      const config = await getGuildConfig(guildId);
      
      // Remover configurações de boas-vindas
      delete config.welcomeChannelId;
      delete config.welcomeMessage;
      delete config.welcomeTitle;
      delete config.welcomeColor;
      delete config.welcomeDeleteTime;
      delete config.welcomePing;
      delete config.welcomeFooter;

      await setGuildConfig(guildId, config);

      return interaction.reply({
        embeds: [createSuccessEmbed("❌ Sistema de boas-vindas desativado com sucesso!")],
        ephemeral: true
      });
    }

    if (sub === "test") {
      const config = await getGuildConfig(guildId);
      
      if (!config.welcomeChannelId) {
        return interaction.reply({
          embeds: [createErrorEmbed("Sistema de boas-vindas não configurado! Use `/welcome setup`.")],
          ephemeral: true
        });
      }

      const channel = interaction.guild.channels.cache.get(config.welcomeChannelId);
      if (!channel) {
        return interaction.reply({
          embeds: [createErrorEmbed("Canal de boas-vindas não encontrado! Configure novamente.")],
          ephemeral: true
        });
      }

      // Enviar mensagem de teste
      const message = (config.welcomeMessage || "Bem-vindo ao servidor, {user}! 🎉")
        .replace("{user}", interaction.user.toString())
        .replace("{username}", interaction.user.username)
        .replace("{server}", interaction.guild.name)
        .replace("{count}", interaction.guild.memberCount);

      const embed = createEmbed({
        title: (config.welcomeTitle || "👋 Bem-vindo(a)!") + " (TESTE)",
        description: message,
        thumbnail: interaction.user.displayAvatarURL({ dynamic: true, size: 256 }),
        color: parseInt(config.welcomeColor || "3498db", 16),
        footer: { 
          text: `Mensagem de teste • Esta mensagem será excluída em ${config.welcomeDeleteTime || 30} segundos • WDA - Todos os direitos reservados` 
        },
        timestamp: new Date()
      });

      const testMessage = await channel.send({ 
        content: config.welcomePing ? `${interaction.user}` : null, 
        embeds: [embed] 
      });

      // Apagar mensagem de teste após o tempo configurado
      if (config.welcomeDeleteTime !== 0) {
        const deleteTime = (config.welcomeDeleteTime || 30) * 1000;
        
        setTimeout(() => {
          testMessage.delete().catch(() => {});
        }, deleteTime);
      }

      return interaction.reply({
        embeds: [createSuccessEmbed(`✅ Mensagem de teste enviada para ${channel}!`)],
        ephemeral: true
      });
    }
  }
};
