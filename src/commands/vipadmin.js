const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { createEmbed, createErrorEmbed, createSuccessEmbed } = require("../embeds");

const CATEGORY_OPTIONS = [
  { label: "💰 Economia & Loja", value: "economia_loja", description: "Configurar daily extra, preço e bônus inicial" },
  { label: "👥 Social & Limites", value: "social_limites", description: "Configurar limites sociais e presenteio" },
  { label: "⚡ Permissões Técnicas", value: "permissoes_tecnicas", description: "Configurar permissões especiais e cor exclusiva" },
];

function ensureBooleanString(value, optionName) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!["true", "false"].includes(normalized)) {
    throw new Error(`O campo ${optionName} deve ser 'true' ou 'false'.`);
  }
  return normalized === "true";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipadmin")
    .setDescription("Administração modular de VIP por tier")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("tier")
        .setDescription("Cria/atualiza um tier e abre o motor de configuração interativo")
        .addStringOption((opt) => opt.setName("id").setDescription("ID lógico do tier (ex: bronze, silver)").setRequired(true))
        .addRoleOption((opt) => opt.setName("cargo").setDescription("Cargo do tier VIP").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Ativa VIP manualmente para um usuário")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário alvo").setRequired(true))
        .addStringOption((opt) => opt.setName("tier_id").setDescription("ID lógico do tier a aplicar").setRequired(true))
        .addIntegerOption((opt) => opt.setName("dias").setDescription("Duração do VIP em dias").setMinValue(1).setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove VIP do usuário")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário alvo").setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Lista tiers e VIPs ativos da guild"))
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Configura o cargo VIP base do servidor")
        .addRoleOption((opt) => opt.setName("cargo_vip").setDescription("Cargo VIP base").setRequired(true)),
    ),

  async execute(interaction, services) {
    const vipService = services?.vip;
    const vipConfig = services?.vipConfig;
    const economyService = services?.economy;

    if (!vipService || !vipConfig) {
      return interaction.reply({ embeds: [createErrorEmbed("Serviços VIP não estão disponíveis no momento.")], ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    try {
      if (sub === "setup") {
        const role = interaction.options.getRole("cargo_vip", true);
        await vipService.setGuildConfig(interaction.guildId, { vipRoleId: role.id, updatedAt: Date.now() });
        return interaction.reply({ embeds: [createSuccessEmbed(`Cargo VIP base definido como ${role}.`)], ephemeral: true });
      }

      if (sub === "tier") {
        const tierId = interaction.options.getString("id", true).trim().toLowerCase();
        const role = interaction.options.getRole("cargo", true);

        const current = await vipConfig.getGuildTiers(interaction.guildId);
        const existing = current[tierId] || {};

        await vipConfig.setGuildTier(interaction.guildId, tierId, {
          id: tierId,
          roleId: role.id,
          name: existing.name || tierId.toUpperCase(),
        });

        const menu = new StringSelectMenuBuilder()
          .setCustomId(`vipadmin:tier:${interaction.guildId}:${tierId}`)
          .setPlaceholder("Selecione uma categoria para configurar")
          .addOptions(CATEGORY_OPTIONS);

        const row = new ActionRowBuilder().addComponents(menu);
        return interaction.reply({
          embeds: [
            createEmbed({
              title: "🛠️ Motor de Configuração do Tier",
              description: `Tier **${tierId}** associado ao cargo <@&${role.id}>.\nAgora escolha uma categoria para abrir o modal de configuração.`,
              color: 0x5865f2,
            }),
          ],
          components: [row],
          ephemeral: true,
        });
      }

      if (sub === "add") {
        const user = interaction.options.getUser("usuario", true);
        const tierId = interaction.options.getString("tier_id", true).trim().toLowerCase();
        const days = interaction.options.getInteger("dias") || 30;
        const tiers = await vipConfig.getGuildTiers(interaction.guildId);
        const tier = tiers[tierId];

        if (!tier) {
          return interaction.reply({ embeds: [createErrorEmbed("Tier não encontrado. Use /vipadmin tier para criar/configurar.")], ephemeral: true });
        }

        const result = await vipService.addVip(user.id, {
          guildId: interaction.guildId,
          tierId,
          tierData: tier,
          days,
          source: "admin",
          grantedBy: interaction.user.id,
        });

        if (economyService && Number(tier.bonus_inicial || 0) > 0) {
          await economyService.addCoins(user.id, Number(tier.bonus_inicial));
        }

        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (member && tier.roleId) {
          await member.roles.add(tier.roleId).catch(() => null);
        }

        return interaction.reply({
          embeds: [
            createSuccessEmbed(
              `${user} recebeu VIP **${tierId}**${result.vip.expiresAt ? ` até <t:${Math.floor(result.vip.expiresAt / 1000)}:F>` : ""}.`,
            ),
          ],
          ephemeral: true,
        });
      }

      if (sub === "remove") {
        const user = interaction.options.getUser("usuario", true);
        const removed = await vipService.removeVip(user.id, { guildId: interaction.guildId });
        if (!removed.removed) {
          return interaction.reply({ embeds: [createErrorEmbed("Usuário não possui VIP ativo nesta guild.")], ephemeral: true });
        }

        if (removed.vip?.tierId) {
          const tiers = await vipConfig.getGuildTiers(interaction.guildId);
          const roleId = tiers[removed.vip.tierId]?.roleId;
          const member = await interaction.guild.members.fetch(user.id).catch(() => null);
          if (member && roleId) {
            await member.roles.remove(roleId).catch(() => null);
          }
        }

        return interaction.reply({ embeds: [createSuccessEmbed(`VIP removido de ${user}.`)], ephemeral: true });
      }

      if (sub === "list") {
        const tiers = await vipConfig.getGuildTiers(interaction.guildId);
        const active = vipService.listVipEntries(interaction.guildId);

        return interaction.reply({
          embeds: [
            createEmbed({
              title: "📋 Estado VIP da Guild",
              color: 0x9b59b6,
              fields: [
                {
                  name: `Tiers (${Object.keys(tiers).length})`,
                  value:
                    Object.values(tiers)
                      .map((t) => `• **${t.id}** | cargo: <@&${t.roleId}> | preço: ${t.preco_shop || 0} | daily+: ${t.valor_daily_extra || 0}`)
                      .join("\n") || "Nenhum tier configurado.",
                },
                {
                  name: `VIPs Ativos (${active.length})`,
                  value:
                    active
                      .slice(0, 20)
                      .map((v) => `• <@${v.userId}> | tier: **${v.tierId}**${v.expiresAt ? ` | expira <t:${Math.floor(v.expiresAt / 1000)}:R>` : ""}`)
                      .join("\n") || "Nenhum VIP ativo.",
                },
              ],
            }),
          ],
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error("[vipadmin.execute]", error);
      return interaction.reply({ embeds: [createErrorEmbed(`Falha no vipadmin: ${error.message}`)], ephemeral: true });
    }
  },

  async handleSelectMenu(interaction) {
    if (!interaction.customId.startsWith("vipadmin:tier:")) return;

    const [, , guildId, tierId] = interaction.customId.split(":");
    const category = interaction.values[0];
    if (interaction.guildId !== guildId) {
      return interaction.reply({ embeds: [createErrorEmbed("Este menu não pertence a esta guild.")], ephemeral: true });
    }

    if (category === "economia_loja") {
      const modal = new ModalBuilder().setCustomId(`vipadmin:modal:economia:${guildId}:${tierId}`).setTitle("💰 Economia & Loja");
      const daily = new TextInputBuilder().setCustomId("valor_daily_extra").setLabel("valor_daily_extra (moeda fixa)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Ex: 250");
      const preco = new TextInputBuilder().setCustomId("preco_shop").setLabel("preco_shop (custo do VIP)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Ex: 5000");
      const bonus = new TextInputBuilder().setCustomId("bonus_inicial").setLabel("bonus_inicial (moedas ao ativar)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Ex: 1000");
      modal.addComponents(new ActionRowBuilder().addComponents(daily), new ActionRowBuilder().addComponents(preco), new ActionRowBuilder().addComponents(bonus));
      return interaction.showModal(modal);
    }

    if (category === "social_limites") {
      const modal = new ModalBuilder().setCustomId(`vipadmin:modal:social:${guildId}:${tierId}`).setTitle("👥 Social & Limites");
      const familia = new TextInputBuilder().setCustomId("limite_familia").setLabel("limite_familia (número)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Ex: 12");
      const damas = new TextInputBuilder().setCustomId("limite_damas").setLabel("limite_damas (número)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Ex: 3");
      const presentear = new TextInputBuilder().setCustomId("pode_presentear").setLabel("pode_presentear (true/false)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("true ou false");
      modal.addComponents(new ActionRowBuilder().addComponents(familia), new ActionRowBuilder().addComponents(damas), new ActionRowBuilder().addComponents(presentear));
      return interaction.showModal(modal);
    }

    if (category === "permissoes_tecnicas") {
      const modal = new ModalBuilder().setCustomId(`vipadmin:modal:tecnico:${guildId}:${tierId}`).setTitle("⚡ Permissões Técnicas");
      const slowmode = new TextInputBuilder().setCustomId("ignorar_slowmode").setLabel("ignorar_slowmode (true/false)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("true ou false");
      const callVip = new TextInputBuilder().setCustomId("criar_call_vip").setLabel("criar_call_vip (true/false)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("true ou false");
      const cor = new TextInputBuilder().setCustomId("cor_exclusiva").setLabel("cor_exclusiva (hex)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("#FFD700");
      modal.addComponents(new ActionRowBuilder().addComponents(slowmode), new ActionRowBuilder().addComponents(callVip), new ActionRowBuilder().addComponents(cor));
      return interaction.showModal(modal);
    }

    return interaction.reply({ embeds: [createErrorEmbed("Categoria inválida.")], ephemeral: true });
  },

  async handleModal(interaction, services) {
    if (!interaction.customId.startsWith("vipadmin:modal:")) return;

    const vipConfig = services?.vipConfig;
    if (!vipConfig) {
      return interaction.reply({ embeds: [createErrorEmbed("Serviço VIP indisponível para salvar modal.")], ephemeral: true });
    }

    const [, , category, guildId, tierId] = interaction.customId.split(":");
    if (interaction.guildId !== guildId) {
      return interaction.reply({ embeds: [createErrorEmbed("Este modal não pertence a esta guild.")], ephemeral: true });
    }

    try {
      const tiers = await vipConfig.getGuildTiers(guildId);
      const current = tiers[tierId];
      if (!current) {
        return interaction.reply({ embeds: [createErrorEmbed("Tier não encontrado. Recrie com /vipadmin tier.")], ephemeral: true });
      }

      const patch = {};

      if (category === "economia") {
        patch.valor_daily_extra = Number(interaction.fields.getTextInputValue("valor_daily_extra"));
        patch.preco_shop = Number(interaction.fields.getTextInputValue("preco_shop"));
        patch.bonus_inicial = Number(interaction.fields.getTextInputValue("bonus_inicial"));
      }

      if (category === "social") {
        patch.limite_familia = Number(interaction.fields.getTextInputValue("limite_familia"));
        patch.limite_damas = Number(interaction.fields.getTextInputValue("limite_damas"));
        patch.pode_presentear = ensureBooleanString(interaction.fields.getTextInputValue("pode_presentear"), "pode_presentear");
      }

      if (category === "tecnico") {
        patch.ignorar_slowmode = ensureBooleanString(interaction.fields.getTextInputValue("ignorar_slowmode"), "ignorar_slowmode");
        patch.criar_call_vip = ensureBooleanString(interaction.fields.getTextInputValue("criar_call_vip"), "criar_call_vip");
        patch.cor_exclusiva = interaction.fields.getTextInputValue("cor_exclusiva").trim();
      }

      await vipConfig.setGuildTier(guildId, tierId, { ...current, ...patch, id: tierId });

      return interaction.reply({
        embeds: [
          createEmbed({
            title: "✅ Categoria salva",
            description: `Configuração **${category}** salva com sucesso para o tier **${tierId}**.`,
            color: 0x2ecc71,
            fields: Object.entries(patch).map(([key, value]) => ({ name: key, value: `\`${value}\``, inline: true })),
          }),
        ],
        ephemeral: true,
      });
    } catch (error) {
      console.error("[vipadmin.handleModal]", error);
      return interaction.reply({ embeds: [createErrorEmbed(`Erro ao salvar modal: ${error.message}`)], ephemeral: true });
    }
  },
};
