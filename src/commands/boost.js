const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");

const boostStore = createDataStore("boosts.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("boost")
    .setDescription("Promova seu servidor na lista de parcerias")
    .addSubcommand((sub) =>
      sub
        .setName("promover")
        .setDescription("Promova seu servidor temporariamente")
        .addStringOption((opt) =>
          opt.setName("mensagem")
            .setDescription("Mensagem de promoção")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName("duracao")
            .setDescription("Duração em horas")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(24)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Verifique o status do seu boost")
    )
    .addSubcommand((sub) =>
      sub
        .setName("lista")
        .setDescription("Veja a lista de servidores promovidos")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (sub === "promover") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem promover o servidor!")],
          ephemeral: true
        });
      }

      const message = interaction.options.getString("mensagem");
      const duration = interaction.options.getInteger("duracao");

      // Verificar se já tem boost ativo
      const boosts = await boostStore.load();
      const existingBoost = Object.values(boosts).find(b => b.guildId === guildId && b.status === "active");
      
      if (existingBoost) {
        return interaction.reply({
          embeds: [createErrorEmbed("Seu servidor já está sendo promovido!")],
          ephemeral: true
        });
      }

      // Verificar cooldown (24 horas)
      const userLastBoost = Object.values(boosts)
        .filter(b => b.requesterId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

      if (userLastBoost) {
        const timeSinceLastBoost = Date.now() - new Date(userLastBoost.createdAt).getTime();
        const cooldownTime = 24 * 60 * 60 * 1000; // 24 horas
        
        if (timeSinceLastBoost < cooldownTime) {
          const remainingTime = Math.ceil((cooldownTime - timeSinceLastBoost) / (60 * 60 * 1000));
          return interaction.reply({
            embeds: [createErrorEmbed(`Aguarde ${remainingTime} horas para promover novamente!`)],
            ephemeral: true
          });
        }
      }

      // Criar boost
      const boostId = `${guildId}_${Date.now()}`;
      const expiresAt = new Date(Date.now() + (duration * 60 * 60 * 1000));
      
      // ✅ CORREÇÃO AQUI: Passando os dados através de uma função de callback
      await boostStore.update(boostId, (currentData) => {
        return {
          requesterId: userId,
          guildId,
          guildName: interaction.guild.name,
          guildIcon: interaction.guild.iconURL(),
          message,
          duration,
          status: "active",
          createdAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString()
        };
      });

      const embed = createSuccessEmbed(
        `🚀 **Servidor Promovido!**\n\n` +
        `**Servidor:** ${interaction.guild.name}\n` +
        `**Duração:** ${duration} horas\n` +
        `**Expira em:** ${expiresAt.toLocaleString('pt-BR')}\n\n` +
        `**Mensagem:** ${message}\n\n` +
        `Seu servidor aparecerá no topo da lista por ${duration} horas!`
      );

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "status") {
      const boosts = await boostStore.load();
      const activeBoost = Object.values(boosts).find(b => b.guildId === guildId && b.status === "active");
      
      if (!activeBoost) {
        return interaction.reply({
          embeds: [createErrorEmbed("Seu servidor não está sendo promovido no momento.")],
          ephemeral: true
        });
      }

      const timeRemaining = Math.max(0, new Date(activeBoost.expiresAt).getTime() - Date.now());
      const hoursRemaining = Math.ceil(timeRemaining / (60 * 60 * 1000));

      const embed = createEmbed({
        title: "📊 Status do Boost",
        description: `**Status:** 🟢 Ativo\n\n` +
        `**Servidor:** ${activeBoost.guildName}\n` +
        `**Duração:** ${activeBoost.duration} horas\n` +
        `**Tempo restante:** ${hoursRemaining} horas\n` +
        `**Expira em:** ${new Date(activeBoost.expiresAt).toLocaleString('pt-BR')}\n\n` +
        `**Mensagem:** ${activeBoost.message}`,
        color: 0x00ff00,
        footer: { text: "WDA - Todos os direitos reservados" }
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "lista") {
      const boosts = await boostStore.load();
      const activeBoosts = Object.values(boosts).filter(b => b.status === "active")
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      if (activeBoosts.length === 0) {
        return interaction.reply({
          embeds: [createEmbed({
            title: "🚀 Servidores Promovidos",
            description: "Nenhum servidor promovido no momento.",
            color: 0x95a5a6,
            footer: { text: "WDA - Todos os direitos reservados" }
          })],
          ephemeral: true
        });
      }

      const embed = createEmbed({
        title: "🚀 Servidores Promovidos",
        description: activeBoosts.map((boost, index) => {
          const timeRemaining = Math.max(0, new Date(boost.expiresAt).getTime() - Date.now());
          const hoursRemaining = Math.ceil(timeRemaining / (60 * 60 * 1000));
          
          return `**${index + 1}.** ${boost.guildName}\n` +
                 `⏰ Restante: ${hoursRemaining} horas\n` +
                 `💬 ${boost.message}\n` +
                 `👥 Promovido por: <@${boost.requesterId}>`;
        }).join("\n\n"), // Adicionei um \n extra aqui para ficar com mais espaço entre um servidor e outro
        color: 0x00ff00,
        footer: { text: "WDA - Todos os direitos reservados" }
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};
