const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig } = require("../config/guildConfig");
const { enviarAvaliacaoDM } = require("../utils/avaliacaoDM");
const { logger } = require("../logger");

const panelStore = createDataStore("sejawda_panels.json");
const chatStore = createDataStore("sejawda_chats.json");
const rolesStore = createDataStore("sejawda_roles.json");
const createLocks = new Set();

// IDs Fixos da WDA (Sincronizado com o sistema de tickets)
const CATEGORIA_FECHADOS_ID = "1097361304756433019";
const CARGOS_STAFF_WDA = ["1480452886755278848", "1480452884859453520"];

const AREAS = [
  { label: "Mov Call", value: "mov_call" },
  { label: "Mov Chat", value: "mov_chat" },
  { label: "Eventos", value: "eventos" },
  { label: "Recrutamento", value: "recrutamento" },
  { label: "Acolhimento", value: "acolhimento" },
  { label: "Design", value: "design" },
  { label: "Pastime", value: "passtime" }
];

function getAreaLabel(value) {
  const found = AREAS.find((area) => area.value === value);
  return found ? found.label : value;
}

function getDecorEmoji(interaction, emojiName, fallback) {
  const found = interaction.guild?.emojis?.cache?.find((e) => e.name === emojiName);
  if (!found) return fallback;
  return found.animated ? `<a:${found.name}:${found.id}>` : `<:${found.name}:${found.id}>`;
}

// Gerador de IDs Únicos (Ex: rec001, mig002)
async function getNextSejaId(tipo) {
  const chats = await chatStore.load();
  const counters = chats["counters"] || {};
  const nextCount = (counters[tipo] || 0) + 1;

  await chatStore.update("counters", (data) => ({ ...data, [tipo]: nextCount }));

  const prefix = tipo === "migrado" ? "mig" : "rec";
  return `${prefix}${String(nextCount).padStart(3, "0")}`;
}

function isGlobalStaff(member) {
  return CARGOS_STAFF_WDA.some(roleId => member.roles.cache.has(roleId));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sejawda")
    .setDescription("Gerencia o painel de recrutamento da equipe WDA")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName("painel")
        .setDescription("Envia o painel de recrutamento da equipe WDA")
        .addChannelOption((opt) => opt.setName("canal").setDescription("Canal onde enviar o painel").addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addChannelOption((opt) => opt.setName("categoria").setDescription("Categoria para criar os chats").addChannelTypes(ChannelType.GuildCategory).setRequired(false))
        .addRoleOption((opt) => opt.setName("cargo_equipe").setDescription("Cargo da equipe para acesso aos chats").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName("config")
        .setDescription("Configura o cargo de ping para cada área de recrutamento")
        .addStringOption((opt) =>
          opt.setName("area")
            .setDescription("A área a configurar")
            .setRequired(true)
            .addChoices(
              { name: "Mov Call", value: "mov_call" },
              { name: "Mov Chat", value: "mov_chat" },
              { name: "Eventos", value: "eventos" },
              { name: "Recrutamento", value: "recrutamento" },
              { name: "Acolhimento", value: "acolhimento" },
              { name: "Design", value: "design" },
              { name: "Pastime", value: "passtime" },
              { name: "Migração", value: "migracao" }
            )
        )
        .addRoleOption((opt) =>
          opt.setName("cargo")
            .setDescription("O cargo responsável por esta área")
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ==========================================
    // SUBCOMANDO: CONFIG (Define cargo por área)
    // ==========================================
    if (sub === "config") {
      const area = interaction.options.getString("area");
      const cargo = interaction.options.getRole("cargo");

      await rolesStore.update(interaction.guildId, (data) => ({
        ...(data || {}),
        [area]: cargo.id
      }));

      const areaLabel = area === "migracao" ? "Migração" : getAreaLabel(area);
      return interaction.reply({
        embeds: [createSuccessEmbed(`Cargo <@&${cargo.id}> configurado para a área **${areaLabel}**.`)],
        flags: MessageFlags.Ephemeral
      });
    }

    // ==========================================
    // SUBCOMANDO: PAINEL (Envia o painel ao canal)
    // ==========================================
    const canal = interaction.options.getChannel("canal") || interaction.channel;
    const categoria = interaction.options.getChannel("categoria");
    const cargoEquipe = interaction.options.getRole("cargo_equipe");
    const rainbow = getDecorEmoji(interaction, "urainbowdiamond", "💎");

    // Imagem fixa da WDA
    const imagemFixa = "https://cdn.discordapp.com/attachments/1480545275356381284/1480557207945871430/lUKArBC.png?ex=69b01bd9&is=69aeca59&hm=5db6e8babebe3cd76339d8e57291d3e758ce7588ab2c78944963202f482daabe&";

    const embed = createEmbed({
      title: `${rainbow}  Seja - WDA`,
      description:
        "<a:ylurk:856577527450697778> Tem interesse em participar da equipe WDA?\n" +
        "<a:yestrela:856574415642165328> Selecione **Recrutamento** para entrar em uma área da equipe.\n" +
        "<a:yestrela:856574415642165328> Selecione **Migração** para transferir seu servidor para o nosso suporte e aguarde contato.\n\n" +
        "**Áreas disponíveis para recrutamento:**\n" +
        "<a:y_catt:856598066940215336> Mov Call;\n" +
        "<a:y_catt:856598066940215336> Mov Chat;\n" +
        "<a:y_catt:856598066940215336> Eventos;\n" +
        "<a:y_catt:856598066940215336> Recrutamento.\n" +
        "<a:y_catt:856598066940215336> Acolhimento\n" +
        "<a:y_catt:856598066940215336> Design\n" +
        "<a:y_catt:856598066940215336> Passtime",
      image: imagemFixa,
      color: 0x8e44ad
    });

    const select = new StringSelectMenuBuilder()
      .setCustomId("sejawda_tipo")
      .setPlaceholder("Selecione sua opção")
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel("Recrutamento").setValue("recrutado").setEmoji("🧩"),
        new StringSelectMenuOptionBuilder().setLabel("Migração de servidor").setValue("migrado").setEmoji("🚀")
      );

    const row = new ActionRowBuilder().addComponents(select);
    const panelMessage = await canal.send({ embeds: [embed], components: [row] });

    await panelStore.update(panelMessage.id, () => ({
      guildId: interaction.guildId,
      channelId: canal.id,
      categoryId: categoria?.id || canal.parentId || null,
      staffRoleId: cargoEquipe?.id || null
    }));

    await interaction.reply({ embeds: [createSuccessEmbed(`Painel enviado em ${canal}.`)], flags: MessageFlags.Ephemeral });
  },

  // ==========================================
  // HANDLER DE MENUS
  // ==========================================
  async handleSelectMenu(interaction) {
    if (interaction.customId === "sejawda_tipo") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 

      const tipo = interaction.values[0];
      const rainbow = getDecorEmoji(interaction, "urainbowdiamond", "💎");
      const panels = await panelStore.load();
      const panelConfig = panels[interaction.message.id];

      if (!panelConfig) return interaction.editReply({ embeds: [createErrorEmbed("Esse painel não está configurado.")] });

      const lockKey = `${interaction.guildId}:${interaction.user.id}`;
      if (createLocks.has(lockKey)) return interaction.editReply({ embeds: [createErrorEmbed("Sua solicitação já está sendo processada. Aguarde.")] });
      createLocks.add(lockKey);

      try {
        const chats = await chatStore.load();

        let existingChat = null;
        for (const [id, info] of Object.entries(chats)) {
          if (id === "counters") continue;
          if (info && info.userId === interaction.user.id && info.guildId === interaction.guildId && !info.closedAt) {
            const canalAindaExiste = interaction.guild.channels.cache.get(id);
            if (canalAindaExiste) {
              existingChat = [id, info];
              break;
            } else {
              await chatStore.update(id, (ghostInfo) => ghostInfo ? { ...ghostInfo, closedAt: Date.now() } : null);
            }
          }
        }

        if (existingChat) return interaction.editReply({ embeds: [createErrorEmbed(`Você já possui um chat aberto: <#${existingChat[0]}>`)] });

        const ticketId = await getNextSejaId(tipo);
        const cleanName = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
        const prefixName = tipo === "migrado" ? "migracao" : "recrutamento";

        const channel = await interaction.guild.channels.create({
          name: `${prefixName}-${cleanName}`,
          type: ChannelType.GuildText,
          parent: panelConfig.categoryId || null,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
            { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
          ]
        });

        for (const roleId of CARGOS_STAFF_WDA) {
          const role = interaction.guild.roles.cache.get(roleId);
          if (role) await channel.permissionOverwrites.create(role, { ViewChannel: true, SendMessages: true });
        }

        if (panelConfig.staffRoleId) {
          await channel.permissionOverwrites.create(panelConfig.staffRoleId, { ViewChannel: true, SendMessages: true });
        }

        const areaSelect = new StringSelectMenuBuilder()
          .setCustomId("sejawda_area")
          .setPlaceholder("Selecione a área de interesse")
          .addOptions(...AREAS.map((area) => new StringSelectMenuOptionBuilder().setLabel(area.label).setValue(area.value)));

        const btnAssumir = new ButtonBuilder().setCustomId("sejawda_assumir").setLabel("Assumir").setStyle(ButtonStyle.Success).setEmoji("🙋");
        const btnFechar = new ButtonBuilder().setCustomId("sejawda_close").setLabel("Fechar").setStyle(ButtonStyle.Danger).setEmoji("🔒");

        const rowBtns = new ActionRowBuilder().addComponents(btnAssumir, btnFechar);
        const components = [rowBtns];

        let description = `Tipo selecionado: **${tipo === "migrado" ? "Migração" : "Recrutamento"}**\n`;
        let areaValue = null;

        if (tipo === "migrado") {
          description += "Solicitação de migração registrada. Aguarde o contato da equipe WDA.\n\n🏷️ **Protocolo:** `" + ticketId + "`\n\n⚠️ *Este ticket pode ser encerrado pelo autor, pelo staff responsável ou por um administrador. Tickets sem resposta do autor por 2h serão arquivados automaticamente.*";
          areaValue = "nao_aplicavel";
        } else {
          description += "Por favor, escolha a área que deseja atuar no menu abaixo.\n\n🏷️ **Protocolo:** `" + ticketId + "`\n\n⚠️ *Este ticket pode ser encerrado pelo autor, pelo staff responsável ou por um administrador. Tickets sem resposta do autor por 2h serão arquivados automaticamente.*";
          components.unshift(new ActionRowBuilder().addComponents(areaSelect));
        }

        const msgContent = panelConfig.staffRoleId ? `<@&${panelConfig.staffRoleId}> <@${interaction.user.id}>` : `<@${interaction.user.id}>`;

        await channel.send({
          content: msgContent,
          embeds: [createEmbed({ title: `${rainbow} Solicitação WDA`, description, color: 0x8e44ad })],
          components
        });

        // Ping de área específica para Migração, se configurado
        if (tipo === "migrado") {
          const rolesData = await rolesStore.load();
          const migRoleId = (rolesData[interaction.guildId] || {})["migracao"];
          if (migRoleId) {
            await channel.send(`<@&${migRoleId}> Nova solicitação de migração!`);
          }
        }

        await chatStore.update(channel.id, () => ({
          guildId: interaction.guildId,
          userId: interaction.user.id,
          tipo,
          area: areaValue,
          ticketId: ticketId,
          staffRoleId: panelConfig.staffRoleId || null,
          closedAt: null,
          lastMessageAt: Date.now(), lastMessageBy: "user",
          ping30Sent: false, ping90Sent: false
        }));

        return interaction.editReply({ embeds: [createSuccessEmbed(`Seu chat foi criado: ${channel}`)] });
      } finally {
        createLocks.delete(lockKey);
      }
    }

    if (interaction.customId === "sejawda_area") {
      await interaction.deferUpdate();
      const rainbow = getDecorEmoji(interaction, "urainbowdiamond", "💎");
      const chats = await chatStore.load();
      const chat = chats[interaction.channelId];

      if (!chat || chat.closedAt) return interaction.followUp({ embeds: [createErrorEmbed("Este chat não é uma solicitação ativa.")], flags: MessageFlags.Ephemeral });

      const area = interaction.values[0];
      await chatStore.update(interaction.channelId, (data) => ({ ...data, area }));

      await interaction.message.edit({
        embeds: [
          createEmbed({
            title: `${rainbow} Solicitação WDA`,
            description: `Tipo: **${chat.tipo}**\nÁrea escolhida: **${getAreaLabel(area)}**\n\n🏷️ **Protocolo:** \`${chat.ticketId}\``,
            color: 0x8e44ad
          })
        ],
        components: interaction.message.components
      });

      // Ping do cargo responsável pela área escolhida
      const rolesData = await rolesStore.load();
      const areaRoleId = (rolesData[interaction.guildId] || {})[area];
      if (areaRoleId) {
        await interaction.channel.send(`<@&${areaRoleId}> Nova solicitação de recrutamento na área **${getAreaLabel(area)}** por ${interaction.user}!`);
      }
    }

    // Handler do motivo de fechamento da solicitação
    if (interaction.customId === "motivo_fechar_sejawda") {
      const motivo = interaction.values[0];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const chats = await chatStore.load();
      const chat = chats[interaction.channelId];
      if (!chat || chat.closedAt) {
        return interaction.editReply({ embeds: [createErrorEmbed("Esta solicitação já foi encerrada ou não é válida.")] });
      }

      const canal = interaction.channel;

      try {
        await canal.permissionOverwrites.edit(chat.userId, { ViewChannel: false });
        const memberCreator = await interaction.guild.members.fetch(chat.userId).catch(() => null);
        const username = memberCreator ? memberCreator.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "-") : "usuario";

        await canal.setName(`fechado-${username}-${chat.ticketId}`);
        await canal.setParent(CATEGORIA_FECHADOS_ID, { lockPermissions: false });
      } catch (e) {
        logger.warn({ err: e, channelId: canal.id }, "[sejawda] Permissões insuficientes para renomear/mover o canal.");
      }

      await chatStore.update(interaction.channelId, (info) => (info ? { ...info, closedAt: Date.now() } : null));

      const embedArquivado = createEmbed({
        title: "🔒 Solicitação Arquivada",
        description: `O membro não possui mais acesso a este canal.\n📋 **Motivo:** ${motivo}\n\nEquipe: Quando não for mais necessário manter o histórico, clique abaixo para excluir definitivamente.`,
        color: 0x95a5a6
      });

      const rowAdmin = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("sejawda_delete").setLabel("Deletar Canal").setStyle(ButtonStyle.Danger).setEmoji("🗑️"));
      await canal.send({ embeds: [embedArquivado], components: [rowAdmin] });
      await interaction.editReply({ content: "✅ Solicitação arquivada com sucesso!" });

      // NPS: Enviar avaliação de atendimento ao usuário via DM
      // Só envia se quem fechou NÃO é o autor do ticket
      if (interaction.user.id !== chat.userId) {
        try {
          const userToRate = await interaction.client.users.fetch(chat.userId).catch(() => null);
          if (userToRate) {
            await enviarAvaliacaoDM(userToRate, interaction.user.id, interaction.guildId);
          }
        } catch (npsErr) {
          logger.warn({ err: npsErr }, "[sejawda] Não foi possível enviar DM de avaliação NPS ao usuário");
        }
      }
    }
  },

  // ==========================================
  // HANDLER DE BOTÕES
  // ==========================================
  async handleButton(interaction) {
    // ASSUMIR TICKET
    if (interaction.customId === "sejawda_assumir") {
      await interaction.deferUpdate().catch(() => {});

      const chats = await chatStore.load();
      const chat = chats[interaction.channelId];

      if (!chat || chat.closedAt) return interaction.followUp({ embeds: [createErrorEmbed("Este chat já foi encerrado ou não é válido.")], flags: MessageFlags.Ephemeral });

      const hasStaffRole = chat.staffRoleId && interaction.member?.roles?.cache?.has(chat.staffRoleId);
      const isGlobal = isGlobalStaff(interaction.member);

      // Bloqueia o autor do ticket de assumir o próprio ticket
      if (chat.userId === interaction.user.id) {
        return interaction.followUp({ embeds: [createErrorEmbed("❌ Você não pode assumir seu próprio ticket.")], flags: MessageFlags.Ephemeral });
      }

      if (!isGlobal && !hasStaffRole) {
        return interaction.followUp({ embeds: [createErrorEmbed("Apenas membros da equipe podem assumir solicitações.")], flags: MessageFlags.Ephemeral });
      }

      // Salva quem assumiu o ticket
      await chatStore.update(interaction.channelId, (info) => (info ? { ...info, assumedBy: interaction.user.id } : null));

      const newComponents = interaction.message.components.map(row => {
        const newRow = new ActionRowBuilder();
        row.components.forEach(comp => {
          if (comp.customId !== "sejawda_assumir") newRow.addComponents(comp);
        });
        return newRow;
      }).filter(row => row.components.length > 0);

      await interaction.message.edit({ components: newComponents });

      await interaction.followUp({ content: `🫂 Atendimento Iniciado por ${interaction.user}` });
      return;
    }

    // FECHAR TICKET — Mostra menu de motivos
    if (interaction.customId === "sejawda_close") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

      const chats = await chatStore.load();
      const chat = chats[interaction.channelId];

      if (!chat || chat.closedAt) return interaction.editReply({ embeds: [createErrorEmbed("Este chat já foi encerrado ou não é válido.")] });

      // Permissão para fechar: autor do ticket, staff que assumiu, ou ManageGuild
      const isAuthor = chat.userId === interaction.user.id;
      const isAssumer = chat.assumedBy === interaction.user.id;
      const hasManageGuild = interaction.member.permissions.has("ManageGuild");

      if (!isAuthor && !isAssumer && !hasManageGuild) {
        return interaction.editReply({ embeds: [createErrorEmbed("Apenas o autor, o staff responsável ou um administrador pode fechar esta solicitação.")] });
      }

      if (chat.tipo !== "migrado" && !chat.area) {
        return interaction.editReply({ embeds: [createErrorEmbed("Você precisa escolher uma área no menu antes de finalizar a solicitação.")] });
      }

      const motivoMenu = new StringSelectMenuBuilder()
        .setCustomId("motivo_fechar_sejawda")
        .setPlaceholder("Selecione o motivo do fechamento...")
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel("Concluído").setValue("Concluído").setEmoji("✅"),
          new StringSelectMenuOptionBuilder().setLabel("Inatividade do Usuário").setValue("Inatividade do Usuário").setEmoji("⏰"),
          new StringSelectMenuOptionBuilder().setLabel("Troll/Spam").setValue("Troll/Spam").setEmoji("🚫"),
          new StringSelectMenuOptionBuilder().setLabel("Resolvido em Call").setValue("Resolvido em Call").setEmoji("📞")
        );

      return interaction.editReply({
        embeds: [createEmbed({ title: "🔒 Fechar Solicitação", description: "Selecione o motivo do fechamento abaixo:", color: 0xe74c3c })],
        components: [new ActionRowBuilder().addComponents(motivoMenu)],
      });
    }

    // DELETAR TICKET PERMANENTEMENTE
    if (interaction.customId === "sejawda_delete") {
      await interaction.deferReply().catch(() => {});

      const chats = await chatStore.load();
      const chat = chats[interaction.channelId];

      if (!chat || chat.closedAt) return interaction.editReply({ embeds: [createErrorEmbed("Este chat já foi encerrado ou não é válido.")] });

      const isGlobal = isGlobalStaff(interaction.member);
      if (!isGlobal) return interaction.editReply({ embeds: [createErrorEmbed("Apenas a Liderança pode deletar o histórico de solicitações.")] });

      await interaction.editReply({ content: "💥 O canal será destruído em 5 segundos..." });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
  }
};