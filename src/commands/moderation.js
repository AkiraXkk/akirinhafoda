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
const warnsStore = createDataStore("warns.json");

// ─── Constantes ─────────────────────────────────────────────────────────────
const AUTO_MUTE_DURATION_MS = 1 * 60 * 60 * 1000; // 1 hora
const MAX_MUTE_HOURS = 672; // 28 dias
const INVITE_EXPIRY_SECONDS = 86400; // 24 horas

// ─── HELPER: Gera o Painel de Moderação para um utilizador ──────────────────
async function buildModPanel(guild, user) {
  const member = await guild.members.fetch(user.id).catch(() => null);

  // Buscar warns do utilizador
  const warnData = await warnsStore.get(`${guild.id}_${user.id}`);
  const allWarns = warnData?.historico || [];
  const warnCount = allWarns.length;

  const fields = [
    { name: "👤 Nome", value: user.username, inline: true },
    { name: "🆔 ID", value: user.id, inline: true },
    { name: "⚠️ Warns", value: `${warnCount}`, inline: true },
  ];

  if (member) {
    fields.push({ name: "📅 Entrou em", value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>` : "Desconhecido", inline: true });
    const isMuted = member.isCommunicationDisabled?.() || false;
    fields.push({ name: "🔇 Mutado", value: isMuted ? "Sim" : "Não", inline: true });
  }

  const embed = createEmbed({
    title: `📋 Dossiê de Moderação`,
    description: `Painel de moderação para <@${user.id}>`,
    color: member ? 0x3498db : 0x95a5a6,
    thumbnail: user.displayAvatarURL({ dynamic: true }),
    fields,
    footer: "Moderação | © WDA - Todos os direitos reservados",
  });

  let row;
  if (member) {
    const isMuted = member.isCommunicationDisabled?.() || false;
    row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_panel_btn_WARN_${user.id}`)
        .setLabel("⚠️ Warn")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(isMuted ? `mod_panel_btn_UNMUTE_${user.id}` : `mod_panel_btn_MUTE_${user.id}`)
        .setLabel(isMuted ? "🔊 Unmute" : "🤐 Mute")
        .setStyle(isMuted ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`mod_panel_btn_KICK_${user.id}`)
        .setLabel("🦶 Kick")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`mod_panel_btn_BAN_${user.id}`)
        .setLabel("🔨 Ban")
        .setStyle(ButtonStyle.Danger),
    );
  } else {
    row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_panel_btn_UNBAN_${user.id}`)
        .setLabel("🕊️ Unban")
        .setStyle(ButtonStyle.Success),
    );
  }

  return { embed, row };
}

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
        .addIntegerOption((opt) =>
          opt
            .setName("warn_limit_mute")
            .setDescription("Quantos warns para auto-mute (ex: 3)")
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(false)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("warn_limit_ban")
            .setDescription("Quantos warns para auto-ban (ex: 5)")
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("painel")
        .setDescription("Abre o painel interativo de moderação para um utilizador")
        .addStringOption((opt) =>
          opt
            .setName("alvo")
            .setDescription("ID ou menção do utilizador alvo")
            .setRequired(true)
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
      const warnLimitMute = interaction.options.getInteger("warn_limit_mute");
      const warnLimitBan = interaction.options.getInteger("warn_limit_ban");

      await interaction.deferReply({ ephemeral: true });
      try {
        const existing = await modConfigStore.get(interaction.guild.id) || {};
        await modConfigStore.set(interaction.guild.id, {
          ...existing,
          canal_apelacao: canal.id,
          cargo_mod: cargoMod?.id || existing.cargo_mod || null,
          warn_limit_mute: warnLimitMute ?? existing.warn_limit_mute ?? null,
          warn_limit_ban: warnLimitBan ?? existing.warn_limit_ban ?? null,
        });

        const lines = [
          `**Canal de Apelação:** ${canal}`,
          `**Cargo Mod:** ${cargoMod || existing.cargo_mod || "Não definido"}`,
        ];
        if (warnLimitMute ?? existing.warn_limit_mute) lines.push(`**Warns para Auto-Mute:** ${warnLimitMute ?? existing.warn_limit_mute}`);
        if (warnLimitBan ?? existing.warn_limit_ban) lines.push(`**Warns para Auto-Ban:** ${warnLimitBan ?? existing.warn_limit_ban}`);

        await interaction.editReply({
          embeds: [createSuccessEmbed(`Configuração salva!\n\n${lines.join("\n")}`)],
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

    // PAINEL
    if (sub === "painel") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não tem permissão para usar o painel de moderação.")], ephemeral: true });
      }

      const alvoRaw = interaction.options.getString("alvo");
      // Extrair ID de menção (<@123456>) ou usar diretamente
      const userId = alvoRaw.replace(/[<@!>]/g, "");

      await interaction.deferReply({ ephemeral: true });

      try {
        const user = await interaction.client.users.fetch(userId);
        const { embed, row } = await buildModPanel(interaction.guild, user);

        await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (error) {
        await interaction.editReply({ embeds: [createErrorEmbed("Não foi possível encontrar o utilizador. Verifique o ID ou menção.")] });
      }
    }
  },

  async handleButton(interaction) {
    const { customId } = interaction;

    // ─── Botões de Apelação (DM do utilizador) ─────────────────────────────
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

    // ─── Botões de Julgamento da Staff ──────────────────────────────────────
    if (customId.startsWith("mod_appeal_approve_") || customId.startsWith("mod_appeal_deny_")) {
      return module.exports.handleJudgmentButton(interaction);
    }

    // ─── Botões do Painel de Moderação ──────────────────────────────────────
    if (customId.startsWith("mod_panel_btn_")) {
      // Format: mod_panel_btn_ACAO_USERID
      const parts = customId.replace("mod_panel_btn_", "").split("_");
      const acao = parts[0];
      const userId = parts[1];

      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ embeds: [createErrorEmbed("Você não tem permissão.")], ephemeral: true });
      }

      // UNMUTE – ação direta (sem modal)
      if (acao === "UNMUTE") {
        await interaction.deferUpdate();
        try {
          const member = await interaction.guild.members.fetch(userId).catch(() => null);
          if (!member) return interaction.followUp({ embeds: [createErrorEmbed("Membro não encontrado.")], ephemeral: true });
          await member.timeout(null);

          const logService = interaction.client.services.log;
          if (logService) {
            await logService.log(interaction.guild, {
              title: "🔈 Silenciamento Removido (Painel)",
              description: `O silenciamento de **${member.user.username}** foi removido por **${interaction.user.username}** via Painel.`,
              color: 0x00FF00,
              fields: [
                { name: "👤 Moderador", value: interaction.user.username, inline: true },
                { name: "👤 Usuário", value: member.user.username, inline: true },
              ],
              user: interaction.user,
            });
          }

          // Atualizar o painel
          const user = await interaction.client.users.fetch(userId);
          const { embed, row } = await buildModPanel(interaction.guild, user);
          await interaction.editReply({ embeds: [embed], components: [row] });
        } catch (error) {
          await interaction.followUp({ embeds: [createErrorEmbed("Erro ao remover silenciamento.")], ephemeral: true });
        }
        return;
      }

      // UNBAN – ação direta via modal de motivo
      if (acao === "UNBAN") {
        const modal = new ModalBuilder()
          .setCustomId(`mod_panel_modal_UNBAN_${userId}`)
          .setTitle("🕊️ Desbanir Utilizador");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("motivo")
              .setLabel("Motivo do desbano")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Motivo...")
              .setRequired(false)
              .setMaxLength(500)
          )
        );
        await interaction.showModal(modal);
        return;
      }

      // WARN – modal pedindo motivo
      if (acao === "WARN") {
        const modal = new ModalBuilder()
          .setCustomId(`mod_panel_modal_WARN_${userId}`)
          .setTitle("⚠️ Aplicar Warn");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("motivo")
              .setLabel("Motivo do Warn")
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder("Descreva o motivo do warn...")
              .setRequired(true)
              .setMaxLength(500)
          )
        );
        await interaction.showModal(modal);
        return;
      }

      // MUTE – modal pedindo motivo e tempo
      if (acao === "MUTE") {
        const modal = new ModalBuilder()
          .setCustomId(`mod_panel_modal_MUTE_${userId}`)
          .setTitle("🤐 Silenciar Utilizador");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("motivo")
              .setLabel("Motivo")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Motivo do silenciamento...")
              .setRequired(true)
              .setMaxLength(500)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("horas")
              .setLabel("Duração em horas (1-672)")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Ex: 24")
              .setRequired(true)
              .setMaxLength(3)
          )
        );
        await interaction.showModal(modal);
        return;
      }

      // KICK – modal pedindo motivo
      if (acao === "KICK") {
        const modal = new ModalBuilder()
          .setCustomId(`mod_panel_modal_KICK_${userId}`)
          .setTitle("🦶 Expulsar Utilizador");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("motivo")
              .setLabel("Motivo da expulsão")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Motivo...")
              .setRequired(true)
              .setMaxLength(500)
          )
        );
        await interaction.showModal(modal);
        return;
      }

      // BAN – modal pedindo motivo
      if (acao === "BAN") {
        const modal = new ModalBuilder()
          .setCustomId(`mod_panel_modal_BAN_${userId}`)
          .setTitle("🔨 Banir Utilizador");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("motivo")
              .setLabel("Motivo do banimento")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Motivo...")
              .setRequired(true)
              .setMaxLength(500)
          )
        );
        await interaction.showModal(modal);
        return;
      }
    }
  },

  async handleModal(interaction) {
    const { customId } = interaction;

    // ─── Modal de Apelação (enviada pelo utilizador na DM) ──────────────────
    if (customId.startsWith("mod_appeal_modal_")) {
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
      } catch (error) {
        return interaction.editReply({ embeds: [createErrorEmbed("Erro ao enviar a apelação para a equipa. Tente novamente mais tarde.")] });
      }

      await interaction.editReply({ embeds: [createSuccessEmbed("✅ A tua apelação foi enviada para a equipa! Aguarde o julgamento da staff.")] });
      return;
    }

    // ─── Modais do Painel de Moderação ──────────────────────────────────────
    if (customId.startsWith("mod_panel_modal_")) {
      // Format: mod_panel_modal_ACAO_USERID
      const parts = customId.replace("mod_panel_modal_", "").split("_");
      const acao = parts[0];
      const userId = parts[1];
      const logService = interaction.client.services.log;

      await interaction.deferUpdate();

      try {
        const user = await interaction.client.users.fetch(userId);

        // ── WARN ────────────────────────────────────────────────────────────
        if (acao === "WARN") {
          const motivo = interaction.fields.getTextInputValue("motivo");
          const warnKey = `${interaction.guild.id}_${userId}`;
          const warnData = await warnsStore.get(warnKey);
          const historico = warnData?.historico || [];

          historico.push({
            moderador: interaction.user.id,
            motivo,
            data: Date.now(),
          });
          await warnsStore.set(warnKey, { historico });
          const warnCount = historico.length;

          if (logService) {
            await logService.log(interaction.guild, {
              title: "⚠️ Warn Aplicado (Painel)",
              description: `**${user.username}** recebeu um warn de **${interaction.user.username}** via Painel.`,
              color: 0xFFCC00,
              fields: [
                { name: "👤 Moderador", value: interaction.user.username, inline: true },
                { name: "👤 Usuário", value: user.username, inline: true },
                { name: "⚠️ Total de Warns", value: `${warnCount}`, inline: true },
                { name: "📝 Motivo", value: motivo, inline: false },
              ],
              user: interaction.user,
            });
          }

          // Auto-punição
          const config = await modConfigStore.get(interaction.guild.id) || {};
          const limitBan = config.warn_limit_ban;
          const limitMute = config.warn_limit_mute;

          if (limitBan && warnCount >= limitBan) {
            // Auto-Ban
            try {
              await user.send({
                embeds: [createEmbed({
                  title: "🔨 Você foi banido (Auto-Punição)",
                  description: `Você atingiu **${warnCount} warns** no servidor **${interaction.guild.name}** e foi banido automaticamente.\n\n**Último motivo:** ${motivo}`,
                  color: 0xFF0000,
                  footer: "Moderação | © WDA - Todos os direitos reservados",
                })],
              });
            } catch {}
            await interaction.guild.members.ban(userId, { reason: `Auto-Ban por acúmulo de ${warnCount} Warns` });
            if (logService) {
              await logService.log(interaction.guild, {
                title: "🔨 Auto-Ban por Acúmulo de Warns",
                description: `**${user.username}** foi banido automaticamente após atingir **${warnCount}** warns.`,
                color: 0xFF0000,
                fields: [{ name: "⚠️ Total de Warns", value: `${warnCount}`, inline: true }],
                user: interaction.user,
              });
            }
          } else if (limitMute && warnCount >= limitMute) {
            // Auto-Mute (1h por warn acima do limite)
            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            if (member) {
              await member.timeout(AUTO_MUTE_DURATION_MS, `Auto-Mute por acúmulo de ${warnCount} Warns`);
              if (logService) {
                await logService.log(interaction.guild, {
                  title: "🔇 Auto-Mute por Acúmulo de Warns",
                  description: `**${user.username}** foi silenciado automaticamente por 1h após atingir **${warnCount}** warns.`,
                  color: 0xFF6600,
                  fields: [{ name: "⚠️ Total de Warns", value: `${warnCount}`, inline: true }],
                  user: interaction.user,
                });
              }
            }
          }

          // Atualizar o painel
          const { embed, row } = await buildModPanel(interaction.guild, user);
          await interaction.editReply({ embeds: [embed], components: [row] });
          return;
        }

        // ── MUTE ────────────────────────────────────────────────────────────
        if (acao === "MUTE") {
          const motivo = interaction.fields.getTextInputValue("motivo");
          const horasRaw = interaction.fields.getTextInputValue("horas");
          const horas = parseInt(horasRaw, 10);

          if (isNaN(horas) || horas < 1 || horas > MAX_MUTE_HOURS) {
            return interaction.followUp({ embeds: [createErrorEmbed(`Duração inválida. Informe um número entre 1 e ${MAX_MUTE_HOURS}.`)], ephemeral: true });
          }

          const member = await interaction.guild.members.fetch(userId).catch(() => null);
          if (!member) return interaction.followUp({ embeds: [createErrorEmbed("Membro não encontrado.")], ephemeral: true });

          // Trava de Hierarquia
          const targetHighest = member.roles.highest.position;
          const executorHighest = interaction.member.roles.highest.position;
          if (targetHighest >= executorHighest) {
            return interaction.followUp({ embeds: [createErrorEmbed("Você não pode punir alguém com cargo igual ou superior ao seu.")], ephemeral: true });
          }

          // DM com apelação se >= 24h
          if (horas >= 24) {
            try {
              const dmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`mod_appeal_btn_MUTE_${interaction.guild.id}_${userId}`)
                  .setLabel("📋 Apelar Punição")
                  .setStyle(ButtonStyle.Primary)
              );
              await user.send({
                embeds: [createEmbed({
                  title: "🔇 Você foi silenciado",
                  description: `Você foi silenciado por **${horas} hora(s)** no servidor **${interaction.guild.name}**.\n\n**Motivo:** ${motivo}`,
                  color: 0xFF6600,
                  footer: "Moderação | © WDA - Todos os direitos reservados",
                })],
                components: [dmRow],
              });
            } catch {}
          }

          await member.timeout(horas * 60 * 60 * 1000, motivo);

          if (logService) {
            await logService.log(interaction.guild, {
              title: "🔇 Usuário Silenciado (Painel)",
              description: `**${user.username}** foi silenciado por **${horas}h** por **${interaction.user.username}** via Painel.`,
              color: 0xFF6600,
              fields: [
                { name: "👤 Moderador", value: interaction.user.username, inline: true },
                { name: "👤 Usuário", value: user.username, inline: true },
                { name: "⏱️ Duração", value: `${horas} hora(s)`, inline: true },
                { name: "📝 Motivo", value: motivo, inline: false },
              ],
              user: interaction.user,
            });
          }

          const { embed, row } = await buildModPanel(interaction.guild, user);
          await interaction.editReply({ embeds: [embed], components: [row] });
          return;
        }

        // ── KICK ────────────────────────────────────────────────────────────
        if (acao === "KICK") {
          const motivo = interaction.fields.getTextInputValue("motivo");
          const member = await interaction.guild.members.fetch(userId).catch(() => null);

          if (!member) return interaction.followUp({ embeds: [createErrorEmbed("Membro não encontrado.")], ephemeral: true });
          if (!member.kickable) return interaction.followUp({ embeds: [createErrorEmbed("Eu não posso expulsar este utilizador.")], ephemeral: true });

          // Trava de Hierarquia
          const targetHighest = member.roles.highest.position;
          const executorHighest = interaction.member.roles.highest.position;
          if (targetHighest >= executorHighest) {
            return interaction.followUp({ embeds: [createErrorEmbed("Você não pode punir alguém com cargo igual ou superior ao seu.")], ephemeral: true });
          }

          await member.kick(motivo);

          if (logService) {
            await logService.log(interaction.guild, {
              title: "🦶 Usuário Expulso (Painel)",
              description: `**${user.username}** foi expulso por **${interaction.user.username}** via Painel.`,
              color: 0xFFA500,
              fields: [
                { name: "👤 Moderador", value: interaction.user.username, inline: true },
                { name: "👤 Usuário", value: user.username, inline: true },
                { name: "📝 Motivo", value: motivo, inline: false },
              ],
              user: interaction.user,
            });
          }

          // Após kick, o membro não está mais no servidor → painel com Unban
          const { embed, row } = await buildModPanel(interaction.guild, user);
          await interaction.editReply({ embeds: [embed], components: [row] });
          return;
        }

        // ── BAN ─────────────────────────────────────────────────────────────
        if (acao === "BAN") {
          const motivo = interaction.fields.getTextInputValue("motivo");
          const member = await interaction.guild.members.fetch(userId).catch(() => null);

          if (member) {
            if (!member.bannable) return interaction.followUp({ embeds: [createErrorEmbed("Eu não posso banir este utilizador.")], ephemeral: true });

            // Trava de Hierarquia
            const targetHighest = member.roles.highest.position;
            const executorHighest = interaction.member.roles.highest.position;
            if (targetHighest >= executorHighest) {
              return interaction.followUp({ embeds: [createErrorEmbed("Você não pode punir alguém com cargo igual ou superior ao seu.")], ephemeral: true });
            }
          }

          // DM com apelação antes de banir
          try {
            const dmRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`mod_appeal_btn_BAN_${interaction.guild.id}_${userId}`)
                .setLabel("📋 Apelar Punição")
                .setStyle(ButtonStyle.Primary)
            );
            await user.send({
              embeds: [createEmbed({
                title: "🔨 Você foi banido",
                description: `Você foi banido do servidor **${interaction.guild.name}**.\n\n**Motivo:** ${motivo}\n\nSe acredita que isso foi um erro, clique abaixo para apelar.`,
                color: 0xFF0000,
                footer: "Moderação | © WDA - Todos os direitos reservados",
              })],
              components: [dmRow],
            });
          } catch {}

          await interaction.guild.members.ban(userId, { reason: motivo });

          if (logService) {
            await logService.log(interaction.guild, {
              title: "🔨 Usuário Banido (Painel)",
              description: `**${user.username}** foi banido por **${interaction.user.username}** via Painel.`,
              color: 0xFF0000,
              fields: [
                { name: "👤 Moderador", value: interaction.user.username, inline: true },
                { name: "👤 Usuário", value: user.username, inline: true },
                { name: "📝 Motivo", value: motivo, inline: false },
              ],
              user: interaction.user,
            });
          }

          const { embed, row } = await buildModPanel(interaction.guild, user);
          await interaction.editReply({ embeds: [embed], components: [row] });
          return;
        }

        // ── UNBAN ───────────────────────────────────────────────────────────
        if (acao === "UNBAN") {
          const motivo = interaction.fields.getTextInputValue("motivo") || "Sem motivo especificado";

          await interaction.guild.members.unban(userId, motivo);

          if (logService) {
            await logService.log(interaction.guild, {
              title: "🕊️ Usuário Desbanido (Painel)",
              description: `**${user.username}** foi desbanido por **${interaction.user.username}** via Painel.`,
              color: 0x00FF00,
              fields: [
                { name: "👤 Moderador", value: interaction.user.username, inline: true },
                { name: "👤 Usuário", value: user.username, inline: true },
                { name: "📝 Motivo", value: motivo, inline: false },
              ],
              user: interaction.user,
            });
          }

          const { embed, row } = await buildModPanel(interaction.guild, user);
          await interaction.editReply({ embeds: [embed], components: [row] });
          return;
        }

      } catch (error) {
        await interaction.followUp({ embeds: [createErrorEmbed("Erro ao processar a ação de moderação.")], ephemeral: true });
      }
    }
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
          if (guild) {
            await guild.members.unban(userId, `Apelação aprovada por ${interaction.user.username}`);

            // Criar convite de volta
            if (user) {
              try {
                // Procurar canal público para criar o convite (regras, boas-vindas ou primeiro canal de texto)
                const inviteChannel =
                  guild.rulesChannel ||
                  guild.systemChannel ||
                  guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has("CreateInstantInvite"));

                let inviteLink = "";
                if (inviteChannel) {
                  const invite = await inviteChannel.createInvite({
                    maxAge: INVITE_EXPIRY_SECONDS,
                    maxUses: 1,
                    reason: `Apelação Aprovada por ${interaction.user.username}`,
                  });
                  inviteLink = `\n\nUse este convite para voltar ao servidor: ${invite.url}`;
                }

                await user.send({
                  embeds: [createEmbed({
                    title: "🎉 Apelação Aprovada!",
                    description: `Sua apelação foi **APROVADA** pela nossa equipe! Você foi desbanido.${inviteLink}`,
                    color: 0x00FF00,
                    footer: "Moderação | © WDA - Todos os direitos reservados",
                  })],
                });
              } catch {}
            }
          }
        } else if (tipo === "MUTE") {
          if (guild) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) await member.timeout(null);
          }

          // Notificar via DM
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
              title: "❌ Apelação Recusada",
              description: `Sua apelação foi analisada e **RECUSADA** pela nossa equipe. O banimento será mantido.`,
              color: 0xFF0000,
              footer: "Moderação | © WDA - Todos os direitos reservados",
            })],
          });
        } catch {}
      }

      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("mod_appeal_resolved")
          .setLabel(`❌ Recusado por ${interaction.user.username}`)
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
