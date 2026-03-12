const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
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
        ephemeral: true
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

    await interaction.reply({ embeds: [createSuccessEmbed(`Painel enviado em ${canal}.`)], ephemeral: true });
  },

  // ==========================================
  // HANDLER DE MENUS
  // ==========================================
  async handleSelectMenu(interaction) {
    if (interaction.customId === "sejawda_tipo") {
      await interaction.deferReply({ ephemeral: true }); 

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
          description += "Solicitação de migração registrada. Aguarde o contato da equipe WDA.\n\n🏷️ **Protocolo:** `" + ticketId + "`";
          areaValue = "nao_aplicavel";
        } else {
          description += "Por favor, escolha a área que deseja atuar no menu abaixo.\n\n🏷️ **Protocolo:** `" + ticketId + "`";
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
          closedAt: null
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

      if (!chat || chat.closedAt) return interaction.followUp({ embeds: [createErrorEmbed("Este chat não é uma solicitação ativa.")], ephemeral: true });

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
  },

  // ==========================================
  // HANDLER DE BOTÕES
  // ==========================================
  async handleButton(interaction) {
    const chats = await chatStore.load();
    const chat = chats[interaction.channelId];

    if (!chat || chat.closedAt) return interaction.reply({ embeds: [createErrorEmbed("Este chat já foi encerrado ou não é válido.")], ephemeral: true });

    const hasStaffRole = chat.staffRoleId && interaction.member?.roles?.cache?.has(chat.staffRoleId);
    const isGlobal = isGlobalStaff(interaction.member);

    // ASSUMIR TICKET
    if (interaction.customId === "sejawda_assumir") {
      if (!isGlobal && !hasStaffRole) {
        return interaction.reply({ embeds: [createErrorEmbed("Apenas membros da equipe podem assumir solicitações.")], ephemeral: true });
      }

      await interaction.deferUpdate();

      const newComponents = interaction.message.components.map(row => {
        const newRow = new ActionRowBuilder();
        row.components.forEach(comp => {
          if (comp.customId !== "sejawda_assumir") newRow.addComponents(comp);
        });
        return newRow;
      }).filter(row => row.components.length > 0);

      await interaction.message.edit({ components: newComponents });

      await interaction.followUp({ content: `🫂 Atendimento Iniciado por ${interaction.user}` });
    }

    // FECHAR TICKET
    if (interaction.customId === "sejawda_close") {
      if (!isGlobal && !hasStaffRole) {
        return interaction.reply({ embeds: [createErrorEmbed("Apenas membros da equipe podem fechar solicitações.")], ephemeral: true });
      }

      if (chat.tipo !== "migrado" && !chat.area) {
        return interaction.reply({ embeds: [createErrorEmbed("Você precisa escolher uma área no menu antes de finalizar a solicitação.")], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const canal = interaction.channel;

      try {
        await canal.permissionOverwrites.edit(chat.userId, { ViewChannel: false });
        const memberCreator = await interaction.guild.members.fetch(chat.userId).catch(() => null);
        const username = memberCreator ? memberCreator.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "-") : "usuario";

        await canal.setName(`fechado-${username}-${chat.ticketId}`);
        await canal.setParent(CATEGORIA_FECHADOS_ID, { lockPermissions: false });
      } catch (e) {
        console.log("Aviso: Permissões insuficientes para renomear/mover o canal do sejawda.");
      }

      await chatStore.update(interaction.channelId, (info) => (info ? { ...info, closedAt: Date.now() } : null));

      const embedArquivado = createEmbed({
        title: "🔒 Solicitação Arquivada",
        description: `O membro não possui mais acesso a este canal.\n\nEquipe: Quando não for mais necessário manter o histórico, clique abaixo para excluir definitivamente.`,
        color: 0x95a5a6
      });

      const rowAdmin = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("sejawda_delete").setLabel("Deletar Canal").setStyle(ButtonStyle.Danger).setEmoji("🗑️"));
      await canal.send({ embeds: [embedArquivado], components: [rowAdmin] });
      await interaction.editReply({ content: "✅ Solicitação arquivada com sucesso!" });

      // 🆕 NPS: Enviar avaliação de atendimento ao usuário via DM
      // O staff avaliado é quem fechou a solicitação (interaction.user)
      try {
        const userToRate = await interaction.client.users.fetch(chat.userId).catch(() => null);
        if (userToRate) {
          await enviarAvaliacaoDM(userToRate, interaction.user.id, interaction.guildId);
        }
      } catch (npsErr) {
        logger.warn({ err: npsErr }, "[sejawda] Não foi possível enviar DM de avaliação NPS ao usuário");
      }
    }

    // DELETAR TICKET PERMANENTEMENTE
    if (interaction.customId === "sejawda_delete") {
      if (!isGlobal) return interaction.reply({ embeds: [createErrorEmbed("Apenas a Liderança pode deletar o histórico de solicitações.")], ephemeral: true });
      await interaction.deferReply({ ephemeral: false });
      await interaction.followUp({ content: "💥 O canal será destruído em 5 segundos...", ephemeral: false });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
  }
};