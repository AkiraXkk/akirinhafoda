const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createPagination } = require("../utils/pagination");

function canManageVip(interaction) {
  const perms = interaction.memberPermissions;
  if (!perms) return false;
  return perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild);
}

async function fetchMember(interaction, userId) {
  if (!interaction.guild) return null;
  return interaction.guild.members.fetch(userId).catch(() => null);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vip")
    .setDescription("Gerencia e consulta VIPs")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Adiciona um usuário ao VIP")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário").setRequired(true))
        .addIntegerOption((opt) =>
          opt
            .setName("dias")
            .setDescription("Dias de VIP (opcional)")
            .setMinValue(1)
            .setRequired(false)
        )
        .addStringOption((opt) => 
            opt.setName("tier")
               .setDescription("Tier VIP (se não especificar, usa o padrão ou mantém o atual)")
               .setAutocomplete(true) 
               .setRequired(false)
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove um usuário do VIP")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Mostra se alguém é VIP")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário (padrão: você)")),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Lista VIPs cadastrados"))
    .addSubcommand((sub) => sub.setName("panel").setDescription("Abre o painel de controle VIP pessoal")),

  async autocomplete(interaction) {
      try {
          const focusedValue = interaction.options.getFocused();
          const vipConfig = interaction.client.services.vipConfig;
          
          if (!vipConfig) {
              console.log("[VIP Autocomplete] VipConfig service not found");
              return interaction.respond([]);
          }

          const tiers = await vipConfig.getGuildTiers(interaction.guildId);
          if (!tiers) {
              console.log("[VIP Autocomplete] No tiers returned for guild", interaction.guildId);
              return interaction.respond([]);
          }
          
          const choices = Object.entries(tiers).map(([id, t]) => ({ name: t.name, value: id }));
          console.log("[VIP Autocomplete] Choices:", choices);

          const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue.toLowerCase()));
          
          await interaction.respond(
              filtered.slice(0, 25)
          );
      } catch (error) {
          console.error("Erro no autocomplete VIP:", error);
          // Retorna vazio em caso de erro para não travar a UI
          await interaction.respond([]).catch(() => {});
      }
  },

  async execute(interaction) {
    const vip = interaction.client.services?.vip;
    const vipRole = interaction.client.services?.vipRole;
    if (!vip) {
      await interaction.reply({ content: "Serviço de VIP indisponível.", ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "add" || sub === "remove" || sub === "list") {
      if (!canManageVip(interaction)) {
        await interaction.reply({ content: "Você não tem permissão para isso.", ephemeral: true });
        return;
      }
    }

    if (sub === "panel") {
        const isVip = vip.isVip({ userId: interaction.user.id, member: interaction.member });
        if (!isVip) {
            return interaction.reply({ content: "Você não é VIP para acessar este painel.", ephemeral: true });
        }

        const embed = createEmbed({
            title: "💎 Painel de Controle VIP",
            description: `Olá ${interaction.user}, bem-vindo ao seu painel VIP.\nAqui você pode gerenciar todos os seus benefícios com um clique.`,
            thumbnail: interaction.user.displayAvatarURL(),
            color: 0x9B59B6,
            fields: [
                { name: "👑 Cargo", value: "Personalize nome e cor do seu cargo exclusivo.", inline: true },
                { name: "🔊 Sala Privada", value: "Crie, edite e decore sua sala de voz/texto.", inline: true },
                { name: "🏰 Família", value: "Gerencie sua família (se for dono) ou saia de uma.", inline: true }
            ]
        });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("vip_role_manage").setLabel("Gerenciar Cargo").setStyle(ButtonStyle.Primary).setEmoji("👑"),
            new ButtonBuilder().setCustomId("vip_room_manage").setLabel("Gerenciar Sala").setStyle(ButtonStyle.Success).setEmoji("🔊"),
            new ButtonBuilder().setCustomId("vip_family_manage").setLabel("Família").setStyle(ButtonStyle.Secondary).setEmoji("🏰")
        );

        await interaction.reply({ embeds: [embed], components: [row1], ephemeral: true });
        return;
    }

    if (sub === "add") {
      const user = interaction.options.getUser("usuario", true);
      const days = interaction.options.getInteger("dias");
      const tierId = interaction.options.getString("tier"); 
      
      if (tierId) {
          const vipConfig = interaction.client.services.vipConfig;
          const tiers = await vipConfig.getGuildTiers(interaction.guildId);
          if (!tiers[tierId]) {
               // Tenta busca por nome
               const found = Object.entries(tiers).find(([id, t]) => t.name.toLowerCase() === tierId.toLowerCase());
               if (!found) {
                   return interaction.reply({ embeds: [createEmbed({ description: `Tier inválido ou não encontrado.`, color: 0xFF0000 })], ephemeral: true });
               }
          }
      }

      const result = await vip.addVip(user.id, { days, tierId });
      
      const ensured =
        interaction.guildId && vipRole
          ? await vipRole.ensurePersonalRole(user.id, { guildId: interaction.guildId })
          : { ok: false };

      if (tierId && interaction.guild) {
          const member = await interaction.guild.members.fetch(user.id).catch(() => null);
          if (member) {
              await member.roles.add(tierId).catch(() => {});
          }
      }

      const description = result.created
        ? `${user} agora é VIP!`
        : `${user} teve seu VIP renovado!`;

      const fields = [];
      if (tierId) {
          fields.push({ name: "Tier", value: `<@&${tierId}>`, inline: true });
      }
      if (result.vip.expiresAt) {
          fields.push({
              name: "Expira em",
              value: `<t:${Math.floor(result.vip.expiresAt / 1000)}:R>`,
              inline: true
          });
      }
      
      if (ensured.ok) {
          fields.push({ name: "Cargo Personalizado", value: `${ensured.role}`, inline: true });
      }

      const embed = createEmbed({
        title: "🎉 Novo VIP!",
        description,
        thumbnail: user.displayAvatarURL(),
        fields,
      });

      await interaction.reply({ embeds: [embed] });
      
      try {
          const dmEmbed = createEmbed({
              title: "Parabéns! Você virou VIP!",
              description: `Você recebeu acesso VIP no servidor **${interaction.guild.name}**.`,
              fields: [
                  { name: "Painel VIP", value: "Use `/vip panel` ou `/myvip` para configurar tudo!" },
                  ...(result.vip.expiresAt ? [{ name: "Expira em", value: `<t:${Math.floor(result.vip.expiresAt / 1000)}:F>` }] : [])
              ],
              footer: "Aproveite seus benefícios!"
          });
          await user.send({ embeds: [dmEmbed] });
      } catch (e) {
          // DM fechada
      }
      
      // Log
      if (interaction.client.services.log) {
          await interaction.client.services.log.log(interaction.guild, {
              title: "💎 VIP Adicionado",
              description: `${user} recebeu VIP de ${interaction.user}.`,
              fields: [
                  { name: "Tier", value: tierId ? `<@&${tierId}>` : "Padrão", inline: true },
                  { name: "Duração", value: days ? `${days} dias` : "Permanente", inline: true }
              ],
              color: 0xF1C40F,
              user: interaction.user
          });
      }
      
      return;
    }

    if (sub === "remove") {
      const user = interaction.options.getUser("usuario", true);
      const result = await vip.removeVip(user.id);
      const settings = vip.getSettings ? vip.getSettings(user.id) : null;
      const vipChannel = interaction.client.services?.vipChannel;

      if (result.removed && interaction.guild && settings?.roleId) {
        const role = await interaction.guild.roles.fetch(settings.roleId).catch(() => null);
        if (role) await role.delete(`VIP removido: ${user.tag}`).catch(() => {});
        await vip
          .setSettings(user.id, {
            roleId: null,
            roleName: null,
            roleColor: null,
            hoist: false,
            mentionable: false,
            updatedAt: Date.now(),
          })
          .catch(() => {});
      }

      if (result.removed && vipChannel && interaction.guildId) {
        await vipChannel.archiveVipChannels(user.id, { guildId: interaction.guildId }).catch(() => {});
      }

      if (result.removed && interaction.guild) {
        const guildConfig = vip.getGuildConfig(interaction.guildId);
        const functionalVipRoleId = guildConfig?.vipRoleId;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (member && functionalVipRoleId) {
          await member.roles.remove(functionalVipRoleId).catch(() => {});
        }
        if (member && result.vip?.tierId) {
          await member.roles.remove(result.vip.tierId).catch(() => {});
        }
      }

      const embed = createEmbed({
        title: "VIP",
        description: result.removed
          ? `${user} foi removido da lista VIP.`
          : `${user} não estava na lista VIP.`,
      });

      await interaction.reply({ embeds: [embed] });
      
      // Log
      if (interaction.client.services.log && result.removed) {
          await interaction.client.services.log.log(interaction.guild, {
              title: "🚫 VIP Removido",
              description: `${user} perdeu o VIP (removido por ${interaction.user}).`,
              color: 0xFF0000,
              user: interaction.user
          });
      }
      return;
    }

    if (sub === "status") {
      const user = interaction.options.getUser("usuario") || interaction.user;
      const member = await fetchMember(interaction, user.id);
      const isVip = vip.isVip({ userId: user.id, member });
      const entry = vip.getVip(user.id);

      const fields = [];
      if (entry?.addedAt) {
        fields.push({
          name: "Cadastrado em",
          value: `<t:${Math.floor(entry.addedAt / 1000)}:F>`,
          inline: false,
        });
      }
      if (entry?.tierId) {
          fields.push({ name: "Tier", value: `<@&${entry.tierId}>`, inline: true });
      }

      const embed = createEmbed({
        title: "Status VIP",
        description: `${user} ${isVip ? "é" : "não é"} VIP.`,
        fields,
      });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (sub === "list") {
      const ids = vip.listVipIds();
      
      if (ids.length === 0) {
          return interaction.reply({ embeds: [createEmbed({ description: "Nenhum VIP cadastrado." })], ephemeral: true });
      }

      await createPagination({
          interaction,
          items: ids,
          itemsPerPage: 25,
          title: "VIPs",
          embedBuilder: (items, page, total) => {
              const mentions = items.map(id => `<@${id}>`).join("\n");
              return createEmbed({
                  title: "VIPs",
                  description: mentions,
                  footer: { text: `Página ${page + 1}/${total} • Total: ${ids.length}` }
              });
          }
      });
    }
  },

  async handleButton(interaction) {
      if (!interaction.customId.startsWith("vip_")) return;

      const vip = interaction.client.services.vip;
      const vipConfig = interaction.client.services.vipConfig;
      
      // Check if VIP
      const isVip = vip.isVip({ userId: interaction.user.id, member: interaction.member });
      if (!isVip) {
          return interaction.reply({ content: "Você precisa ser VIP para usar este botão.", ephemeral: true });
      }

      const settings = vip.getSettings(interaction.user.id) || {};

      // ROLE MANAGE MENU
      if (interaction.customId === "vip_role_manage") {
          const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("vip_role_rename").setLabel("Renomear").setStyle(ButtonStyle.Primary).setEmoji("✏️"),
              new ButtonBuilder().setCustomId("vip_role_color").setLabel("Alterar Cor").setStyle(ButtonStyle.Secondary).setEmoji("🎨"),
              new ButtonBuilder().setCustomId("vip_role_delete").setLabel("Deletar").setStyle(ButtonStyle.Danger).setEmoji("🗑️")
          );

          await interaction.reply({
              content: "O que você deseja fazer com seu cargo VIP?",
              components: [row],
              ephemeral: true
          });
      }

      // ROLE ACTIONS
      if (interaction.customId === "vip_role_rename") {
          const modal = new ModalBuilder()
              .setCustomId("vip_role_rename_modal")
              .setTitle("Renomear Cargo VIP");

          const nameInput = new TextInputBuilder()
              .setCustomId("vip_role_new_name")
              .setLabel("Novo Nome")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Ex: Rei do Gado")
              .setMaxLength(32)
              .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
          await interaction.showModal(modal);
      }

      if (interaction.customId === "vip_role_color") {
          const modal = new ModalBuilder()
              .setCustomId("vip_role_color_modal")
              .setTitle("Alterar Cor do Cargo VIP");

          const colorInput = new TextInputBuilder()
              .setCustomId("vip_role_new_color")
              .setLabel("Nova Cor (Hex)")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Ex: #FF0000")
              .setMinLength(7)
              .setMaxLength(7)
              .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(colorInput));
          await interaction.showModal(modal);
      }

      if (interaction.customId === "vip_role_delete") {
          if (!settings.roleId) {
              return interaction.reply({ embeds: [createErrorEmbed("Você não tem um cargo personalizado.")], ephemeral: true });
          }
          
          const role = await interaction.guild.roles.fetch(settings.roleId).catch(() => null);
          if (role) await role.delete().catch(() => {});
          
          await vip.setSettings(interaction.user.id, { ...settings, roleId: null });
          await interaction.reply({ embeds: [createSuccessEmbed("Cargo personalizado removido.")], ephemeral: true });
      }

      // ROOM MANAGE MENU
      if (interaction.customId === "vip_room_manage") {
          // Check if user has a room (by checking if they own a channel in the VIP category)
          // Store room ID in settings? If not, search.
          let voiceChannelId = settings.voiceChannelId;
          
          if (!voiceChannelId) {
               // Search manually
               const config = vip.getGuildConfig(interaction.guildId);
               if (config?.vipCategoryId) {
                   const channel = interaction.guild.channels.cache.find(c => c.parentId === config.vipCategoryId && c.name.includes(interaction.user.username)); // Simple search
                   if (channel) voiceChannelId = channel.id;
               }
          }

          if (!voiceChannelId) {
              const row = new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId("vip_room_create").setLabel("Criar Sala").setStyle(ButtonStyle.Success).setEmoji("➕")
              );
              return interaction.reply({ content: "Você não tem uma sala VIP criada.", components: [row], ephemeral: true });
          }

          const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("vip_room_rename").setLabel("Renomear").setStyle(ButtonStyle.Primary).setEmoji("✏️"),
              new ButtonBuilder().setCustomId("vip_room_limit").setLabel("Limite").setStyle(ButtonStyle.Secondary).setEmoji("👥"),
              new ButtonBuilder().setCustomId("vip_room_delete").setLabel("Deletar").setStyle(ButtonStyle.Danger).setEmoji("🗑️")
          );

          await interaction.reply({
              content: `Gerenciando sala <#${voiceChannelId}>`,
              components: [row],
              ephemeral: true
          });
      }

      if (interaction.customId === "vip_room_create") {
          const config = vip.getGuildConfig(interaction.guildId);
          if (!config?.vipCategoryId) {
              return interaction.reply({ embeds: [createErrorEmbed("Categoria VIP não configurada no servidor.")], ephemeral: true });
          }

          try {
              const channel = await interaction.guild.channels.create({
                  name: `Sala de ${interaction.user.username}`,
                  type: ChannelType.GuildVoice,
                  parent: config.vipCategoryId,
                  permissionOverwrites: [
                      { id: interaction.guild.id, deny: [PermissionFlagsBits.Connect] }, // Private by default? Maybe public? Let's make it private-ish
                      { id: interaction.user.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] }
                  ]
              });

              await vip.setSettings(interaction.user.id, { ...settings, voiceChannelId: channel.id });
              await interaction.reply({ embeds: [createSuccessEmbed(`Sala criada: ${channel}`)], ephemeral: true });
          } catch (e) {
              console.error(e);
              await interaction.reply({ embeds: [createErrorEmbed("Erro ao criar sala. Verifique permissões.")], ephemeral: true });
          }
      }
      
      if (interaction.customId === "vip_room_rename") {
          const modal = new ModalBuilder().setCustomId("vip_room_rename_modal").setTitle("Renomear Sala VIP");
          const nameInput = new TextInputBuilder().setCustomId("vip_room_new_name").setLabel("Novo Nome").setStyle(TextInputStyle.Short).setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
          await interaction.showModal(modal);
      }

      if (interaction.customId === "vip_room_limit") {
          const modal = new ModalBuilder().setCustomId("vip_room_limit_modal").setTitle("Limite de Usuários");
          const limitInput = new TextInputBuilder().setCustomId("vip_room_new_limit").setLabel("Limite (0-99)").setStyle(TextInputStyle.Short).setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(limitInput));
          await interaction.showModal(modal);
      }

      if (interaction.customId === "vip_room_delete") {
          if (settings.voiceChannelId) {
              const channel = await interaction.guild.channels.fetch(settings.voiceChannelId).catch(() => null);
              if (channel) await channel.delete().catch(() => {});
              await vip.setSettings(interaction.user.id, { ...settings, voiceChannelId: null });
              await interaction.reply({ embeds: [createSuccessEmbed("Sala deletada.")], ephemeral: true });
          } else {
              await interaction.reply({ embeds: [createErrorEmbed("Sala não encontrada.")], ephemeral: true });
          }
      }

      // FAMILY MANAGE
      if (interaction.customId === "vip_family_manage") {
          await interaction.reply({ 
              content: "🏰 **Gerenciamento de Família**\n\nUse o comando `/family panel` para acessar o painel completo da sua família.\nSe você ainda não tem uma, use `/family create`.",
              ephemeral: true
          });
      }
  },

  async handleModal(interaction) {
      if (!interaction.customId.startsWith("vip_")) return;
      
      const vip = interaction.client.services.vip;
      const settings = vip.getSettings(interaction.user.id) || {};

      // ROLE RENAME
      if (interaction.customId === "vip_role_rename_modal") {
          const newName = interaction.fields.getTextInputValue("vip_role_new_name");
          if (!settings.roleId) {
               return interaction.reply({ embeds: [createErrorEmbed("Você não tem um cargo personalizado para renomear.")], ephemeral: true });
          }
          
          const role = await interaction.guild.roles.fetch(settings.roleId).catch(() => null);
          if (role) {
              await role.setName(newName).catch(() => {});
              await interaction.reply({ embeds: [createSuccessEmbed(`Cargo renomeado para **${newName}**!`)] });
          } else {
              await interaction.reply({ embeds: [createErrorEmbed("Cargo não encontrado.")], ephemeral: true });
          }
      }

      // ROLE COLOR
      if (interaction.customId === "vip_role_color_modal") {
          const newColor = interaction.fields.getTextInputValue("vip_role_new_color");
          if (!/^#[0-9A-F]{6}$/i.test(newColor)) {
              return interaction.reply({ embeds: [createErrorEmbed("Cor inválida! Use formato HEX (ex: #FF0000).")], ephemeral: true });
          }

          if (!settings.roleId) {
               return interaction.reply({ embeds: [createErrorEmbed("Você não tem um cargo personalizado.")], ephemeral: true });
          }

          const role = await interaction.guild.roles.fetch(settings.roleId).catch(() => null);
          if (role) {
              await role.setColor(newColor).catch(() => {});
              await interaction.reply({ embeds: [createSuccessEmbed(`Cor alterada para **${newColor}**!`)] });
          } else {
               await interaction.reply({ embeds: [createErrorEmbed("Cargo não encontrado.")], ephemeral: true });
          }
      }
      
      // ROOM RENAME
      if (interaction.customId === "vip_room_rename_modal") {
          const newName = interaction.fields.getTextInputValue("vip_room_new_name");
          if (!settings.voiceChannelId) return interaction.reply({ embeds: [createErrorEmbed("Você não tem uma sala.")], ephemeral: true });
          
          const channel = await interaction.guild.channels.fetch(settings.voiceChannelId).catch(() => null);
          if (channel) {
              await channel.setName(newName).catch(() => {});
              await interaction.reply({ embeds: [createSuccessEmbed(`Sala renomeada para **${newName}**!`)] });
          }
      }

      // ROOM LIMIT
      if (interaction.customId === "vip_room_limit_modal") {
          const limit = parseInt(interaction.fields.getTextInputValue("vip_room_new_limit"));
          if (isNaN(limit) || limit < 0 || limit > 99) {
              return interaction.reply({ embeds: [createErrorEmbed("Limite inválido (0-99).")], ephemeral: true });
          }
          
          if (!settings.voiceChannelId) return interaction.reply({ embeds: [createErrorEmbed("Você não tem uma sala.")], ephemeral: true });

          const channel = await interaction.guild.channels.fetch(settings.voiceChannelId).catch(() => null);
          if (channel) {
              await channel.setUserLimit(limit).catch(() => {});
              await interaction.reply({ embeds: [createSuccessEmbed(`Limite da sala alterado para **${limit}**!`)] });
          }
      }
  },
};
