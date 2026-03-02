const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");
const { checkCommandPermissions } = require("../utils/permissions");

function parseBoolLike(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (["1", "true", "sim", "s", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "nao", "não", "n", "no", "off"].includes(v)) return false;
  return null;
}

function parseHexColor(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  const raw = v.startsWith("#") ? v : `#${v}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) return null;
  return raw.toUpperCase();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipadmin")
    .setDescription("Administração total do sistema VIP")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("tier")
        .setDescription("Configura um Tier VIP por benefícios (interativo)")
        .addStringOption((o) => o.setName("id").setDescription("ID único (ex: gold)").setRequired(true))
        .addRoleOption((o) => o.setName("cargo").setDescription("Cargo do Tier VIP").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("setup")
        .setDescription("Configura cargos de separador e categorias")
        .addRoleOption((o) => o.setName("cargo_base").setDescription("Cargo VIP principal"))
        .addChannelOption((o) =>
          o.setName("categoria_vip").setDescription("Categoria padrão dos canais VIP").addChannelTypes(ChannelType.GuildCategory)
        )
        .addChannelOption((o) =>
          o.setName("categoria_familia").setDescription("Categoria padrão das famílias").addChannelTypes(ChannelType.GuildCategory)
        )
        .addRoleOption((o) => o.setName("sep_vip").setDescription("Separador de cargos VIP"))
        .addRoleOption((o) => o.setName("sep_familia").setDescription("Separador de cargos de Família"))
        .addRoleOption((o) => o.setName("sep_personalizados").setDescription("Separador de cargos Personalizados"))
    )
    .addSubcommand((s) =>
      s
        .setName("config-staff")
        .setDescription("Define cargos autorizados a gerenciar VIP manualmente")
    )
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Concede VIP manualmente a um usuário")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário que receberá VIP").setRequired(true))
        .addIntegerOption((o) =>
          o.setName("dias").setDescription("Duração em dias (0 = permanente)").setMinValue(0).setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("tier").setDescription("ID do plano (ex: gold)").setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove VIP manualmente de um usuário")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário alvo").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("delete-family")
        .setDescription("Força a exclusão da família de um usuário")
        .addUserOption((o) => o.setName("usuario").setDescription("Dono da família").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("delete-vip-assets")
        .setDescription("Força a limpeza de cargos/canais VIP de um usuário")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuário alvo").setRequired(true))
    ),

  async execute(interaction) {
    // Verificar permissões usando o novo sistema
    const permissionCheck = await checkCommandPermissions(interaction, {
      adminOnly: false, // Permitir staff configurado
      checkStaff: true,
      checkChannel: true
    });

    if (!permissionCheck.allowed) {
      return interaction.reply({
        embeds: [createErrorEmbed(permissionCheck.reason)],
        ephemeral: true,
      });
    }

    const vipService = interaction.client.services.vip;
    const familyService = interaction.client.services.family;
    const vipRoleManager = interaction.client.services.vipRole;
    const vipChannelManager = interaction.client.services.vipChannel;
    const vipConfig = interaction.client.services.vipConfig;
    const logService = interaction.client.services.log;
    const sub = interaction.options.getSubcommand();

    if (sub === "tier") {
      const id = interaction.options.getString("id");
      const role = interaction.options.getRole("cargo");

      if (!vipConfig?.setGuildTier) {
        return interaction.reply({ embeds: [createErrorEmbed("VipConfigManager indisponível.")], ephemeral: true });
      }

      await vipConfig.setGuildTier(interaction.guildId, id, {
        roleId: role.id,
        name: role.name,
        benefits: {
          economy: {},
          social: {},
          tech: {},
        },
      });

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`vipadmin_tier_category_${interaction.guildId}_${id}`)
        .setPlaceholder("Selecione a categoria para configurar")
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("💰 Economia & Loja")
            .setValue("economy"),
          new StringSelectMenuOptionBuilder()
            .setLabel("👥 Social & Limites")
            .setValue("social"),
          new StringSelectMenuOptionBuilder()
            .setLabel("⚡ Permissões Técnicas")
            .setValue("tech"),
        );

      const row = new ActionRowBuilder().addComponents(menu);
      return interaction.reply({
        embeds: [createSuccessEmbed(`Tier **${id}** iniciado com o cargo ${role}. Agora selecione uma categoria para configurar.`)],
        components: [row],
        ephemeral: true,
      });
    }

    if (sub === "setup") {
      const cargoBase = interaction.options.getRole("cargo_base");
      const categoriaVip = interaction.options.getChannel("categoria_vip");
      const categoriaFamilia = interaction.options.getChannel("categoria_familia");
      const sepVip = interaction.options.getRole("sep_vip");
      const sepFamilia = interaction.options.getRole("sep_familia");
      const sepPersonalizados = interaction.options.getRole("sep_personalizados");

      const patch = {};
      if (cargoBase) patch.vipRoleId = cargoBase.id;
      if (categoriaVip) patch.vipCategoryId = categoriaVip.id;
      if (categoriaFamilia) patch.familyCategoryId = categoriaFamilia.id;
      if (sepVip) patch.vipSeparatorRoleId = sepVip.id;
      if (sepFamilia) patch.familySeparatorRoleId = sepFamilia.id;
      if (sepPersonalizados) patch.personalSeparatorRoleId = sepPersonalizados.id;
      if (Object.keys(patch).length === 0) {
        return interaction.reply({
          embeds: [createErrorEmbed("Informe ao menos um: cargo base ou categoria.")],
          ephemeral: true,
        });
      }
      try {
        await vipService.setGuildConfig(interaction.guildId, patch);
        return interaction.reply({ embeds: [createSuccessEmbed("Setup VIP atualizado.")], ephemeral: true });
      } catch (err) {
        return interaction.reply({ embeds: [createErrorEmbed("Falha ao salvar setup.")], ephemeral: true });
      }
    }

    if (sub === "config-staff") {
      const select = new RoleSelectMenuBuilder()
        .setCustomId("vipadmin_staff_roles")
        .setPlaceholder("Selecione cargos de staff VIP")
        .setMinValues(0);

      const row = new ActionRowBuilder().addComponents(select);

      return interaction.reply({
        embeds: [createSuccessEmbed("Selecione os cargos autorizados a usar /vipadmin add e /vipadmin remove.")],
        components: [row],
        ephemeral: true,
      });
    }

    if (sub === "add") {
      const permissionCheck = await checkCommandPermissions(interaction, { checkStaff: true });
      if (!permissionCheck.allowed) {
        return interaction.reply({
          embeds: [createErrorEmbed(permissionCheck.reason || "Você não está autorizado a conceder VIP manualmente.")],
          ephemeral: true,
        });
      }

      const alvo = interaction.options.getUser("usuario");
      const dias = interaction.options.getInteger("dias");
      const tierId = interaction.options.getString("tier") || undefined;

      const duracaoDias = dias < 0 ? 0 : dias;

      try {
        await vipService.addVip(interaction.guildId, alvo.id, { days: duracaoDias || undefined, tierId });

        const membro = await interaction.guild.members.fetch(alvo.id).catch(() => null);
        const vipGuildConfig = vipService.getGuildConfig(interaction.guildId) || {};

        if (vipGuildConfig.vipRoleId && membro) {
          await membro.roles.add(vipGuildConfig.vipRoleId).catch(() => {});
        }

        if (vipRoleManager && membro) {
          await vipRoleManager.ensurePersonalRole(alvo.id, { guildId: interaction.guildId }).catch(() => {});
        }

        const transactionId = `VIP_ADD_${Date.now()}_${alvo.id}`;
        const tierConfig = tierId ? await vipConfig.getTierConfig(interaction.guildId, tierId) : null;

        if (logService?.logVipAction) {
          await logService.logVipAction(interaction.guild, {
            action: "Adicionado",
            targetUser: alvo,
            staffUser: interaction.user,
            tierConfig: tierConfig,
            duration: duracaoDias,
            paymentMethod: "manual",
            transactionId: transactionId,
          });
        }

        return interaction.reply({
          embeds: [
            createSuccessEmbed(
              `VIP concedido para ${alvo} (${tierId || "sem tier definido"}) por ${
                duracaoDias === 0 ? "tempo indeterminado" : `${duracaoDias} dia(s)`
              }.`,
            ),
          ],
          ephemeral: true,
        });
      } catch (err) {
        return interaction.reply({
          embeds: [createErrorEmbed("Falha ao conceder VIP.")],
          ephemeral: true,
        });
      }
    }

    if (sub === "remove") {
      const permissionCheck = await checkCommandPermissions(interaction, { checkStaff: true });
      if (!permissionCheck.allowed) {
        return interaction.reply({
          embeds: [createErrorEmbed(permissionCheck.reason || "Você não está autorizado a remover VIP manualmente.")],
          ephemeral: true,
        });
      }

      const alvo = interaction.options.getUser("usuario");
      const guildId = interaction.guildId;
      const membro = await interaction.guild.members.fetch(alvo.id).catch(() => null);
      const entrada = vipService.getVip(guildId, alvo.id);

      try {
        if (entrada) {
          await vipService.removeVip(guildId, alvo.id).catch(() => {});
        }

        if (vipRoleManager) {
          await vipRoleManager.deletePersonalRole(alvo.id, { guildId }).catch(() => {});
        }
        if (vipChannelManager) {
          await vipChannelManager.deleteVipChannels(alvo.id, { guildId }).catch(() => {});
        }

        if (membro) {
          const vipGuildConfig = vipService.getGuildConfig(guildId) || {};
          if (vipGuildConfig.vipRoleId) {
            await membro.roles.remove(vipGuildConfig.vipRoleId).catch(() => {});
          }
          if (entrada?.tierId) {
            const tierConfig = await vipConfig.getTierConfig(interaction.guildId, entrada.tierId).catch(() => null);
            if (tierConfig?.roleId) {
              await membro.roles.remove(tierConfig.roleId).catch(() => {});
            }
          }
        }

        if (logService) {
          const transactionId = `VIP_REMOVE_${Date.now()}_${alvo.id}`;
          const tierConfig = entrada?.tierId ? await vipConfig.getTierConfig(interaction.guildId, entrada.tierId) : null;
          
          if (logService?.logVipAction) {
            await logService.logVipAction(interaction.guild, {
              action: "Removido",
              targetUser: alvo,
              staffUser: interaction.user,
              tierConfig: tierConfig,
              paymentMethod: "manual",
              transactionId: transactionId,
            });
          }
        }

        return interaction.reply({
          embeds: [createSuccessEmbed(`VIP de ${alvo} removido.`)],
          ephemeral: true,
        });
      } catch (err) {
        return interaction.reply({
          embeds: [createErrorEmbed("Falha ao remover VIP.")],
          ephemeral: true,
        });
      }
    }

    if (sub === "delete-family") {
      const alvo = interaction.options.getUser("usuario");
      if (!familyService) {
        return interaction.reply({ embeds: [createErrorEmbed("Serviço de família indisponível.")], ephemeral: true });
      }
      try {
        const ok = await familyService.deleteFamily(interaction.guild, alvo.id);
        if (!ok) {
          return interaction.reply({ embeds: [createErrorEmbed("Família não encontrada para este usuário.")], ephemeral: true });
        }
        return interaction.reply({ embeds: [createSuccessEmbed(`Família de ${alvo} excluída.`)], ephemeral: true });
      } catch (err) {
        return interaction.reply({ embeds: [createErrorEmbed("Erro ao excluir família.")], ephemeral: true });
      }
    }

    if (sub === "delete-vip-assets") {
      const alvo = interaction.options.getUser("usuario");
      const guildId = interaction.guildId;
      const member = await interaction.guild.members.fetch(alvo.id).catch(() => null);
      const entry = vipService.getVip(alvo.id);

      try {
        if (vipRoleManager) {
          await vipRoleManager.deletePersonalRole(alvo.id, { guildId }).catch(() => {});
        }
        if (vipChannelManager) {
          await vipChannelManager.deleteVipChannels(alvo.id, { guildId }).catch(() => {});
        }
        if (entry) {
          await vipService.removeVip(alvo.id).catch(() => {});
        }
        if (member) {
          const vipConfig = vipService.getGuildConfig(guildId);
          if (vipConfig?.vipRoleId) {
            await member.roles.remove(vipConfig.vipRoleId).catch(() => {});
          }
          if (entry?.tierId) {
            await member.roles.remove(entry.tierId).catch(() => {});
          }
        }
        if (familyService) {
          await familyService.deleteFamily(interaction.guild, alvo.id).catch(() => {});
        }
        return interaction.reply({ embeds: [createSuccessEmbed(`Ativos VIP de ${alvo} limpos.`)], ephemeral: true });
      } catch (err) {
        return interaction.reply({ embeds: [createErrorEmbed("Erro ao limpar ativos VIP.")], ephemeral: true });
      }
    }
  },

  async handleSelectMenu(interaction) {
    // Existing staff config select
    if (interaction.customId === "vipadmin_staff_roles") {
      if (!interaction.guild) {
        return interaction.reply({ embeds: [createErrorEmbed("Apenas em servidores.")], ephemeral: true });
      }

      const selectedRoleIds = interaction.values || [];

      await setGuildConfig(interaction.guild.id, { authorizedVipStaff: selectedRoleIds });

      return interaction.update({
        embeds: [createSuccessEmbed("Cargos de staff VIP atualizados.")],
        components: [],
      });
    }

    if (!interaction.customId.startsWith("vipadmin_tier_category_")) return;
    if (!interaction.guild) {
      return interaction.reply({ embeds: [createErrorEmbed("Apenas em servidores.")], ephemeral: true });
    }

    const parts = interaction.customId.split("_");
    const guildId = parts[4];
    const tierId = parts.slice(5).join("_");
    if (interaction.guildId !== guildId) {
      return interaction.reply({ embeds: [createErrorEmbed("Guild inválida para esta configuração.")], ephemeral: true });
    }

    const category = interaction.values?.[0];
    if (!category) {
      return interaction.reply({ embeds: [createErrorEmbed("Categoria inválida.")], ephemeral: true });
    }

    if (category === "economy") {
      const modal = new ModalBuilder()
        .setCustomId(`vipadmin_tier_modal_economy_${guildId}_${tierId}`)
        .setTitle("Economia & Loja");

      const dailyExtra = new TextInputBuilder()
        .setCustomId("valor_daily_extra")
        .setLabel("valor_daily_extra (moedas fixas a mais)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const precoShop = new TextInputBuilder()
        .setCustomId("preco_shop")
        .setLabel("preco_shop (custo do VIP)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const bonusInicial = new TextInputBuilder()
        .setCustomId("bonus_inicial")
        .setLabel("bonus_inicial (moedas ao ativar)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(dailyExtra),
        new ActionRowBuilder().addComponents(precoShop),
        new ActionRowBuilder().addComponents(bonusInicial)
      );

      return interaction.showModal(modal);
    }

    if (category === "social") {
      const modal = new ModalBuilder()
        .setCustomId(`vipadmin_tier_modal_social_${guildId}_${tierId}`)
        .setTitle("Social & Limites");

      const limiteFamilia = new TextInputBuilder()
        .setCustomId("limite_familia")
        .setLabel("limite_familia (vagas)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const limiteDamas = new TextInputBuilder()
        .setCustomId("limite_damas")
        .setLabel("limite_damas (vagas)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const podePresentear = new TextInputBuilder()
        .setCustomId("pode_presentear")
        .setLabel("pode_presentear (true/false)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(limiteFamilia),
        new ActionRowBuilder().addComponents(limiteDamas),
        new ActionRowBuilder().addComponents(podePresentear)
      );

      return interaction.showModal(modal);
    }

    if (category === "tech") {
      const modal = new ModalBuilder()
        .setCustomId(`vipadmin_tier_modal_tech_${guildId}_${tierId}`)
        .setTitle("Permissões Técnicas");

      const ignorarSlowmode = new TextInputBuilder()
        .setCustomId("ignorar_slowmode")
        .setLabel("ignorar_slowmode (true/false)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const criarCallVip = new TextInputBuilder()
        .setCustomId("criar_call_vip")
        .setLabel("criar_call_vip (true/false)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const corExclusiva = new TextInputBuilder()
        .setCustomId("cor_exclusiva")
        .setLabel("cor_exclusiva (HEX ex: #FF0000)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(ignorarSlowmode),
        new ActionRowBuilder().addComponents(criarCallVip),
        new ActionRowBuilder().addComponents(corExclusiva)
      );

      return interaction.showModal(modal);
    }
  },

  async handleModal(interaction) {
    if (!interaction.customId.startsWith("vipadmin_tier_modal_")) return;
    if (!interaction.guild) {
      return interaction.reply({ embeds: [createErrorEmbed("Apenas em servidores.")], ephemeral: true });
    }

    const parts = interaction.customId.split("_");
    const category = parts[4];
    const guildId = parts[5];
    const tierId = parts.slice(6).join("_");
    if (interaction.guildId !== guildId) {
      return interaction.reply({ embeds: [createErrorEmbed("Guild inválida para esta configuração.")], ephemeral: true });
    }

    const vipConfig = interaction.client.services.vipConfig;
    if (!vipConfig?.setGuildTier) {
      return interaction.reply({ embeds: [createErrorEmbed("VipConfigManager indisponível.")], ephemeral: true });
    }

    const tier = await vipConfig.getTierConfig(guildId, tierId);
    if (!tier) {
      return interaction.reply({ embeds: [createErrorEmbed("Tier não encontrado.")], ephemeral: true });
    }

    const patch = { benefits: { economy: {}, social: {}, tech: {} } };

    if (category === "economy") {
      const dailyExtraRaw = interaction.fields.getTextInputValue("valor_daily_extra");
      const precoShopRaw = interaction.fields.getTextInputValue("preco_shop");
      const bonusRaw = interaction.fields.getTextInputValue("bonus_inicial");

      const valorDailyExtra = Number(dailyExtraRaw);
      const precoShop = Number(precoShopRaw);
      const bonusInicial = Number(bonusRaw);

      if (!Number.isFinite(valorDailyExtra) || valorDailyExtra < 0) {
        return interaction.reply({ embeds: [createErrorEmbed("valor_daily_extra inválido.")], ephemeral: true });
      }
      if (!Number.isFinite(precoShop) || precoShop < 0) {
        return interaction.reply({ embeds: [createErrorEmbed("preco_shop inválido.")], ephemeral: true });
      }
      if (!Number.isFinite(bonusInicial) || bonusInicial < 0) {
        return interaction.reply({ embeds: [createErrorEmbed("bonus_inicial inválido.")], ephemeral: true });
      }

      patch.preco_shop = precoShop;
      patch.valor_daily_extra = valorDailyExtra;
      patch.bonus_inicial = bonusInicial;
      patch.benefits.economy = { valor_daily_extra: valorDailyExtra, preco_shop: precoShop, bonus_inicial: bonusInicial };
    }

    if (category === "social") {
      const limiteFamiliaRaw = interaction.fields.getTextInputValue("limite_familia");
      const limiteDamasRaw = interaction.fields.getTextInputValue("limite_damas");
      const podeRaw = interaction.fields.getTextInputValue("pode_presentear");

      const limiteFamilia = Number(limiteFamiliaRaw);
      const limiteDamas = Number(limiteDamasRaw);
      const podePresentear = parseBoolLike(podeRaw);

      if (!Number.isFinite(limiteFamilia) || limiteFamilia < 0) {
        return interaction.reply({ embeds: [createErrorEmbed("limite_familia inválido.")], ephemeral: true });
      }
      if (!Number.isFinite(limiteDamas) || limiteDamas < 0) {
        return interaction.reply({ embeds: [createErrorEmbed("limite_damas inválido.")], ephemeral: true });
      }
      if (typeof podePresentear !== "boolean") {
        return interaction.reply({ embeds: [createErrorEmbed("pode_presentear deve ser true/false.")], ephemeral: true });
      }

      patch.limite_familia = limiteFamilia;
      patch.limite_damas = limiteDamas;
      patch.pode_presentear = podePresentear;
      patch.benefits.social = { limite_familia: limiteFamilia, limite_damas: limiteDamas, pode_presentear: podePresentear };
    }

    if (category === "tech") {
      const ignorarRaw = interaction.fields.getTextInputValue("ignorar_slowmode");
      const criarRaw = interaction.fields.getTextInputValue("criar_call_vip");
      const corRaw = interaction.fields.getTextInputValue("cor_exclusiva") || "";

      const ignorarSlowmode = parseBoolLike(ignorarRaw);
      const criarCallVip = parseBoolLike(criarRaw);
      const corExclusiva = corRaw ? parseHexColor(corRaw) : null;

      if (typeof ignorarSlowmode !== "boolean") {
        return interaction.reply({ embeds: [createErrorEmbed("ignorar_slowmode deve ser true/false.")], ephemeral: true });
      }
      if (typeof criarCallVip !== "boolean") {
        return interaction.reply({ embeds: [createErrorEmbed("criar_call_vip deve ser true/false.")], ephemeral: true });
      }
      if (corRaw && !corExclusiva) {
        return interaction.reply({ embeds: [createErrorEmbed("cor_exclusiva inválida. Use formato #RRGGBB.")], ephemeral: true });
      }

      patch.ignorar_slowmode = ignorarSlowmode;
      patch.criar_call_vip = criarCallVip;
      patch.cor_exclusiva = corExclusiva;
      patch.benefits.tech = { ignorar_slowmode: ignorarSlowmode, criar_call_vip: criarCallVip, cor_exclusiva: corExclusiva };
    }

    await vipConfig.setGuildTier(guildId, tierId, patch);
    return interaction.reply({ embeds: [createSuccessEmbed(`Tier **${tierId}** atualizado (${category}).`)], ephemeral: true });
  },
};
