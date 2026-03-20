const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");

const { createDataStore } = require("../store/dataStore");
const { logger } = require("../logger");

// Shared data stores — single instances created here and re-exported so that
// voiceStateUpdate.js can access the same in-memory cache via:
//   client.commands.get("tempcall").configStore  /  .activeStore
const configStore = createDataStore("tempcall_config.json");
const activeStore = createDataStore("tempcall_active.json");

// ─────────────────────────────────────────────────────────────────────────────
// Utility: Build the Control Panel message payload
// ─────────────────────────────────────────────────────────────────────────────
function buildControlPanel(channelId, ownerId) {
  const embed = new EmbedBuilder()
    .setTitle("🎙️ Painel de Controle da Call")
    .setColor("#5865F2")
    .setDescription(
      [
        `👑 **Dono:** <@${ownerId}>`,
        "",
        "Use os botões abaixo para gerenciar sua call temporária.",
        "",
        "✏️ **Renomear** — Mude o nome da call",
        "👥 **Limite** — Defina o limite de usuários",
        "🔒 **Trancar** — Impede novos membros de entrar",
        "🔓 **Destrancar** — Libera o acesso novamente",
        "👻 **Fantasma** — Esconde a call *(💎 VIP exclusivo)*",
        "👢 **Expulsar** — Kicka um membro da call",
        "👑 **Reivindicar** — Assuma a posse se o dono saiu",
      ].join("\n")
    )
    .setFooter({ text: "A call é deletada automaticamente quando ficar vazia." });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tempcall_rename")
      .setLabel("Renomear")
      .setEmoji("✏️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("tempcall_limit")
      .setLabel("Limite")
      .setEmoji("👥")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("tempcall_lock")
      .setLabel("Trancar")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("tempcall_unlock")
      .setLabel("Destrancar")
      .setEmoji("🔓")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("tempcall_ghost")
      .setLabel("Fantasma 💎")
      .setEmoji("👻")
      .setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tempcall_kick")
      .setLabel("Expulsar")
      .setEmoji("👢")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("tempcall_claim")
      .setLabel("Reivindicar Posse")
      .setEmoji("👑")
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Slash Command definition
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName("tempcall")
    .setDescription("Sistema de calls temporárias privadas (Join to Create)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("config_geral")
        .setDescription("Configura a categoria, o canal gatilho e o cargo de acesso")
        .addChannelOption((opt) =>
          opt
            .setName("categoria")
            .setDescription("Categoria onde as calls temporárias serão criadas")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName("canal_gatilho")
            .setDescription("Canal de voz que o usuário entra para criar uma call")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true)
        )
        .addRoleOption((opt) =>
          opt
            .setName("cargo_acesso")
            .setDescription(
              "Cargo necessário para usar o sistema (deixe vazio = @everyone)"
            )
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("config_vip")
        .setDescription("Configura as opções VIP do sistema")
        .addBooleanOption((opt) =>
          opt
            .setName("somente_vip")
            .setDescription("Restringir o sistema inteiro apenas para VIPs?")
            .setRequired(true)
        )
        .addRoleOption((opt) =>
          opt
            .setName("cargo_vip")
            .setDescription(
              "Cargo VIP com acesso ao recurso de Fantasma (Ghost)"
            )
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("painel")
        .setDescription("Exibe o painel de instruções do sistema de calls temporárias")
    ),

  // Exposed stores and panel builder so voiceStateUpdate.js can share same instances
  configStore,
  activeStore,
  buildControlPanel,

  // ─────────────────────────────────────────────────────────────────────────
  // /tempcall execute
  // ─────────────────────────────────────────────────────────────────────────
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // ── config_geral ──────────────────────────────────────────────────────
    if (sub === "config_geral") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const categoria = interaction.options.getChannel("categoria");
      const canalGatilho = interaction.options.getChannel("canal_gatilho");
      const cargoAcesso = interaction.options.getRole("cargo_acesso");

      const existing = (await configStore.get(guildId)) || {};
      await configStore.set(guildId, {
        ...existing,
        categoriaId: categoria.id,
        canalGatilhoId: canalGatilho.id,
        cargoAcessoId: cargoAcesso ? cargoAcesso.id : null,
      });

      return interaction.editReply({
        content: [
          "✅ **Configuração geral salva!**",
          `📁 Categoria: <#${categoria.id}>`,
          `🔊 Canal Gatilho: <#${canalGatilho.id}>`,
          `🎭 Cargo de Acesso: ${cargoAcesso ? `<@&${cargoAcesso.id}>` : "@everyone"}`,
        ].join("\n"),
      });
    }

    // ── config_vip ────────────────────────────────────────────────────────
    if (sub === "config_vip") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const somenteVip = interaction.options.getBoolean("somente_vip");
      const cargoVip = interaction.options.getRole("cargo_vip");

      const existing = (await configStore.get(guildId)) || {};
      await configStore.set(guildId, {
        ...existing,
        somenteVip,
        cargoVipId: cargoVip.id,
      });

      return interaction.editReply({
        content: [
          "✅ **Configuração VIP salva!**",
          `🔐 Somente VIP: **${somenteVip ? "Sim" : "Não"}**`,
          `💎 Cargo VIP: <@&${cargoVip.id}>`,
        ].join("\n"),
      });
    }

    // ── painel ────────────────────────────────────────────────────────────
    if (sub === "painel") {
      const embed = new EmbedBuilder()
        .setTitle("🎙️ Sistema de Calls Temporárias")
        .setColor("#5865F2")
        .setDescription(
          [
            "**Como funciona:**",
            "1. Entre no canal de voz configurado como **Gatilho**",
            "2. O bot criará automaticamente uma call privada para você",
            "3. Um **Painel de Controle** aparecerá no chat da sua call",
            "",
            "**Controles disponíveis:**",
            "✏️ **Renomear** — Mude o nome da sua call",
            "👥 **Limite** — Defina o limite de usuários (0 = sem limite)",
            "🔒 **Trancar** — Impede novos membros de entrar",
            "🔓 **Destrancar** — Libera o acesso novamente",
            "👻 **Fantasma** — Esconde a call *(💎 VIP exclusivo)*",
            "👢 **Expulsar** — Kicka um membro da call",
            "👑 **Reivindicar** — Assuma a posse quando o dono sair",
            "",
            "**Limpeza automática:**",
            "A call é deletada automaticamente quando ficar vazia.",
          ].join("\n")
        )
        .setFooter({
          text: "Configure o sistema com /tempcall config_geral e /tempcall config_vip",
        });

      return interaction.reply({ embeds: [embed] });
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Button handler
  // ─────────────────────────────────────────────────────────────────────────
  async handleButton(interaction) {
    const { customId, guildId, channelId } = interaction;

    const config = await configStore.get(guildId);
    if (!config) {
      return interaction.reply({
        content: "❌ O sistema de calls não está configurado neste servidor.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const activeCalls = (await activeStore.get(guildId)) || {};
    const activeCall = activeCalls[channelId];

    if (!activeCall) {
      return interaction.reply({
        content: "❌ Esta interação não pertence a uma call temporária ativa.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const ownerId = activeCall.ownerId;
    const voiceChannel = interaction.guild.channels.cache.get(channelId);

    if (!voiceChannel) {
      return interaction.reply({
        content: "❌ O canal de voz não foi encontrado.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── Rename (opens Modal) ──────────────────────────────────────────────
    if (customId === "tempcall_rename") {
      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "❌ Apenas o dono da call pode renomeá-la.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId("tempcall_rename_modal")
        .setTitle("✏️ Renomear Call");

      const input = new TextInputBuilder()
        .setCustomId("tempcall_rename_input")
        .setLabel("Novo nome da call")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // ── User Limit (opens Modal) ──────────────────────────────────────────
    if (customId === "tempcall_limit") {
      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "❌ Apenas o dono da call pode definir o limite.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId("tempcall_limit_modal")
        .setTitle("👥 Limite de Usuários");

      const input = new TextInputBuilder()
        .setCustomId("tempcall_limit_input")
        .setLabel("Limite (0 = sem limite, máximo 99)")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(2)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // ── Lock ──────────────────────────────────────────────────────────────
    if (customId === "tempcall_lock") {
      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "❌ Apenas o dono da call pode trancá-la.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await voiceChannel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          { Connect: false }
        );
        return interaction.editReply({
          content: "🔒 Call trancada! Nenhum novo membro pode entrar.",
        });
      } catch (e) {
        logger.error({ err: e, channelId }, "[TempCall] Erro ao trancar call");
        return interaction.editReply({ content: "❌ Erro ao trancar a call." });
      }
    }

    // ── Unlock ────────────────────────────────────────────────────────────
    if (customId === "tempcall_unlock") {
      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "❌ Apenas o dono da call pode destrancá-la.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await voiceChannel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          { Connect: true }
        );
        return interaction.editReply({
          content: "🔓 Call destrancada! Membros podem entrar novamente.",
        });
      } catch (e) {
        logger.error({ err: e, channelId }, "[TempCall] Erro ao destrancar call");
        return interaction.editReply({ content: "❌ Erro ao destrancar a call." });
      }
    }

    // ── Ghost / Hide (VIP exclusive) ──────────────────────────────────────
    if (customId === "tempcall_ghost") {
      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "❌ Apenas o dono da call pode usar este recurso.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (config.cargoVipId && !interaction.member.roles.cache.has(config.cargoVipId)) {
        return interaction.reply({
          content: "❌ Este recurso é exclusivo para membros **💎 VIP**.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await voiceChannel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          { ViewChannel: false }
        );
        return interaction.editReply({
          content: "👻 Call escondida! Apenas membros já presentes podem vê-la.",
        });
      } catch (e) {
        logger.error({ err: e, channelId }, "[TempCall] Erro ao esconder call");
        return interaction.editReply({ content: "❌ Erro ao esconder a call." });
      }
    }

    // ── Kick (shows select menu) ──────────────────────────────────────────
    if (customId === "tempcall_kick") {
      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "❌ Apenas o dono da call pode expulsar membros.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const eligible = voiceChannel.members.filter(
        (m) => !m.user.bot && m.id !== ownerId
      );

      if (eligible.size === 0) {
        return interaction.reply({
          content: "❌ Não há membros para expulsar.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("tempcall_kick_select")
        .setPlaceholder("Selecione um membro para expulsar…")
        .setMinValues(1)
        .setMaxValues(1);

      eligible.forEach((m) => {
        selectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(m.displayName)
            .setDescription(`ID: ${m.id}`)
            .setValue(m.id)
        );
      });

      return interaction.reply({
        content: "Selecione o membro que deseja expulsar da call:",
        components: [new ActionRowBuilder().addComponents(selectMenu)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── Claim ownership ───────────────────────────────────────────────────
    if (customId === "tempcall_claim") {
      const ownerStillInChannel = voiceChannel.members.has(ownerId);
      if (ownerStillInChannel) {
        return interaction.reply({
          content:
            "❌ O dono atual ainda está na call. Você só pode reivindicar quando ele sair.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!voiceChannel.members.has(interaction.user.id)) {
        return interaction.reply({
          content: "❌ Você precisa estar na call para reivindicar a posse.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        activeCalls[channelId].ownerId = interaction.user.id;
        await activeStore.set(guildId, activeCalls);

        await voiceChannel.permissionOverwrites.edit(interaction.user.id, {
          ManageChannels: true,
          MoveMembers: true,
        });

        return interaction.editReply({
          content: `👑 Você agora é o dono desta call!`,
        });
      } catch (e) {
        logger.error({ err: e, channelId }, "[TempCall] Erro ao reivindicar posse");
        return interaction.editReply({ content: "❌ Erro ao reivindicar a posse." });
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Select Menu handler
  // ─────────────────────────────────────────────────────────────────────────
  async handleSelectMenu(interaction) {
    if (interaction.customId !== "tempcall_kick_select") return;

    const { guildId, channelId } = interaction;
    const activeCalls = (await activeStore.get(guildId)) || {};
    const activeCall = activeCalls[channelId];

    if (!activeCall) {
      return interaction.reply({
        content: "❌ Call temporária não encontrada.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.user.id !== activeCall.ownerId) {
      return interaction.reply({
        content: "❌ Apenas o dono pode expulsar membros.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetId = interaction.values[0];
    const targetMember = interaction.guild.members.cache.get(targetId);

    if (!targetMember) {
      return interaction.reply({
        content: "❌ Membro não encontrado.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await targetMember.voice.disconnect("Expulso pelo dono da call temporária");
      return interaction.editReply({
        content: `✅ **${targetMember.displayName}** foi expulso da call.`,
      });
    } catch (e) {
      logger.error({ err: e }, "[TempCall] Erro ao expulsar membro");
      return interaction.editReply({ content: "❌ Erro ao expulsar o membro." });
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Modal handler
  // ─────────────────────────────────────────────────────────────────────────
  async handleModal(interaction) {
    const { customId, guildId, channelId } = interaction;

    const activeCalls = (await activeStore.get(guildId)) || {};
    const activeCall = activeCalls[channelId];

    if (!activeCall) {
      return interaction.reply({
        content: "❌ Call temporária não encontrada.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.user.id !== activeCall.ownerId) {
      return interaction.reply({
        content: "❌ Apenas o dono pode usar este controle.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const voiceChannel = interaction.guild.channels.cache.get(channelId);
    if (!voiceChannel) {
      return interaction.reply({
        content: "❌ Canal não encontrado.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── Rename modal ──────────────────────────────────────────────────────
    if (customId === "tempcall_rename_modal") {
      const newName = interaction.fields.getTextInputValue("tempcall_rename_input").trim();

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await voiceChannel.setName(newName);
        return interaction.editReply({ content: `✅ Call renomeada para **${newName}**!` });
      } catch (e) {
        logger.error({ err: e, channelId }, "[TempCall] Erro ao renomear canal");
        return interaction.editReply({ content: "❌ Erro ao renomear a call." });
      }
    }

    // ── User limit modal ──────────────────────────────────────────────────
    if (customId === "tempcall_limit_modal") {
      const limitStr = interaction.fields.getTextInputValue("tempcall_limit_input").trim();
      const limit = parseInt(limitStr, 10);

      if (isNaN(limit) || limit < 0 || limit > 99) {
        return interaction.reply({
          content: "❌ Valor inválido. Use um número entre **0** (sem limite) e **99**.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await voiceChannel.setUserLimit(limit);
        const label = limit === 0 ? "sem limite" : `${limit} usuário(s)`;
        return interaction.editReply({ content: `✅ Limite definido para **${label}**!` });
      } catch (e) {
        logger.error({ err: e, channelId }, "[TempCall] Erro ao definir limite");
        return interaction.editReply({ content: "❌ Erro ao definir o limite." });
      }
    }
  },
};
