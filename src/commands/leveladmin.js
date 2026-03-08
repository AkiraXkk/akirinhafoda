const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

const levelsStore = createDataStore("levels.json");

// Armazenamento temporário para confirmações
const pendingResets = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leveladmin")
    .setDescription("Administração do sistema de níveis")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("Reseta todo o XP e níveis do servidor (requer confirmação)")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "reset") {
      // Verificar se é administrador
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem usar este comando.")],
          ephemeral: true,
        });
      }

      // Verificar se o servidor corresponde ao GUILD_ID do ambiente
      const guildId = process.env.GUILD_ID;
      if (guildId && interaction.guildId !== guildId) {
        return interaction.reply({
          embeds: [createErrorEmbed("Este comando só pode ser usado no servidor principal.")],
          ephemeral: true,
        });
      }

      // Colocamos o prefixo "leveladmin_" para o roteador encontrar este arquivo!
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`leveladmin_confirm_${interaction.user.id}`)
          .setLabel("✅ Confirmar Reset")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`leveladmin_cancel_${interaction.user.id}`)
          .setLabel("❌ Cancelar")
          .setStyle(ButtonStyle.Secondary)
      );

      const embed = createEmbed({
        title: "⚠️ CONFIRMAÇÃO DE RESET",
        description: `
**Você está prestes a resetar TODO o sistema de níveis do servidor!**

**Esta ação irá:**
- Zerar o XP de **TODOS** os usuários
- Resetar todos os níveis para **0**
- Remover todos os cargos de nível atribuídos
- **Esta ação é IRREVERSÍVEL!**

**Tem certeza que deseja continuar?**
        `.trim(),
        color: 0xff0000,
        footer: { text: "Esta confirmação expira em 60 segundos" }
      });

      await interaction.reply({
        embeds: [embed],
        components: [confirmRow],
        ephemeral: true,
      });

      // Armazenar tempo da solicitação
      pendingResets.set(interaction.user.id, Date.now());

      // Auto-cancelar após 60 segundos
      setTimeout(() => {
        pendingResets.delete(interaction.user.id);
      }, 60000);
    }
  },

  // Handler para botões de confirmação
  async handleButton(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith("leveladmin_confirm_")) {
      const userId = customId.replace("leveladmin_confirm_", "");

      // Verificar se é o mesmo usuário
      if (interaction.user.id !== userId) {
        return interaction.reply({
          content: "Você não pode confirmar esta ação.",
          ephemeral: true,
        });
      }

      // Verificar se a confirmação ainda é válida
      const requestTime = pendingResets.get(userId);
      if (!requestTime || Date.now() - requestTime > 60000) {
        return interaction.reply({
          content: "Esta confirmação expirou. Use o comando novamente.",
          ephemeral: true,
        });
      }

      try {
        // Carregar dados atuais
        const levels = await levelsStore.load();
        const resetCount = Object.keys(levels).length;

        // Resetar todos os dados (Tratamento para Mongo ou JSON local)
        try {
            await levelsStore.save({});
        } catch (e) {
            // Fallback caso o banco MongoDB não aceite um save vazio
            for (const key of Object.keys(levels)) {
                if (typeof levelsStore.delete === 'function') await levelsStore.delete(key);
                else await levelsStore.update(key, () => undefined);
            }
        }

        // Remover cargos de nível de todos os membros
        const guild = interaction.guild;
        if (guild) {
          const members = await guild.members.fetch();
          const levelRolesStore = createDataStore("levelRoles.json");
          const levelRolesData = await levelRolesStore.load();
          const guildLevelRoles = levelRolesData[guild.id] || {};

          for (const member of members.values()) {
            for (const roleId of Object.values(guildLevelRoles)) {
              if (member.roles.cache.has(roleId)) {
                try {
                  await member.roles.remove(roleId);
                } catch (error) {
                  // Ignora se for o dono do servidor ou admin superior
                }
              }
            }
          }
        }

        // Limpar confirmação
        pendingResets.delete(userId);

        const successEmbed = createSuccessEmbed(
          `✅ **Reset concluído com sucesso!**\n\n` +
          `• **${resetCount}** usuários tiveram seus dados resetados\n` +
          `• Todos os níveis foram definidos para **0**\n` +
          `• Todo o XP foi zerado\n` +
          `• Cargos de nível foram removidos`
        );

        await interaction.update({
          embeds: [successEmbed],
          components: [],
        });

        // Log da ação
        console.log(`[LEVELADMIN] ${interaction.user.tag} resetou o sistema de níveis no servidor ${interaction.guild.name}`);

      } catch (error) {
        console.error("Erro ao resetar níveis:", error);

        const errorEmbed = createErrorEmbed(
          "Ocorreu um erro ao resetar o sistema de níveis. Verifique o console para mais detalhes."
        );

        await interaction.update({
          embeds: [errorEmbed],
          components: [],
        });
      }
    }

    if (customId.startsWith("leveladmin_cancel_")) {
      const userId = customId.replace("leveladmin_cancel_", "");

      if (interaction.user.id !== userId) {
        return interaction.reply({
          content: "Você não pode cancelar esta ação.",
          ephemeral: true,
        });
      }

      pendingResets.delete(userId);

      const cancelEmbed = createEmbed({
        title: "❌ Reset Cancelado",
        description: "O reset do sistema de níveis foi cancelado com segurança.",
        color: 0x00ff00,
      });

      await interaction.update({
        embeds: [cancelEmbed],
        components: [],
      });
    }
  },
};
