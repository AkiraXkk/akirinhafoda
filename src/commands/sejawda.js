const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

const panelStore = createDataStore("sejawda_panels.json");
const chatStore = createDataStore("sejawda_chats.json");
const createLocks = new Set();

const AREAS = [
  { label: "Mov Call", value: "mov_call" },
  { label: "Mov Chat", value: "mov_chat" },
  { label: "Eventos", value: "eventos" },
  { label: "Recrutamento", value: "recrutamento" },
  { label: "Acolhimento", value: "acolhimento" },
  { label: "Design", value: "design" },
  { label: "Passtime", value: "passtime" }
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

function sanitizeName(input) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sejawda")
    .setDescription("Envia o painel de recrutamento da equipe WDA")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addAttachmentOption((opt) =>
      opt.setName("imagem").setDescription("Imagem da embed").setRequired(true)
    )
    .addChannelOption((opt) =>
      opt
        .setName("canal")
        .setDescription("Canal onde enviar o painel")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addChannelOption((opt) =>
      opt
        .setName("categoria")
        .setDescription("Categoria para criar os chats")
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false)
    )
    .addRoleOption((opt) =>
      opt
        .setName("cargo_equipe")
        .setDescription("Cargo da equipe para acesso aos chats")
        .setRequired(false)
    ),

  async execute(interaction) {
    const imagem = interaction.options.getAttachment("imagem", true);
    const canal = interaction.options.getChannel("canal") || interaction.channel;
    const categoria = interaction.options.getChannel("categoria");
    const cargoEquipe = interaction.options.getRole("cargo_equipe");
    const rainbow = getDecorEmoji(interaction, "urainbowdiamond", "💎");

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
      image: imagem.url,
      color: 0x8e44ad
    });

    const select = new StringSelectMenuBuilder()
      .setCustomId("sejawda_tipo")
      .setPlaceholder("Selecione sua opção")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Recrutamento")
          .setValue("recrutado")
          .setEmoji("🧩"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Migração de servidor")
          .setValue("migrado")
          .setEmoji("🚀")
      );

    const row = new ActionRowBuilder().addComponents(select);
    const panelMessage = await canal.send({ embeds: [embed], components: [row] });

    const panels = await panelStore.load();
    panels[panelMessage.id] = {
      guildId: interaction.guildId,
      channelId: canal.id,
      categoryId: categoria?.id || canal.parentId || null,
      staffRoleId: cargoEquipe?.id || null
    };
    await panelStore.save(panels);

    await interaction.reply({
      embeds: [createSuccessEmbed(`Painel enviado em ${canal}.`)],
      ephemeral: true
    });
  },

  async handleSelectMenu(interaction) {
    if (interaction.customId === "sejawda_tipo") {
      const tipo = interaction.values[0];
      const rainbow = getDecorEmoji(interaction, "urainbowdiamond", "💎");
      const panels = await panelStore.load();
      const panelConfig = panels[interaction.message.id];

      if (!panelConfig) {
        return interaction.reply({
          embeds: [createErrorEmbed("Esse painel não está configurado.")],
          ephemeral: true
        });
      }

      const lockKey = `${interaction.guildId}:${interaction.user.id}`;
      if (createLocks.has(lockKey)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Sua solicitação já está sendo processada. Aguarde alguns segundos.")],
          ephemeral: true
        });
      }
      createLocks.add(lockKey);

      try {
        const latestChats = await chatStore.load();
        const latestExisting = Object.entries(latestChats).find(
          ([, data]) => data.userId === interaction.user.id && data.guildId === interaction.guildId && !data.closedAt
        );
        if (latestExisting) {
          return interaction.reply({
            embeds: [createErrorEmbed(`Você já possui um chat aberto: <#${latestExisting[0]}>`)],
            ephemeral: true
          });
        }

        const nameBase = sanitizeName(`${tipo}-${interaction.user.username}`);
        const channel = await interaction.guild.channels.create({
          name: `wda-${nameBase || interaction.user.id}`,
          type: ChannelType.GuildText,
          parent: panelConfig.categoryId || null,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            {
              id: interaction.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ReadMessageHistory
              ]
            },
            {
              id: interaction.client.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ReadMessageHistory
              ]
            }
          ]
        });

        if (panelConfig.staffRoleId) {
          await channel.permissionOverwrites.create(panelConfig.staffRoleId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          });
        }

      const areaSelect = new StringSelectMenuBuilder()
        .setCustomId("sejawda_area")
        .setPlaceholder("Selecione a área de interesse")
        .addOptions(
          ...AREAS.map((area) =>
            new StringSelectMenuOptionBuilder().setLabel(area.label).setValue(area.value)
          )
        );

      const closeButton = new ButtonBuilder()
        .setCustomId("sejawda_close")
        .setLabel("Fechar solicitação")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒");

      const components = [new ActionRowBuilder().addComponents(closeButton)];
      let description = `Tipo selecionado: **${tipo}**\n`;
      let areaValue = null;

      if (tipo === "migrado") {
        description += "Solicitação de migração registrada. Aguarde o contato da equipe WDA.";
        areaValue = "nao_aplicavel";
      } else {
        description += "Agora escolha sua área no menu abaixo.";
        components.unshift(new ActionRowBuilder().addComponents(areaSelect));
      }

      await channel.send({
        content: panelConfig.staffRoleId ? `<@&${panelConfig.staffRoleId}> <@${interaction.user.id}>` : `<@${interaction.user.id}>`,
        embeds: [
          createEmbed({
            title: `${rainbow} Solicitação WDA`,
            description,
            color: 0x8e44ad
          })
        ],
        components
      });

      latestChats[channel.id] = {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        tipo,
        area: areaValue,
        staffRoleId: panelConfig.staffRoleId || null,
        closedAt: null
      };
      await chatStore.save(latestChats);

      return interaction.reply({
        embeds: [createSuccessEmbed(`Seu chat foi criado: ${channel}`)],
        ephemeral: true
      });
      } finally {
        createLocks.delete(lockKey);
      }
    }

    if (interaction.customId === "sejawda_area") {
      const rainbow = getDecorEmoji(interaction, "urainbowdiamond", "💎");
      const chats = await chatStore.load();
      const chat = chats[interaction.channelId];
      if (!chat || chat.closedAt) {
        return interaction.reply({
          embeds: [createErrorEmbed("Este chat não é uma solicitação ativa.")],
          ephemeral: true
        });
      }

      const canManage = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
      const hasStaffRole = chat.staffRoleId && interaction.member?.roles?.cache?.has(chat.staffRoleId);
      if (interaction.user.id !== chat.userId && !canManage && !hasStaffRole) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas o solicitante ou a equipe pode definir a área.")],
          ephemeral: true
        });
      }

      const area = interaction.values[0];
      chat.area = area;
      chats[interaction.channelId] = chat;
      await chatStore.save(chats);

      await interaction.update({
        embeds: [
          createEmbed({
            title: `${rainbow} Solicitação WDA`,
            description: `Tipo: **${chat.tipo}**\nÁrea escolhida: **${getAreaLabel(area)}**`,
            color: 0x8e44ad
          })
        ],
        components: interaction.message.components
      });
    }
  },

  async handleButton(interaction) {
    if (interaction.customId !== "sejawda_close") return;

    const chats = await chatStore.load();
    const chat = chats[interaction.channelId];
    if (!chat || chat.closedAt) {
      return interaction.reply({
        embeds: [createErrorEmbed("Este chat já foi encerrado ou não é válido.")],
        ephemeral: true
      });
    }

    const canManage = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
    const hasStaffRole = chat.staffRoleId && interaction.member?.roles?.cache?.has(chat.staffRoleId);
    if (interaction.user.id !== chat.userId && !canManage && !hasStaffRole) {
      return interaction.reply({
        embeds: [createErrorEmbed("Você não tem permissão para fechar esta solicitação.")],
        ephemeral: true
      });
    }

    if (chat.tipo !== "migrado" && !chat.area) {
      return interaction.reply({
        embeds: [createErrorEmbed("Você precisa escolher uma área antes de finalizar a solicitação.")],
        ephemeral: true
      });
    }

    chat.closedAt = Date.now();
    chats[interaction.channelId] = chat;
    await chatStore.save(chats);

    await interaction.reply({
      embeds: [createEmbed({ description: "🔒 Solicitação será fechada em 5 segundos.", color: 0x8e44ad })]
    });

    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 5000);
  }
};
