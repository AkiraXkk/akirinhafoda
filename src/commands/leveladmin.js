const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  PermissionFlagsBits 
} = require("discord.js");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

const levelsStore = createDataStore("levels.json");
const levelRolesStore = createDataStore("levelRoles.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leveladmin")
    .setDescription("Comandos de administração do sistema de níveis")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    // Subcomando: Dar XP
    .addSubcommand(sub => 
      sub.setName("dar_xp")
      .setDescription("Adiciona XP a um usuário")
      .addUserOption(opt => opt.setName("usuario").setDescription("Usuário que receberá XP").setRequired(true))
      .addIntegerOption(opt => opt.setName("quantidade").setDescription("Quantidade de XP para adicionar").setRequired(true).setMinValue(1))
    )

    // Subcomando: Remover XP
    .addSubcommand(sub => 
      sub.setName("remover_xp")
      .setDescription("Remove XP de um usuário")
      .addUserOption(opt => opt.setName("usuario").setDescription("Usuário que perderá XP").setRequired(true))
      .addIntegerOption(opt => opt.setName("quantidade").setDescription("Quantidade de XP para remover").setRequired(true).setMinValue(1))
    )

    // Subcomando: Checar Cargos (Sincronização em massa)
    .addSubcommand(sub => 
      sub.setName("checar_cargos")
      .setDescription("Sincroniza todos os cargos de nível do servidor")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ==========================================
    // DAR XP
    // ==========================================
    if (sub === "dar_xp") {
      await interaction.deferReply({ ephemeral: true });

      const usuario = interaction.options.getUser("usuario");
      const quantidade = interaction.options.getInteger("quantidade");

      try {
        // Buscar o comando rank para usar suas funções
        const rankCommand = interaction.client.commands.get("rank");
        if (!rankCommand || typeof rankCommand.addXp !== "function") {
          return interaction.editReply({
            embeds: [createErrorEmbed("Comando /rank não encontrado ou função addXp não disponível.")],
            ephemeral: true
          });
        }

        const member = await interaction.guild.members.fetch(usuario.id).catch(() => null);
        if (!member) {
          return interaction.editReply({
            embeds: [createErrorEmbed("Não foi possível encontrar o membro no servidor.")],
            ephemeral: true
          });
        }

        // Adicionar XP usando a função do rank.js
        const resultado = await rankCommand.addXp(usuario.id, quantidade);
        
        // Aplicar cargos se subiu de nível
        if (resultado.subiuNivel && rankCommand.applyLevelRoles) {
          await rankCommand.applyLevelRoles(member, resultado.nivelAnterior, resultado.novoNivel);
        }

        // Buscar dados atualizados
        const levels = await levelsStore.load();
        const dadosAtuais = levels[usuario.id] || { level: 0, totalXp: 0 };

        const embed = new EmbedBuilder()
          .setTitle("✅ XP Adicionado")
          .setColor("#00ff00")
          .setDescription(`**${quantidade} XP** foram adicionados para ${usuario}`)
          .addFields(
            { name: "📊 Nível Atual", value: `Nível ${dadosAtuais.level}`, inline: true },
            { name: "⭐ XP Total", value: `${dadosAtuais.totalXp || 0} XP`, inline: true },
            { name: "🎯 XP para Próximo", value: `${dadosAtuais.xp || 0}/1000 XP`, inline: true }
          )
          .setFooter({ text: `Ação realizada por ${interaction.user.username}` })
          .setTimestamp();

        if (resultado.subiuNivel) {
          embed.addFields({
            name: "🎉 PARABÉNS!",
            value: `${usuario} subiu para o **Nível ${resultado.novoNivel}**!`,
            inline: false
          });
        }

        await interaction.editReply({ embeds: [embed] });

      } catch (error) {
        console.error("Erro ao dar XP:", error);
        await interaction.editReply({
          embeds: [createErrorEmbed("Ocorreu um erro ao adicionar XP. Verifique o console para mais detalhes.")],
          ephemeral: true
        });
      }
    }

    // ==========================================
    // REMOVER XP
    // ==========================================
    if (sub === "remover_xp") {
      await interaction.deferReply({ ephemeral: true });

      const usuario = interaction.options.getUser("usuario");
      const quantidade = interaction.options.getInteger("quantidade");

      try {
        // Buscar o comando rank para usar suas funções
        const rankCommand = interaction.client.commands.get("rank");
        if (!rankCommand || typeof rankCommand.addXp !== "function") {
          return interaction.editReply({
            embeds: [createErrorEmbed("Comando /rank não encontrado ou função addXp não disponível.")],
            ephemeral: true
          });
        }

        const member = await interaction.guild.members.fetch(usuario.id).catch(() => null);
        if (!member) {
          return interaction.editReply({
            embeds: [createErrorEmbed("Não foi possível encontrar o membro no servidor.")],
            ephemeral: true
          });
        }

        // Buscar dados atuais antes de remover
        const levels = await levelsStore.load();
        const dadosAntes = levels[usuario.id] || { level: 0, totalXp: 0 };

        // Remover XP (usando valor negativo)
        const resultado = await rankCommand.addXp(usuario.id, -Math.abs(quantidade));
        
        // Aplicar cargos (pode remover se caiu de nível)
        if (rankCommand.applyLevelRoles) {
          await rankCommand.applyLevelRoles(member, resultado.nivelAnterior, resultado.novoNivel);
        }

        // Buscar dados atualizados
        const dadosAtuais = levels[usuario.id] || { level: 0, totalXp: 0 };

        const embed = new EmbedBuilder()
          .setTitle("➖ XP Removido")
          .setColor("#ff6600")
          .setDescription(`**${quantidade} XP** foram removidos de ${usuario}`)
          .addFields(
            { name: "📊 Nível Atual", value: `Nível ${dadosAtuais.level}`, inline: true },
            { name: "⭐ XP Total", value: `${Math.max(0, dadosAtuais.totalXp || 0)} XP`, inline: true },
            { name: "📈 XP Anterior", value: `${dadosAntes.totalXp || 0} XP`, inline: true }
          )
          .setFooter({ text: `Ação realizada por ${interaction.user.username}` })
          .setTimestamp();

        if (resultado.novoNivel < resultado.nivelAnterior) {
          embed.addFields({
            name: "📉 Nível Reduzido",
            value: `${usuario} caiu para o **Nível ${resultado.novoNivel}**!`,
            inline: false
          });
        }

        await interaction.editReply({ embeds: [embed] });

      } catch (error) {
        console.error("Erro ao remover XP:", error);
        await interaction.editReply({
          embeds: [createErrorEmbed("Ocorreu um erro ao remover XP. Verifique o console para mais detalhes.")],
          ephemeral: true
        });
      }
    }

    // ==========================================
    // CHECAR CARGOS (Sincronização em massa)
    // ==========================================
    if (sub === "checar_cargos") {
      await interaction.deferReply({ ephemeral: true });

      try {
        // Buscar o comando rank para usar suas funções
        const rankCommand = interaction.client.commands.get("rank");
        if (!rankCommand || typeof rankCommand.getLevelRoleConfig !== "function" || typeof rankCommand.applyLevelRoles !== "function") {
          return interaction.editReply({
            embeds: [createErrorEmbed("Comando /rank não encontrado ou funções necessárias não disponíveis.")],
            ephemeral: true
          });
        }

        // Buscar configuração de cargos e dados dos usuários
        const roleConfig = await rankCommand.getLevelRoleConfig(interaction.guild.id);
        const levels = await levelsStore.load();

        let membrosAtualizados = 0;
        let nivelZeroLimpos = 0;
        let erros = 0;

        // Buscar todos os membros do servidor (ignorando bots)
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setTitle("🔄 Sincronizando Cargos...")
            .setColor("#ffff00")
            .setDescription("Buscando todos os membros do servidor... Isso pode levar um tempo.")
          ]
        });

        const members = await interaction.guild.members.fetch();
        const totalMembros = members.filter(m => !m.user.bot).size;

        // Processar cada membro
        for (const member of members.values()) {
          if (member.user.bot) continue;

          try {
            const userData = levels[member.id] || { level: 0, totalXp: 0 };
            const nivelAtual = userData.level || 0;

            // 🚨 Regra crucial: Se for Nível 0, remover todos os cargos de nível
            if (nivelAtual === 0) {
              const rolesToRemove = Object.values(roleConfig).filter(roleId => member.roles.cache.has(roleId));
              if (rolesToRemove.length > 0) {
                await member.roles.remove(rolesToRemove);
                nivelZeroLimpos++;
              }
            } 
            // Se for Nível 1+, aplicar cargo correto
            else {
              await rankCommand.applyLevelRoles(member, nivelAtual, nivelAtual);
              membrosAtualizados++;
            }
          } catch (error) {
            erros++;
            console.error(`Erro ao processar membro ${member.user.tag}:`, error);
          }
        }

        // Embed de resultado
        const embed = new EmbedBuilder()
          .setTitle("✅ Sincronização Concluída")
          .setColor("#00ff00")
          .setDescription("Sincronização de cargos de nível concluída com sucesso!")
          .addFields(
            { name: "👥 Total de Membros", value: `${totalMembros}`, inline: true },
            { name: "🔄 Membros Atualizados", value: `${membrosAtualizados}`, inline: true },
            { name: "🧹 Nível 0 Limpos", value: `${nivelZeroLimpos}`, inline: true }
          )
          .addFields(
            { name: "⚠️ Erros", value: `${erros}`, inline: true },
            { name: "📊 Taxa de Sucesso", value: `${((totalMembros - erros) / totalMembros * 100).toFixed(1)}%`, inline: true }
          )
          .setFooter({ text: `Sincronização realizada por ${interaction.user.username}` })
          .setTimestamp();

        if (erros > 0) {
          embed.addFields({
            name: "⚠️ Aviso",
            value: "Alguns membros não puderam ser processados devido a erros. Verifique o console para detalhes.",
            inline: false
          });
        }

        await interaction.editReply({ embeds: [embed] });

      } catch (error) {
        console.error("Erro na sincronização de cargos:", error);
        await interaction.editReply({
          embeds: [createErrorEmbed("Ocorreu um erro durante a sincronização. Verifique o console para mais detalhes.")],
          ephemeral: true
        });
      }
    }
  }
};
