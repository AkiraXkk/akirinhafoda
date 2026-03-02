const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
} = require("discord.js");
const { createEmbed, createErrorEmbed, createSuccessEmbed } = require("../embeds");

const tierPadrao = {
  name: "VIP",
  maxDamas: 1,
  canFamily: false,
  hasSecondRole: false,
  maxSecondRoleMembers: 0,
  maxFamilyMembers: 0,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vip")
    .setDescription("Painel e informações do sistema VIP")
    .addSubcommand((s) => s.setName("panel").setDescription("Abre seu painel VIP"))
    .addSubcommand((s) =>
      s
        .setName("cargo2")
        .setDescription("Gerencia seu 2º cargo (Personalizável/Amigo)")
        .addUserOption((o) => o.setName("amigo").setDescription("Amigo que receberá o cargo"))
    )
    .addSubcommand((s) => s.setName("status").setDescription("Verifica tempo restante")),

  async execute(interaction) {
    const vipService = interaction.client.services.vip;
    const sub = interaction.options.getSubcommand();
    const entrada = vipService.getVip(interaction.guildId, interaction.user.id);

    if (!entrada) {
      return interaction.reply({ embeds: [createErrorEmbed("Você não é VIP.")], ephemeral: true });
    }

    let tierConfig = null;
    if (entrada.tierId) {
      tierConfig = await vipService.getTierConfig(interaction.guildId, entrada.tierId);
    }
    const tier = tierConfig || tierPadrao;

    if (sub === "panel") {
      const embed = createEmbed({
        title: "💎 Painel VIP",
        description: [
          `Plano: **${tier.name}**`,
          `Damas: \`${tier.maxDamas}\``,
          `2º Cargo: até \`${tier.maxSecondRoleMembers || 0}\` membros`,
          `Família: até \`${tier.maxFamilyMembers || 0}\` membros`,
        ].join("\n"),
        color: 0x9b59b6,
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("vip_role_main").setLabel("Cargo Principal").setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("vip_role_second")
          .setLabel("2º Cargo")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!tier.hasSecondRole),
        new ButtonBuilder()
          .setCustomId("vip_family")
          .setLabel("Família")
          .setStyle(ButtonStyle.Success)
          .setDisabled(!tier.canFamily)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("vip_manage_members")
          .setLabel("Gerenciar Cargo/Família")
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({ embeds: [embed], components: [row, row2], ephemeral: true });
    }

    if (sub === "cargo2") {
      if (!tier.hasSecondRole) {
        return interaction.reply({
          embeds: [createErrorEmbed("Seu plano não permite um 2º cargo.")],
          ephemeral: true,
        });
      }
      const amigo = interaction.options.getUser("amigo");
      if (amigo) {
        return interaction.reply({
          embeds: [createSuccessEmbed(`Cargo extra atribuído a ${amigo}.`)],
          ephemeral: true,
        });
      }
      return interaction.reply({
        content: "Use os botões no `/vip panel` para editar nome/cor do 2º cargo.",
        ephemeral: true,
      });
    }

    if (sub === "status") {
      const restante = entrada.expiresAt
        ? Math.max(0, Math.ceil((entrada.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
        : null;
      const texto = restante === null
        ? "Seu VIP é **permanente**."
        : `Dias restantes: **${restante}**`;
      return interaction.reply({ embeds: [createEmbed({ description: texto, color: 0x9b59b6 })], ephemeral: true });
    }
  },

  async handleButton(interaction) {
    const customId = interaction.customId;
    if (!customId.startsWith("vip_")) return;

    const vipService = interaction.client.services.vip;
    const entrada = vipService.getVip(interaction.guildId, interaction.user.id);
    if (!entrada) {
      return interaction.reply({ embeds: [createErrorEmbed("Você não é VIP.")], ephemeral: true });
    }

    let tierConfig = null;
    if (entrada.tierId) {
      tierConfig = await vipService.getTierConfig(interaction.guildId, entrada.tierId);
    }
    const tier = tierConfig || tierPadrao;

    if (customId === "vip_manage_members") {
      const embed = createEmbed({
        title: "Gerenciar VIP",
        description: "Escolha o que deseja gerenciar.",
        color: 0x9b59b6,
      });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("vip_manage_secondrole")
          .setLabel("2º Cargo")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!tier.hasSecondRole || !tier.maxSecondRoleMembers),
        new ButtonBuilder()
          .setCustomId("vip_manage_family")
          .setLabel("Família")
          .setStyle(ButtonStyle.Success)
          .setDisabled(!tier.canFamily || !tier.maxFamilyMembers)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (customId === "vip_role_main") {
      return interaction.reply({
        embeds: [createErrorEmbed("Edição do cargo principal ainda não implementada pelo painel.")],
        ephemeral: true,
      });
    }

    if (customId === "vip_role_second") {
      if (!tier.hasSecondRole) {
        return interaction.reply({ embeds: [createErrorEmbed("Seu plano não permite 2º cargo.")], ephemeral: true });
      }
      return interaction.reply({
        embeds: [createErrorEmbed("Edição do 2º cargo ainda não implementada por este botão. Use `Gerenciar Cargo/Família`.")],
        ephemeral: true,
      });
    }

    if (customId === "vip_family") {
      if (!tier.canFamily) {
        return interaction.reply({ embeds: [createErrorEmbed("Seu plano não permite família.")], ephemeral: true });
      }
      return interaction.reply({
        embeds: [createErrorEmbed("Gerenciamento de família por este botão ainda não implementado. Use `Gerenciar Cargo/Família`.")],
        ephemeral: true,
      });
    }

    if (customId === "vip_manage_secondrole") {
      if (!tier.hasSecondRole || !tier.maxSecondRoleMembers) {
        return interaction.update({
          embeds: [createErrorEmbed("Seu plano não permite gerenciar 2º cargo.")],
          components: [],
        });
      }
      const select = new UserSelectMenuBuilder()
        .setCustomId("vip_select_secondrole")
        .setPlaceholder("Selecione membros para o 2º cargo")
        .setMinValues(0)
        .setMaxValues(tier.maxSecondRoleMembers);

      const row = new ActionRowBuilder().addComponents(select);
      return interaction.update({
        embeds: [
          createEmbed({
            description: `Escolha até \`${tier.maxSecondRoleMembers}\` membros para receber o seu 2º cargo.`,
          }),
        ],
        components: [row],
      });
    }

    if (customId === "vip_manage_family") {
      if (!tier.canFamily || !tier.maxFamilyMembers) {
        return interaction.update({
          embeds: [createErrorEmbed("Seu plano não permite gerenciar família pelo painel.")],
          components: [],
        });
      }
      const select = new UserSelectMenuBuilder()
        .setCustomId("vip_select_family")
        .setPlaceholder("Selecione membros para convidar para a família")
        .setMinValues(0)
        .setMaxValues(tier.maxFamilyMembers);

      const row = new ActionRowBuilder().addComponents(select);
      return interaction.update({
        embeds: [
          createEmbed({
            description: `Escolha até \`${tier.maxFamilyMembers}\` membros para convidar para a família.`,
          }),
        ],
        components: [row],
      });
    }

    // Fallback para qualquer botão vip_* não tratado
    return interaction.reply({
      embeds: [createErrorEmbed("Este botão do painel VIP ainda não foi implementado.")],
      ephemeral: true,
    });
  },

  async handleSelectMenu(interaction) {
    const customId = interaction.customId;
    if (customId !== "vip_select_secondrole" && customId !== "vip_select_family") return;

    const vipService = interaction.client.services.vip;
    const entrada = vipService.getVip(interaction.guildId, interaction.user.id);
    if (!entrada) {
      return interaction.reply({ embeds: [createErrorEmbed("Você não é VIP.")], ephemeral: true });
    }

    let tierConfig = null;
    if (entrada.tierId) {
      tierConfig = await vipService.getTierConfig(interaction.guildId, entrada.tierId);
    }
    const tier = tierConfig || tierPadrao;

    if (customId === "vip_select_secondrole") {
      if (!tier.hasSecondRole || !tier.maxSecondRoleMembers) {
        return interaction.update({ embeds: [createErrorEmbed("Seu plano não permite 2º cargo.")], components: [] });
      }

      const vipRoleManager = interaction.client.services.vipRole;
      if (!vipRoleManager) {
        return interaction.update({ embeds: [createErrorEmbed("Sistema de cargos VIP indisponível.")], components: [] });
      }

      const settings = vipService.getSettings(interaction.guildId, interaction.user.id) || {};
      const guild = interaction.guild;
      let role = null;

      if (settings.roleId) {
        role = await guild.roles.fetch(settings.roleId).catch(() => null);
      }

      if (!role) {
        const result = await vipRoleManager.ensurePersonalRole(interaction.user.id, { guildId: guild.id });
        if (!result?.role) {
          return interaction.update({ embeds: [createErrorEmbed("Não foi possível garantir o seu cargo VIP.")], components: [] });
        }
        role = result.role;
      }

      const selectedIds = interaction.values;
      const membrosAtuais = Array.from(role.members.keys()).filter((id) => id !== interaction.user.id);

      for (const id of membrosAtuais) {
        if (!selectedIds.includes(id)) {
          const membro = await guild.members.fetch(id).catch(() => null);
          if (membro) await membro.roles.remove(role).catch(() => {});
        }
      }

      for (const id of selectedIds) {
        if (!membrosAtuais.includes(id)) {
          const membro = await guild.members.fetch(id).catch(() => null);
          if (membro) await membro.roles.add(role).catch(() => {});
        }
      }

      await vipService.setSettings(interaction.guildId, interaction.user.id, { secondRoleMembers: selectedIds }).catch(() => {});

      return interaction.update({
        embeds: [createSuccessEmbed("Membros do 2º cargo atualizados.")],
        components: [],
      });
    }

    if (customId === "vip_select_family") {
      if (!tier.canFamily || !tier.maxFamilyMembers) {
        return interaction.update({ embeds: [createErrorEmbed("Seu plano não permite família.")], components: [] });
      }

      const familyService = interaction.client.services.family;
      const vipConfigService = interaction.client.services.vipConfig;
      if (!familyService || !vipConfigService) {
        return interaction.update({ embeds: [createErrorEmbed("Sistema de família indisponível.")], components: [] });
      }

      const family = await familyService.getFamilyByOwner(interaction.user.id);
      if (!family) {
        return interaction.update({ embeds: [createErrorEmbed("Você não é dono de nenhuma família.")], components: [] });
      }

      const guild = interaction.guild;
      const valores = interaction.values;
      let adicionados = 0;

      for (const id of valores) {
        const membro = await guild.members.fetch(id).catch(() => null);
        if (!membro) continue;
        try {
          await familyService.addMember(guild, family.id, membro, vipConfigService);
          adicionados += 1;
        } catch {
          // Ignora membros que estouram limite ou já estão na família
        }
      }

      const mensagem =
        adicionados === 0
          ? "Nenhum membro pôde ser adicionado (limite ou já são membros)."
          : `Adicionados **${adicionados}** membro(s) à família.`;

      return interaction.update({
        embeds: [createSuccessEmbed(mensagem)],
        components: [],
      });
    }
  },
};
