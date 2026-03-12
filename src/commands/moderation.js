const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

const modConfigStore = createDataStore("mod_config.json");
const modAppealsStore = createDataStore("mod_appeals.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Comandos de moderação")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
      sub
        .setName("clear")
        .setDescription("Limpa mensagens do chat")
        .addIntegerOption((opt) =>
          opt
            .setName("quantidade")
            .setDescription("Número de mensagens para apagar (1-100)")
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("ban")
        .setDescription("Bane um usuário do servidor")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário a ser banido").setRequired(true))
        .addStringOption((opt) => opt.setName("motivo").setDescription("Motivo do banimento").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("kick")
        .setDescription("Expulsa um usuário do servidor")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário a ser expulso").setRequired(true))
        .addStringOption((opt) => opt.setName("motivo").setDescription("Motivo da expulsão").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("lock")
        .setDescription("Tranca o canal atual para que membros não possam falar")
    )
    .addSubcommand((sub) =>
      sub
        .setName("unlock")
        .setDescription("Destranca o canal atual")
    )
    .addSubcommand((sub) =>
      sub
        .setName("mute")
        .setDescription("Silencia um usuário temporariamente")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário a ser silenciado").setRequired(true))
        .addIntegerOption((opt) =>
          opt
            .setName("horas")
            .setDescription("Duração do silenciamento em horas (1-672)")
            .setMinValue(1)
            .setMaxValue(672)
            .setRequired(true)
        )
        .addStringOption((opt) => opt.setName("motivo").setDescription("Motivo do silenciamento").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("unmute")
        .setDescription("Remove o silenciamento de um usuário")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário a ter o silenciamento removido").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Configura o sistema de moderação (apenas administradores)")
        .addChannelOption((opt) =>
          opt
            .setName("canal_apelacao")
            .setDescription("Canal onde as apelações serão enviadas")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption((opt) =>
          opt
            .setName("cargo_mod")
            .setDescription("Cargo de moderação (opcional)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("unban")
        .setDescription("Desbane um utilizador")
        .addStringOption((opt) =>
          opt
            .setName("id_utilizador")
            .setDescription("ID do utilizador")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("motivo")
            .setDescription("Motivo")
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const logService = interaction.client.services.log;

    // CLEAR
    if (sub === "clear") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não tem permissão para gerenciar mensagens.")], ephemeral: true });
      }

      const amount = interaction.options.getInteger("quantidade");
      
      await interaction.deferReply({ ephemeral: true });
      
      try {
        const deleted = await interaction.channel.bulkDelete(amount, true);
        
        // Log da ação
        if (logService) {
          await logService.log(interaction.guild, {
            title: "🧹 Mensagens Apagadas",
            description: `**${interaction.user.username}** apagou **${deleted.size}** mensagens em **${interaction.channel.name}**.`,
            color: 0x3498db,
            fields: [
              { name: "👤 Moderador", value: interaction.user.username, inline: true },
              { name: "💬 Canal", value: interaction.channel.name, inline: true },
              { name: "📊 Quantidade", value: `${deleted.size} mensagens`, inline: true }
            ],
            user: interaction.user
          });
        }

        await interaction.editReply({ 
            embeds: [createSuccessEmbed(`Foram apagadas **${deleted.size}** mensagens com sucesso.`)] 
        });
      } catch (error) {
        await interaction.editReply({ 
            embeds: [createErrorEmbed("Erro ao apagar mensagens. Elas podem ser muito antigas (mais de 14 dias).")] 
        });
      }
    }

    // BAN
    if (sub === "ban") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não tem permissão para banir membros.")], ephemeral: true });
      }

      const user = interaction.options.getUser("usuario");
      const reason = interaction.options.getString("motivo") || "Sem motivo especificado";

      // Trava de Auto-Punição
      if (user.id === interaction.user.id) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não pode punir a si mesmo.")], ephemeral: true });
      }

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      if (member) {
        if (!member.bannable) {
          return interaction.reply({ embeds: [createErrorEmbed("Eu não posso banir este usuário (ele pode ter um cargo maior que o meu).")], ephemeral: true });
        }

        // Trava de Hierarquia
        const targetHighest = member.roles.highest.position;
        const executorHighest = interaction.member.roles.highest.position;
        if (targetHighest >= executorHighest) {
          return interaction.reply({ embeds: [createErrorEmbed("Você não pode punir alguém com cargo igual ou superior ao seu.")], ephemeral: true });
        }
      }

      await interaction.deferReply();

      // Enviar DM com botão de apelação ANTES de banir
      try {
        const dmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`mod_appeal_btn_BAN_${interaction.guild.id}_${user.id}`)
            .setLabel("📋 Apelar Punição")
            .setStyle(ButtonStyle.Primary)
        );
        await user.send({
          embeds: [createEmbed({
            title: "🔨 Você foi banido",
            description: `Você foi banido do servidor **${interaction.guild.name}**.\n\n**Motivo:** ${reason}\n\nSe acredita que isso foi um erro, clique abaixo para apelar.`,
            color: 0xFF0000,
            footer: "Moderação | © WDA - Todos os direitos reservados",
          })],
          components: [dmRow],
        });
      } catch {}

      try {
        await interaction.guild.members.ban(user.id, { reason });
        
        // Log da ação
        if (logService) {
          await logService.log(interaction.guild, {
            title: "🔨 Usuário Banido",
            description: `**${user.username}** foi banido por **${interaction.user.username}**.`,
            color: 0xFF0000,
            fields: [
              { name: "👤 Moderador", value: interaction.user.username, inline: true },
              { name: "👤 Usuário", value: user.username, inline: true },
              { name: "📝 Motivo", value: reason, inline: false }
            ],
            user: interaction.user
          });
        }

        await interaction.editReply({ 
            embeds: [createEmbed({
                title: "🔨 Usuário Banido",
                description: `**${user.username}** foi banido com sucesso.`,
                fields: [{ name: "Motivo", value: reason }],
                color: 0xFF0000 // Red
            })] 
        });
      } catch (error) {
        await interaction.editReply({ embeds: [createErrorEmbed("Ocorreu um erro ao tentar banir o usuário.")] });
      }
    }

    // KICK
    if (sub === "kick") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não tem permissão para expulsar membros.")], ephemeral: true });
      }

      const user = interaction.options.getUser("usuario");
      const reason = interaction.options.getString("motivo") || "Sem motivo especificado";

      // Trava de Auto-Punição
      if (user.id === interaction.user.id) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não pode punir a si mesmo.")], ephemeral: true });
      }

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        return interaction.reply({ embeds: [createErrorEmbed("Usuário não encontrado no servidor.")], ephemeral: true });
      }

      if (!member.kickable) {
        return interaction.reply({ embeds: [createErrorEmbed("Eu não posso expulsar este usuário.")], ephemeral: true });
      }

      // Trava de Hierarquia
      const targetHighest = member.roles.highest.position;
      const executorHighest = interaction.member.roles.highest.position;
      if (targetHighest >= executorHighest) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não pode punir alguém com cargo igual ou superior ao seu.")], ephemeral: true });
      }

      await interaction.deferReply();
      try {
        await member.kick(reason);
        
        // Log da ação
        if (logService) {
          await logService.log(interaction.guild, {
            title: "🦶 Usuário Expulso",
            description: `**${user.username}** foi expulso por **${interaction.user.username}**.`,
            color: 0xFFA500,
            fields: [
              { name: "👤 Moderador", value: interaction.user.username, inline: true },
              { name: "👤 Usuário", value: user.username, inline: true },
              { name: "📝 Motivo", value: reason, inline: false }
            ],
            user: interaction.user
          });
        }

        await interaction.editReply({ 
            embeds: [createEmbed({
                title: "🦶 Usuário Expulso",
                description: `**${user.username}** foi expulso com sucesso.`,
                fields: [{ name: "Motivo", value: reason }],
                color: 0xFFA500 // Orange
            })] 
        });
      } catch (error) {
        await interaction.editReply({ embeds: [createErrorEmbed("Ocorreu um erro ao tentar expulsar o usuário.")] });
      }
    }

    // LOCK
    if (sub === "lock") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não tem permissão para gerenciar canais.")], ephemeral: true });
      }

      await interaction.deferReply();
      try {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
          SendMessages: false
        });
        await interaction.editReply({ embeds: [createSuccessEmbed("🔒 O canal foi trancado.")] });
      } catch (error) {
        await interaction.editReply({ embeds: [createErrorEmbed("Erro ao trancar o canal. Verifique minhas permissões.")] });
      }
    }

    // UNLOCK
    if (sub === "unlock") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não tem permissão para gerenciar canais.")], ephemeral: true });
      }

      await interaction.deferReply();
      try {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
          SendMessages: null
        });
        await interaction.editReply({ embeds: [createSuccessEmbed("🔓 O canal foi destrancado.")] });
      } catch (error) {
        await interaction.editReply({ embeds: [createErrorEmbed("Erro ao destrancar o canal. Verifique minhas permissões.")] });
      }
    }

    // MUTE
    if (sub === "mute") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não tem permissão para silenciar membros.")], ephemeral: true });
      }

      const user = interaction.options.getUser("usuario");
      const horas = interaction.options.getInteger("horas");
      const reason = interaction.options.getString("motivo") || "Sem motivo especificado";

      // Trava de Auto-Punição
      if (user.id === interaction.user.id) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não pode punir a si mesmo.")], ephemeral: true });
      }

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        return interaction.reply({ embeds: [createErrorEmbed("Usuário não encontrado no servidor.")], ephemeral: true });
      }

      // Trava de Hierarquia
      const targetHighest = member.roles.highest.position;
      const executorHighest = interaction.member.roles.highest.position;
      if (targetHighest >= executorHighest) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não pode punir alguém com cargo igual ou superior ao seu.")], ephemeral: true });
      }

      await interaction.deferReply();

      // Enviar DM com botão de apelação se >= 24 horas
      if (horas >= 24) {
        try {
          const dmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`mod_appeal_btn_MUTE_${interaction.guild.id}_${user.id}`)
              .setLabel("📋 Apelar Punição")
              .setStyle(ButtonStyle.Primary)
          );
          await user.send({
            embeds: [createEmbed({
              title: "🔇 Você foi silenciado",
              description: `Você foi silenciado por **${horas} hora(s)** no servidor **${interaction.guild.name}**.\n\n**Motivo:** ${reason}\n\nSe acredita que isso foi um erro, clique abaixo para apelar.`,
              color: 0xFF6600,
              footer: "Moderação | © WDA - Todos os direitos reservados",
            })],
            components: [dmRow],
          });
        } catch {}
      }

      try {
        await member.timeout(horas * 60 * 60 * 1000, reason);

        if (logService) {
          await logService.log(interaction.guild, {
            title: "🔇 Usuário Silenciado",
            description: `**${user.username}** foi silenciado por **${horas}h** por **${interaction.user.username}**.`,
            color: 0xFF6600,
            fields: [
              { name: "👤 Moderador", value: interaction.user.username, inline: true },
              { name: "👤 Usuário", value: user.username, inline: true },
              { name: "⏱️ Duração", value: `${horas} hora(s)`, inline: true },
              { name: "📝 Motivo", value: reason, inline: false },
            ],
            user: interaction.user,
          });
        }

        await interaction.editReply({
          embeds: [createEmbed({
            title: "🔇 Usuário Silenciado",
            description: `**${user.username}** foi silenciado por **${horas} hora(s)**.`,
            fields: [{ name: "Motivo", value: reason }],
            color: 0xFF6600,
          })],
        });
      } catch (error) {
        await interaction.editReply({ embeds: [createErrorEmbed("Ocorreu um erro ao tentar silenciar o usuário.")] });
      }
    }

    // UNMUTE
    if (sub === "unmute") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não tem permissão para remover silenciamentos.")], ephemeral: true });
      }

      const user = interaction.options.getUser("usuario");
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        return interaction.reply({ embeds: [createErrorEmbed("Usuário não encontrado no servidor.")], ephemeral: true });
      }

      await interaction.deferReply();
      try {
        await member.timeout(null);

        if (logService) {
          await logService.log(interaction.guild, {
            title: "🔈 Silenciamento Removido",
            description: `O silenciamento de **${user.username}** foi removido por **${interaction.user.username}**.`,
            color: 0x00FF00,
            fields: [
              { name: "👤 Moderador", value: interaction.user.username, inline: true },
              { name: "👤 Usuário", value: user.username, inline: true },
            ],
            user: interaction.user,
          });
        }

        await interaction.editReply({
          embeds: [createSuccessEmbed(`O silenciamento de **${user.username}** foi removido com sucesso.`)],
        });
      } catch (error) {
        await interaction.editReply({ embeds: [createErrorEmbed("Ocorreu um erro ao remover o silenciamento.")] });
      }
    }

    // CONFIG
    if (sub === "config") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ embeds: [createErrorEmbed("Apenas administradores podem configurar o sistema de moderação.")], ephemeral: true });
      }

      const canal = interaction.options.getChannel("canal_apelacao");
      const cargoMod = interaction.options.getRole("cargo_mod");

      await interaction.deferReply({ ephemeral: true });
      try {
        await modConfigStore.set(interaction.guild.id, {
          canal_apelacao: canal.id,
          cargo_mod: cargoMod?.id || null,
        });

        await interaction.editReply({
          embeds: [createSuccessEmbed(`Configuração salva!\n\n**Canal de Apelação:** ${canal}\n**Cargo Mod:** ${cargoMod || "Não definido"}`)],
        });
      } catch (error) {
        await interaction.editReply({ embeds: [createErrorEmbed("Erro ao salvar configuração.")] });
      }
    }

    // UNBAN
    if (sub === "unban") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        const config = await modConfigStore.get(interaction.guild.id);
        const cargoMod = config?.cargo_mod;
        if (!cargoMod || !interaction.member.roles.cache.has(cargoMod)) {
          return interaction.reply({ embeds: [createErrorEmbed("Você não tem permissão para desbanir membros.")], ephemeral: true });
        }
      }

      const idUtilizador = interaction.options.getString("id_utilizador");
      const motivo = interaction.options.getString("motivo") || "Sem motivo especificado";

      await interaction.deferReply();

      try {
        await interaction.guild.members.unban(idUtilizador, motivo);

        if (logService) {
          const user = await interaction.client.users.fetch(idUtilizador).catch(() => null);
          await logService.log(interaction.guild, {
            title: "🔓 Usuário Desbanido",
            description: `**${user?.username || idUtilizador}** foi desbanido por **${interaction.user.username}**.`,
            color: 0x00FF00,
            fields: [
              { name: "👤 Moderador", value: interaction.user.username, inline: true },
              { name: "👤 Usuário", value: user?.username || idUtilizador, inline: true },
              { name: "📝 Motivo", value: motivo, inline: false },
            ],
            user: interaction.user,
          });
        }

        await interaction.editReply({
          embeds: [createSuccessEmbed(`O utilizador **${idUtilizador}** foi desbanido com sucesso.\n\n**Motivo:** ${motivo}`)],
        });
      } catch (error) {
        await interaction.editReply({ embeds: [createErrorEmbed("Erro ao desbanir o utilizador. Verifique se o ID é válido e se o utilizador está banido.")] });
      }
    }
  },

  async handleButton(interaction) {
    const { customId } = interaction;

    if (customId.startsWith("mod_appeal_btn_")) {
      // Format: mod_appeal_btn_TYPE_guildId_userId
      const parts = customId.split("_");
      if (parts.length < 6) return;
      const tipo = parts[3]; // BAN ou MUTE
      const guildId = parts[4];
      const userId = parts[5];

      const modal = new ModalBuilder()
        .setCustomId(`mod_appeal_modal_${tipo}_${guildId}_${userId}`)
        .setTitle("📋 Formulário de Apelação");

      const defesa = new TextInputBuilder()
        .setCustomId("defesa")
        .setLabel("Sua Defesa")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Explique por que você acredita que a punição é injusta...")
        .setRequired(true)
        .setMaxLength(1000);

      modal.addComponents(new ActionRowBuilder().addComponents(defesa));
      await interaction.showModal(modal);
      return;
    }

    if (customId.startsWith("mod_appeal_approve_") || customId.startsWith("mod_appeal_deny_")) {
      return module.exports.handleJudgmentButton(interaction);
    }
  },

  async handleModal(interaction) {
    const { customId } = interaction;

    if (!customId.startsWith("mod_appeal_modal_")) return;

    // Format: mod_appeal_modal_TYPE_guildId_userId
    const parts = customId.split("_");
    if (parts.length < 6) return;
    const tipo = parts[3]; // BAN ou MUTE
    const guildId = parts[4];
    const userId = parts[5];
    const defesa = interaction.fields.getTextInputValue("defesa");

    await interaction.deferReply({ ephemeral: true });

    const config = await modConfigStore.get(guildId);
    const appealChannelId = config?.canal_apelacao;

    if (!appealChannelId) {
      return interaction.editReply({ embeds: [createErrorEmbed("Canal de apelações não configurado. Contate um administrador.")] });
    }

    const channel = await interaction.client.channels.fetch(appealChannelId).catch(() => null);
    if (!channel) {
      return interaction.editReply({ embeds: [createErrorEmbed("Canal de apelações não encontrado.")] });
    }

    const user = await interaction.client.users.fetch(userId).catch(() => null);
    const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);

    const appealId = `${Date.now()}`;
    await modAppealsStore.set(appealId, {
      tipo,
      userId,
      defesa,
      guildId,
      createdAt: Date.now(),
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_appeal_approve_${tipo}_${guildId}_${userId}`)
        .setLabel("✅ Aprovar Apelação")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`mod_appeal_deny_${tipo}_${guildId}_${userId}`)
        .setLabel("❌ Negar Apelação")
        .setStyle(ButtonStyle.Danger)
    );

    try {
      await channel.send({
        embeds: [createEmbed({
          title: `📋 Nova Apelação de ${tipo}`,
          description: `**Usuário:** ${user ? `<@${userId}> (${user.username})` : userId}\n**Tipo de Punição:** ${tipo}\n**Servidor:** ${guild?.name || guildId}\n\n**Defesa:**\n${defesa}`,
          color: tipo === "BAN" ? 0xFF0000 : 0xFF6600,
          footer: "Moderação | © WDA - Todos os direitos reservados",
        })],
        components: [row],
      });
    } catch {
      return interaction.editReply({ embeds: [createErrorEmbed("Erro ao enviar a apelação para a equipa. Tente novamente mais tarde.")] });
    }

    await interaction.editReply({ embeds: [createSuccessEmbed("✅ A tua apelação foi enviada para a equipa! Aguarde o julgamento da staff.")] });
  },

  async handleJudgmentButton(interaction) {
    const { customId } = interaction;

    await interaction.deferUpdate();

    if (customId.startsWith("mod_appeal_approve_")) {
      // Format: mod_appeal_approve_TYPE_guildId_userId
      const parts = customId.split("_");
      if (parts.length < 6) return;
      const tipo = parts[3]; // BAN ou MUTE
      const guildId = parts[4];
      const userId = parts[5];

      const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
      const user = await interaction.client.users.fetch(userId).catch(() => null);

      try {
        if (tipo === "BAN") {
          if (guild) await guild.members.unban(userId, `Apelação aprovada por ${interaction.user.username}`);
        } else if (tipo === "MUTE") {
          if (guild) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) await member.timeout(null);
          }
        }

        // Notificar usuário via DM
        if (user) {
          try {
            await user.send({
              embeds: [createEmbed({
                title: "✅ Apelação Aprovada",
                description: `Sua apelação de **${tipo}** foi **aprovada** pela staff!\n\nSua punição foi revertida.`,
                color: 0x00FF00,
                footer: "Moderação | © WDA - Todos os direitos reservados",
              })],
            });
          } catch {}
        }

        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("mod_appeal_resolved")
            .setLabel(`✅ Aprovado por ${interaction.user.username}`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(true)
        );
        const originalEmbed = interaction.message.embeds[0];
        const updatedEmbed = originalEmbed
          ? EmbedBuilder.from(originalEmbed).setColor(0x00FF00)
          : null;
        await interaction.editReply({
          embeds: updatedEmbed ? [updatedEmbed] : [],
          components: [disabledRow],
        });
      } catch (error) {
        await interaction.followUp({ embeds: [createErrorEmbed("Erro ao processar a apelação.")], ephemeral: true });
      }
    } else if (customId.startsWith("mod_appeal_deny_")) {
      // Format: mod_appeal_deny_TYPE_guildId_userId
      const parts = customId.split("_");
      if (parts.length < 6) return;
      const userId = parts[5];

      const user = await interaction.client.users.fetch(userId).catch(() => null);

      // Notificar usuário via DM
      if (user) {
        try {
          await user.send({
            embeds: [createEmbed({
              title: "❌ Apelação Negada",
              description: `Sua apelação foi **negada** pela staff.\n\nA punição será mantida.`,
              color: 0xFF0000,
              footer: "Moderação | © WDA - Todos os direitos reservados",
            })],
          });
        } catch {}
      }

      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("mod_appeal_resolved")
          .setLabel(`❌ Negado por ${interaction.user.username}`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );
      const originalEmbed = interaction.message.embeds[0];
      const updatedEmbed = originalEmbed
        ? EmbedBuilder.from(originalEmbed).setColor(0xFF0000)
        : null;
      await interaction.editReply({
        embeds: updatedEmbed ? [updatedEmbed] : [],
        components: [disabledRow],
      });
    }
  },
};
