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
            .setDescription("Cor do embed (hexadecimal, ex: #ff0000)")
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
        .setDescription("Envia uma mensagem de teste no canal configurado")
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

      const config = await getGuildConfig(guildId) || {};

      // Atualizar configuração
      config.welcomeChannelId = channel.id;
      if (message !== null) config.welcomeMessage = message;
      if (title !== null) config.welcomeTitle = title;
      if (color !== null) config.welcomeColor = color;
      if (deleteTime !== null) config.welcomeDeleteTime = deleteTime;
      if (mention !== null) config.welcomePing = mention;

      await setGuildConfig(guildId, config);

      const embed = createSuccessEmbed(
        `✅ Sistema de boas-vindas configurado com sucesso!\n\n` +
        `📢 Canal: ${channel}\n` +
        `⏰ Tempo de exclusão: ${config.welcomeDeleteTime === 0 ? "Não exclui" : `${config.welcomeDeleteTime || 30} segundos`}\n` +
        `🔔 Menção: ${config.welcomePing ? "Ativada" : "Desativada"}\n\n` +
        `Use \`/welcome preview\` para ver como ficará!`
      );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "preview") {
      const config = await getGuildConfig(guildId);

      if (!config || !config.welcomeChannelId) {
        return interaction.reply({
          embeds: [createErrorEmbed("Sistema de boas-vindas não configurado! Use `/welcome setup`.")],
          ephemeral: true
        });
      }

      // Simular mensagem de boas-vindas
      const message = (config.welcomeMessage || "Bem-vindo ao servidor, {user}! 🎉")
        .replace(/{user}/g, interaction.user.toString())
        .replace(/{username}/g, interaction.user.username)
        .replace(/{server}/g, interaction.guild.name)
        .replace(/{count}/g, interaction.guild.memberCount);

      // Limpa a cor caso o admin tenha digitado com '#'
      const rawColor = config.welcomeColor || "3498db";
      const cleanColor = parseInt(rawColor.replace("#", ""), 16);

      const embed = createEmbed({
        title: config.welcomeTitle || "👋 Bem-vindo(a)!",
        description: message,
        thumbnail: interaction.user.displayAvatarURL({ dynamic: true, size: 256 }),
        color: cleanColor,
        footer: { 
          text: `Membro #${interaction.guild.memberCount} • Exclusão em ${config.welcomeDeleteTime || 30}s • WDA` 
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
      const config = await getGuildConfig(guildId) || {};

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

      if (!config || !config.welcomeChannelId) {
        return interaction.reply({
          embeds: [createErrorEmbed("Sistema de boas-vindas não configurado! Use `/welcome setup`.")],
          ephemeral: true
        });
      }

      const channel = interaction.guild.channels.cache.get(config.welcomeChannelId);
      if (!channel) {
        return interaction.reply({
          embeds: [createErrorEmbed("Canal de boas-vindas não encontrado! Configure novamente com `/welcome setup`.")],
          ephemeral: true
        });
      }

      // Enviar mensagem de teste
      const message = (config.welcomeMessage || "Bem-vindo ao servidor, {user}! 🎉")
        .replace(/{user}/g, interaction.user.toString())
        .replace(/{username}/g, interaction.user.username)
        .replace(/{server}/g, interaction.guild.name)
        .replace(/{count}/g, interaction.guild.memberCount);

      const rawColor = config.welcomeColor || "3498db";
      const cleanColor = parseInt(rawColor.replace("#", ""), 16);

      const embed = createEmbed({
        title: (config.welcomeTitle || "👋 Bem-vindo(a)!") + " (TESTE)",
        description: message,
        thumbnail: interaction.user.displayAvatarURL({ dynamic: true, size: 256 }),
        color: cleanColor,
        footer: { 
          text: `Mensagem de teste • Será excluída em ${config.welcomeDeleteTime || 30}s • WDA` 
        },
        timestamp: new Date()
      });

      const testMessage = await channel.send({ 
        content: config.welcomePing ? `${interaction.user}` : null, 
        embeds: [embed] 
      });

      // Apagar mensagem de teste após o tempo configurado (se não for 0)
      const deleteTimeSec = config.welcomeDeleteTime !== undefined ? config.welcomeDeleteTime : 30;
      
      if (deleteTimeSec > 0) {
        setTimeout(() => {
          testMessage.delete().catch(() => {});
        }, deleteTimeSec * 1000);
      }

      return interaction.reply({
        embeds: [createSuccessEmbed(`✅ Mensagem de teste enviada para ${channel}!`)],
        ephemeral: true
      });
    }
  }
};