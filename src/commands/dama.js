const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  RoleSelectMenuBuilder,
} = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");

const couplesStore = createDataStore("couples.json");

async function getDamaVipRoles(guildId) {
  const config = await getGuildConfig(guildId);
  return config?.damaVipRoles || {};
}

async function resolveMaxDamas(member, guildId) {
  const damaVipRoles = await getDamaVipRoles(guildId);
  let max = 1;
  for (const [roleId, data] of Object.entries(damaVipRoles)) {
    if (member.roles.cache.has(roleId) && data.maxDamas > max) {
      max = data.maxDamas;
    }
  }
  return max;
}

async function buildPanelEmbed(guildId) {
  const config = await getGuildConfig(guildId);
  const damaVipRoles = config?.damaVipRoles || {};
  const damaRoleId = config?.damaRoleId;
  const damaPermRoleId = config?.damaPermRoleId;
  const vipSepId = config?.vipRoleSeparatorId;
  const famSepId = config?.familyRoleSeparatorId;
  const hasVipRoles = Object.keys(damaVipRoles).length > 0;

  const rolesDesc = hasVipRoles
    ? Object.entries(damaVipRoles)
        .map(([id, d]) => `> <@&${id}> — **${d.maxDamas}** dama(s)`)
        .join("\n")
    : "> Nenhum cargo VIP configurado.";

  return createEmbed({
    title: "⚙️ Painel Admin — Sistema de Damas",
    description: [
      `**Cargo de Dama:** ${damaRoleId ? `<@&${damaRoleId}>` : "❌ Não definido"}`,
      `**Cargo base (permissão):** ${damaPermRoleId ? `<@&${damaPermRoleId}>` : "❌ Não definido"}`,
      `**Separador VIP:** ${vipSepId ? `<@&${vipSepId}>` : "❌ Não definido"}`,
      `**Separador Família:** ${famSepId ? `<@&${famSepId}>` : "❌ Não definido"}`,
      "",
      "**Cargos VIP e limites de damas:**",
      rolesDesc,
      "",
      "Membros com múltiplos cargos VIP terão o **maior** limite aplicado.",
    ].join("\n"),
    color: 0x5865f2,
    footer: { text: "Apenas administradores podem usar este painel." },
  });
}

function buildPanelComponents(hasVipRoles) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("dama_cfg:set_roles")
      .setLabel("🎭 Definir Cargos Base")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("dama_cfg:add_vip")
      .setLabel("➕ Adicionar Cargo VIP")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("dama_cfg:remove_vip")
      .setLabel("🗑️ Remover Cargo VIP")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!hasVipRoles)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("dama_cfg:separadores")
      .setLabel("⚙️ Separadores")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("dama_cfg:close")
      .setLabel("✖ Fechar")
      .setStyle(ButtonStyle.Secondary)
  );
  return [row1, row2];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dama")
    .setDescription("Sistema de Primeira Dama")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Define sua primeira dama (Requer cargo de permissão)")
        .addUserOption((opt) =>
          opt.setName("usuario").setDescription("Sua dama").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove uma dama específica ou todas as suas damas")
        .addUserOption((opt) =>
          opt.setName("usuario").setDescription("Dama específica para remover (opcional)")
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Abre o painel de configuração do sistema de Damas (Admin)")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (sub === "config") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Você precisa da permissão **Gerenciar Servidor** para acessar este painel.")],
          ephemeral: true,
        });
      }

      const config = await getGuildConfig(guildId);
      const hasVipRoles = Object.keys(config?.damaVipRoles || {}).length > 0;

      return interaction.reply({
        embeds: [await buildPanelEmbed(guildId)],
        components: buildPanelComponents(hasVipRoles),
        ephemeral: true,
      });
    }

    if (sub === "set") {
      const config = await getGuildConfig(guildId);

      if (!config?.damaPermRoleId || !config?.damaRoleId) {
        return interaction.reply({
          embeds: [createErrorEmbed("O sistema de Dama não está configurado. Use `/dama config`.")],
          ephemeral: true,
        });
      }

      const damaVipRoles = config?.damaVipRoles || {};
      const hasPermission =
        interaction.member.roles.cache.has(config.damaPermRoleId) ||
        Object.keys(damaVipRoles).some((id) => interaction.member.roles.cache.has(id));

      if (!hasPermission) {
        return interaction.reply({
          embeds: [createErrorEmbed(`Você precisa ter o cargo <@&${config.damaPermRoleId}> para definir uma dama.`)],
          ephemeral: true,
        });
      }

      const target = interaction.options.getUser("usuario");

      if (target.id === userId) {
        return interaction.reply({
          embeds: [createErrorEmbed("Você não pode se definir como sua própria dama.")],
          ephemeral: true,
        });
      }

      if (target.bot) {
        return interaction.reply({
          embeds: [createErrorEmbed("Você não pode definir um bot como dama.")],
          ephemeral: true,
        });
      }

      const maxDamas = await resolveMaxDamas(interaction.member, guildId);
      const currentCouples = await couplesStore.load();
      const userCouples = Object.entries(currentCouples).filter(([_, couple]) => couple.manId === userId);
      
      if (userCouples.length >= maxDamas) {
        return interaction.reply({
          embeds: [createErrorEmbed(`Você já atingiu o limite de **${maxDamas}** dama(s).`)],
          ephemeral: true,
        });
      }

      const existingCouple = Object.values(currentCouples).find(couple => 
        couple.manId === userId && couple.womanId === target.id
      );

      if (existingCouple) {
        return interaction.reply({
          embeds: [createErrorEmbed("Esta pessoa já é sua dama.")],
          ephemeral: true,
        });
      }

      await couplesStore.update(`${userId}_${target.id}`, {
        manId: userId,
        womanId: target.id,
        guildId,
        createdAt: Date.now(),
      });

      return interaction.reply({
        embeds: [createSuccessEmbed(`**${target.username}** agora é sua primeira dama! 💍`)],
      });
    }

    if (sub === "remove") {
      const target = interaction.options.getUser("usuario");
      const currentCouples = await couplesStore.load();

      if (target) {
        const coupleKey = `${userId}_${target.id}`;
        const couple = currentCouples[coupleKey];

        if (!couple || couple.manId !== userId) {
          return interaction.reply({
            embeds: [createErrorEmbed("Esta pessoa não é sua dama.")],
            ephemeral: true,
          });
        }

        await couplesStore.delete(coupleKey);
        return interaction.reply({
          embeds: [createSuccessEmbed(`**${target.username}** foi removida de suas damas.`)],
        });
      } else {
        // Remover todas as damas
        const userCouples = Object.entries(currentCouples).filter(([_, couple]) => couple.manId === userId);
        
        if (userCouples.length === 0) {
          return interaction.reply({
            embeds: [createErrorEmbed("Você não tem damas para remover.")],
            ephemeral: true,
          });
        }

        for (const [key] of userCouples) {
          await couplesStore.delete(key);
        }

        return interaction.reply({
          embeds: [createSuccessEmbed(`Todas as suas **${userCouples.length}** dama(s) foram removidas.`)],
        });
      }
    }
  },

  // Handlers para interações de componentes
  async handleButton(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('dama_config_')) {
      const action = customId.split('_')[2];
      const guildId = interaction.guildId;

      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Sem permissão para configurar o sistema de damas.")],
          ephemeral: true,
        });
      }

      if (action === 'set_role') {
        // Lógica para configurar cargo de dama
        return interaction.reply({
          embeds: [createSuccessEmbed("Use `/dama config` para gerenciar os cargos manualmente.")],
          ephemeral: true,
        });
      }
    }
  },

  async handleSelectMenu(interaction) {
    const customId = interaction.customId;

    if (customId === 'dama_vip_role_select') {
      const roleId = interaction.values[0];
      
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Sem permissão para configurar cargos VIP.")],
          ephemeral: true,
        });
      }

      // Criar modal para configurar limite de damas
      const modal = new ModalBuilder()
        .setCustomId(`dama_vip_config_${roleId}`)
        .setTitle(`Configurar Cargo VIP`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('max_damas')
              .setLabel('Número máximo de damas para este cargo')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Digite um número (ex: 2, 3, 5)')
              .setRequired(true)
          )
        );

      await interaction.showModal(modal);
    }
  },

  async handleModal(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('dama_vip_config_')) {
      const roleId = customId.split('_')[3];
      const maxDamas = parseInt(interaction.fields.getTextInputValue('max_damas'));
      
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Sem permissão para configurar cargos VIP.")],
          ephemeral: true,
        });
      }

      if (!maxDamas || maxDamas < 1) {
        return interaction.reply({
          embeds: [createErrorEmbed("Número de damas inválido.")],
          ephemeral: true,
        });
      }

      const guildId = interaction.guildId;
      const config = await getGuildConfig(guildId);
      const damaVipRoles = config?.damaVipRoles || {};

      damaVipRoles[roleId] = { maxDamas };

      await setGuildConfig(guildId, { damaVipRoles });

      return interaction.reply({
        embeds: [createSuccessEmbed(`Cargo <@&${roleId}> agora pode ter **${maxDamas}** dama(s).`)],
        ephemeral: true,
      });
    }
  }
};
