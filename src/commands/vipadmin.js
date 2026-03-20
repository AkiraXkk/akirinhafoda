const { logger } = require("../logger");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");

function parseBool(raw) {
  if (raw === "" || raw == null) return null;
  return raw === "1" || raw.toLowerCase() === "sim" || raw.toLowerCase() === "true";
}

function parseNum(raw) {
  if (raw === "" || raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function buildMainDashEmbed(guildId, gConf, tiersCount) {
  return new EmbedBuilder()
    .setTitle("👑 Painel Supremo VIP")
    .setColor(0x5865f2)
    .setDescription([
      "Central de gestão VIP e Família.",
      "",
      "⚙️ Infraestrutura & Setup",
      "👑 Gestão de Tiers",
      "👤 Gerenciar Membros",
      "🏠 Gestão de Família (Force)",
      "",
      `Servidor: \`${guildId}\``,
      `Tiers cadastrados: **${tiersCount}**`,
      `Canal de logs: ${gConf?.logChannelId ? `<#${gConf.logChannelId}>` : "Não definido"}`,
    ].join("\n"));
}

function buildMainDashComponents(guildId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vipadmin_dash:infra:${guildId}:root`).setLabel("⚙️ Infraestrutura & Setup").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`vipadmin_dash:tiers:${guildId}:root`).setLabel("👑 Gestão de Tiers").setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vipadmin_dash:members:${guildId}:root`).setLabel("👤 Gerenciar Membros").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`vipadmin_dash:family:${guildId}:root`).setLabel("🏠 Gestão de Família").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`vipadmin_dash:close:${guildId}:root`).setLabel("✖ Fechar").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildTierDashComponents(tierId, guildId, hasTiers) {
  const id = (action) => `vipadmin_dash:${action}:${guildId}:${tierId}`;

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(id("set_base_roles")).setLabel("🎭 Definir Cargos Base").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(id("add_tier")).setLabel("➕ Adicionar/Editar Tier").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(id("remove_tier")).setLabel("🗑️ Remover Tier").setStyle(ButtonStyle.Danger).setDisabled(!hasTiers),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(id("cotas")).setLabel("⚙️ Cotas Avançadas").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(id("set_booster")).setLabel("🚀 Tier Booster Exclusivo").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(id("set_dama_roles")).setLabel("💍 Cargos de Primeira Dama").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`vipadmin_dash:tiers:${guildId}:root`).setLabel("◀ Tiers").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function buildTierDashEmbed(guildId, tierId, vipConfig, vipService) {
  const gConf = vipService.getGuildConfig(guildId);
  const tier = await vipConfig.getTierConfig(guildId, tierId);
  const tiers = await vipConfig.getGuildTiers(guildId);
  const allTierNames = Object.keys(tiers).map((id) => `\`${id}\``).join(", ") || "—";
  const cotasDesc = (() => {
    if (!tier?.cotasConfig) return "Não configurado";
    const regras = Array.isArray(tier.cotasConfig) ? tier.cotasConfig : [tier.cotasConfig];
    return regras.map((r) => {
      if (r.modo === "A") return `🔹 Modo A: **${r.quantidade}** cotas hierárquicas`;
      if (r.modo === "B") return `🔸 Modo B: **${r.quantidade}** cotas do tier \`${r.targetTierId}\``;
      return "Desconhecido";
    }).join("\n");
  })();

  return new EmbedBuilder()
    .setTitle(`⚙️ Painel VIP Admin — Tier \`${tierId}\``)
    .setColor(0x5865f2)
    .setDescription([
      `**Cargo:** ${tier?.roleId ? `<@&${tier.roleId}>` : "❌ Não definido"}`,
      `**Nome:** ${tier?.name || tierId}`,
      `**Tier Booster:** ${gConf?.boosterTierId === tierId ? "✅ Este tier é o Tier Booster Exclusivo" : "—"}`,
      "",
      `🔑 Cargo Base VIP: ${gConf?.vipBaseRoleId ? `<@&${gConf.vipBaseRoleId}>` : "❌ Não definido"}`,
      `👻 Cargo Fantasma: ${gConf?.cargoFantasmaId ? `<@&${gConf.cargoFantasmaId}>` : "❌ Não definido"}`,
      `📌 Sep. VIP: ${gConf?.vipRoleSeparatorId ? `<@&${gConf.vipRoleSeparatorId}>` : "❌ Não definido"}`,
      `📌 Sep. Família: ${gConf?.familyRoleSeparatorId ? `<@&${gConf.familyRoleSeparatorId}>` : "❌ Não definido"}`,
      "",
      `💰 Daily extra: \`${tier?.valor_daily_extra ?? 0}\` | Bônus inicial: \`${tier?.bonus_inicial ?? 0}\` | Midas: \`${tier?.midas ? "Sim" : "Não"}\``,
      `👨‍👩‍👧 Família: \`${tier?.vagas_familia ?? 0}\` vagas | Damas: \`${tier?.primeiras_damas ?? 0}\``,
      `⚡ Call: \`${tier?.canCall ? "Sim" : "Não"}\` | Chat: \`${tier?.chat_privado ? "Sim" : "Não"}\` | Cargo Custom: \`${tier?.hasCustomRole ? "Sim" : "Não"}\``,
      `🛒 Shop: \`${tier?.shop_enabled ? "Ativo" : "Inativo"}\` — Preço: \`${tier?.shop_fixed_price ?? "—"}\` fixo / \`${tier?.shop_price_per_day ?? "—"}\` por dia`,
      "",
      "Cotas:",
      cotasDesc,
      "",
      `Todos os tiers: ${allTierNames}`,
    ].join("\n"));
}

async function buildFamilyInfoEmbed(familyService, ownerId) {
  const family = await familyService.getFamilyByOwner(ownerId);
  if (!family) {
    return new EmbedBuilder().setTitle("🏠 Família não encontrada").setColor(0xed4245).setDescription("Este usuário não lidera uma família.");
  }
  return new EmbedBuilder()
    .setTitle(`🏠 Família: ${family.name}`)
    .setColor(0x9b59b6)
    .addFields(
      { name: "Líder", value: `<@${family.ownerId}>`, inline: true },
      { name: "Ocupação", value: `👥 ${family.members.length} / ${family.maxMembers}`, inline: true },
      { name: "ID Interno", value: `\`${family.id}\`` },
    );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipadmin")
    .setDescription("👑 Painel Supremo de Administração VIP e Família")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const { vip: vipService, vipConfig } = interaction.client.services;
    const guildId = interaction.guildId;
    const gConf = vipService.getGuildConfig(guildId);
    const tiers = await vipConfig.getGuildTiers(guildId);

    return interaction.reply({
      embeds: [buildMainDashEmbed(guildId, gConf, Object.keys(tiers).length)],
      components: buildMainDashComponents(guildId),
      flags: MessageFlags.Ephemeral,
    });
  },

  async handleButton(interaction) {
    if (!interaction.customId?.startsWith("vipadmin_")) return;
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: "❌ Você não tem permissão.", flags: MessageFlags.Ephemeral });
    }

    const { vipConfig, vip: vipService, family: familyService, vipChannel, vipRole } = interaction.client.services;

    if (interaction.customId.startsWith("vipadmin_dash:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const guildId = parts[2];
      const targetId = parts[3];

      if (interaction.guildId !== guildId) {
        return interaction.reply({ content: "Este painel pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      }

      if (action === "close") {
        return interaction.message.delete().catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
      }

      if (action === "home") {
        const gConf = vipService.getGuildConfig(guildId);
        const tiers = await vipConfig.getGuildTiers(guildId);
        return interaction.update({
          embeds: [buildMainDashEmbed(guildId, gConf, Object.keys(tiers).length)],
          components: buildMainDashComponents(guildId),
        });
      }

      if (action === "infra") {
        const gConf = vipService.getGuildConfig(guildId);
        const embed = new EmbedBuilder()
          .setTitle("⚙️ Infraestrutura & Setup")
          .setColor(0x5865f2)
          .setDescription([
            `📋 Logs: ${gConf?.logChannelId ? `<#${gConf.logChannelId}>` : "—"}`,
            `📁 Categoria VIP: ${gConf?.vipCategoryId ? `<#${gConf.vipCategoryId}>` : "—"}`,
            `📁 Categoria Família: ${gConf?.familyCategoryId ? `<#${gConf.familyCategoryId}>` : "—"}`,
            `🔊 Criar Call: ${gConf?.criarCallChannelId ? `<#${gConf.criarCallChannelId}>` : "—"}`,
            `📌 Sep. VIP: ${gConf?.vipRoleSeparatorId ? `<@&${gConf.vipRoleSeparatorId}>` : "—"}`,
            `📌 Sep. Família: ${gConf?.familyRoleSeparatorId ? `<@&${gConf.familyRoleSeparatorId}>` : "—"}`,
            `🔑 Cargo Base VIP: ${gConf?.vipBaseRoleId ? `<@&${gConf.vipBaseRoleId}>` : "—"}`,
            `👻 Cargo Fantasma: ${gConf?.cargoFantasmaId ? `<@&${gConf.cargoFantasmaId}>` : "—"}`,
          ].join("\n"));
        return interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`vipadmin_dash:infra_setup:${guildId}:root`).setLabel("⚙️ Configurar IDs").setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`vipadmin_dash:set_base_roles:${guildId}:root`).setLabel("🎭 Cargos Base").setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`vipadmin_dash:home:${guildId}:root`).setLabel("◀ Voltar").setStyle(ButtonStyle.Secondary),
            ),
          ],
        });
      }

      if (action === "infra_setup") {
        const gConf = vipService.getGuildConfig(guildId);
        const modal = new ModalBuilder()
          .setCustomId(`vipadmin_modal_infra_${guildId}`)
          .setTitle("⚙️ Infraestrutura VIP")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("logChannelId").setLabel("ID do canal de logs").setStyle(TextInputStyle.Short).setRequired(false).setValue(gConf?.logChannelId || ""),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("vipCategoryId").setLabel("ID da categoria VIP").setStyle(TextInputStyle.Short).setRequired(false).setValue(gConf?.vipCategoryId || ""),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("familyCategoryId").setLabel("ID da categoria de família").setStyle(TextInputStyle.Short).setRequired(false).setValue(gConf?.familyCategoryId || ""),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("criarCallChannelId").setLabel("ID do canal Criar Call").setStyle(TextInputStyle.Short).setRequired(false).setValue(gConf?.criarCallChannelId || ""),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("vipRoleSeparatorId").setLabel("ID do separador VIP").setStyle(TextInputStyle.Short).setRequired(false).setValue(gConf?.vipRoleSeparatorId || ""),
            ),
          );
        return interaction.showModal(modal);
      }

      if (action === "tiers") {
        const tiers = await vipConfig.getGuildTiers(guildId);
        const tierIds = Object.keys(tiers);
        const embed = new EmbedBuilder()
          .setTitle("👑 Gestão de Tiers")
          .setColor(0x5865f2)
          .setDescription(tierIds.length ? "Selecione um tier no menu para abrir o painel de edição." : "Nenhum tier cadastrado. Crie um novo tier.");

        const components = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`vipadmin_dash:create_tier:${guildId}:root`).setLabel("➕ Criar Novo Tier").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`vipadmin_dash:home:${guildId}:root`).setLabel("◀ Voltar").setStyle(ButtonStyle.Secondary),
          ),
        ];

        if (tierIds.length) {
          components.unshift(
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`vipadmin_tier_select:${guildId}`)
                .setPlaceholder("Selecione um Tier")
                .addOptions(
                  tierIds.slice(0, 25).map((id) => ({
                    label: tiers[id]?.name ? `${tiers[id].name}`.slice(0, 100) : id,
                    description: `ID: ${id}`.slice(0, 100),
                    value: id,
                  })),
                ),
            ),
          );
        }

        return interaction.update({ embeds: [embed], components });
      }

      if (action === "create_tier") {
        const modal = new ModalBuilder()
          .setCustomId(`vipadmin_modal_create_tier_${guildId}`)
          .setTitle("➕ Criar novo Tier")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("tierId").setLabel("ID do tier").setStyle(TextInputStyle.Short).setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("roleId").setLabel("ID do cargo Discord").setStyle(TextInputStyle.Short).setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("tierName").setLabel("Nome de exibição (opcional)").setStyle(TextInputStyle.Short).setRequired(false),
            ),
          );
        return interaction.showModal(modal);
      }

      if (action === "members") {
        const embed = new EmbedBuilder()
          .setTitle("👤 Gerenciar Membros")
          .setColor(0x57f287)
          .setDescription("Selecione um membro para aplicar ações de VIP.");
        const userSelect = new UserSelectMenuBuilder()
          .setCustomId(`vipadmin_member_select:${guildId}`)
          .setPlaceholder("Selecione um membro")
          .setMinValues(1)
          .setMaxValues(1);
        return interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(userSelect),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`vipadmin_dash:home:${guildId}:root`).setLabel("◀ Voltar").setStyle(ButtonStyle.Secondary),
            ),
          ],
        });
      }

      if (action === "member_give") {
        const modal = new ModalBuilder()
          .setCustomId(`vipadmin_modal_member_give_${guildId}_${targetId}`)
          .setTitle("👑 Dar VIP")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("tierId").setLabel("ID do Tier").setStyle(TextInputStyle.Short).setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("dias").setLabel("Duração em dias").setStyle(TextInputStyle.Short).setRequired(true),
            ),
          );
        return interaction.showModal(modal);
      }

      if (action === "member_remove") {
        const target = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!target) {
          return interaction.reply({ content: "❌ Membro não encontrado no servidor.", flags: MessageFlags.Ephemeral });
        }
        await vipChannel.deleteVipChannels(target.id, { guildId });
        await vipRole.deletePersonalRole(target.id, { guildId });
        const data = await vipService.getVipData(guildId, target.id);
        if (data?.tierId) await vipRole.removeTierRole(target.id, data.tierId, { guildId });
        await vipService.removeVip(guildId, target.id);
        return interaction.reply({ content: `🚫 VIP de <@${target.id}> removido.`, flags: MessageFlags.Ephemeral });
      }

      if (action === "member_info") {
        const data = await vipService.getVipData(guildId, targetId);
        if (!data) return interaction.reply({ content: "ℹ️ Este membro não possui VIP ativo.", flags: MessageFlags.Ephemeral });
        const exp = data.expiresAt ? `<t:${Math.floor(data.expiresAt / 1000)}:R>` : "Permanente";
        const embed = new EmbedBuilder()
          .setTitle("ℹ️ Informações VIP do Membro")
          .setColor(0x5865f2)
          .setDescription(`<@${targetId}>`)
          .addFields({ name: "Tier", value: `\`${data.tierId || "—"}\``, inline: true }, { name: "Expira", value: exp, inline: true });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (action === "family") {
        const embed = new EmbedBuilder()
          .setTitle("🏠 Gestão de Família (Force)")
          .setColor(0x9b59b6)
          .setDescription("Selecione o dono da família para abrir ações administrativas.");
        const userSelect = new UserSelectMenuBuilder()
          .setCustomId(`vipadmin_family_owner_select:${guildId}`)
          .setPlaceholder("Selecione o dono da família")
          .setMinValues(1)
          .setMaxValues(1);
        return interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(userSelect),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`vipadmin_dash:home:${guildId}:root`).setLabel("◀ Voltar").setStyle(ButtonStyle.Secondary),
            ),
          ],
        });
      }

      if (action === "family_delete") {
        await familyService.deleteFamily(interaction.guild, targetId);
        return interaction.reply({ content: `🗑️ Família de <@${targetId}> apagada e canais limpos.`, flags: MessageFlags.Ephemeral });
      }

      if (action === "family_limit") {
        const modal = new ModalBuilder()
          .setCustomId(`vipadmin_modal_family_limit_${guildId}_${targetId}`)
          .setTitle("🏠 Atualizar limite da família")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("vagas").setLabel("Novo limite de vagas").setStyle(TextInputStyle.Short).setRequired(true),
            ),
          );
        return interaction.showModal(modal);
      }

      if (action === "family_info") {
        const embed = await buildFamilyInfoEmbed(familyService, targetId);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (action === "set_base_roles") {
        const gConf = vipService.getGuildConfig(guildId);
        const modal = new ModalBuilder()
          .setCustomId(`vipadmin_modal_base_${guildId}`)
          .setTitle("🎭 Definir Cargos Base VIP")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("vipBaseRoleId").setLabel("ID do Cargo Base VIP global").setStyle(TextInputStyle.Short).setRequired(false).setValue(gConf?.vipBaseRoleId || ""),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("cargoFantasmaId").setLabel("ID do Cargo Fantasma (Vigilante)").setStyle(TextInputStyle.Short).setRequired(false).setValue(gConf?.cargoFantasmaId || ""),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("vipRoleSeparatorId").setLabel("ID do Separador VIP").setStyle(TextInputStyle.Short).setRequired(false).setValue(gConf?.vipRoleSeparatorId || ""),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("familyRoleSeparatorId").setLabel("ID do Separador de Família").setStyle(TextInputStyle.Short).setRequired(false).setValue(gConf?.familyRoleSeparatorId || ""),
            ),
          );
        return interaction.showModal(modal);
      }

      if (action === "add_tier") {
        const tier = await vipConfig.getTierConfig(guildId, targetId);
        if (!tier) return interaction.reply({ content: `❌ Tier \`${targetId}\` não encontrado no banco.`, flags: MessageFlags.Ephemeral });
        const id = (sec) => `vipadmin_tier_section:${sec}:${guildId}:${targetId}`;
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(id("eco")).setLabel("💰 Economia").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(id("soc")).setLabel("👨‍👩‍👧 Social").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(id("tec")).setLabel("⚡ Técnico").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(id("shop")).setLabel("🛒 Loja").setStyle(ButtonStyle.Secondary),
        );
        return interaction.reply({ content: `Qual seção deseja editar para o tier \`${targetId}\`?`, components: [row], flags: MessageFlags.Ephemeral });
      }

      if (action === "remove_tier") {
        const tiers = await vipConfig.getGuildTiers(guildId);
        if (!tiers[targetId]) return interaction.reply({ content: `❌ Tier \`${targetId}\` não encontrado.`, flags: MessageFlags.Ephemeral });
        await vipConfig.removeTier(guildId, targetId);
        const newTiers = await vipConfig.getGuildTiers(guildId);
        const ids = Object.keys(newTiers);
        if (!ids.length) {
          return interaction.update({
            embeds: [new EmbedBuilder().setTitle("👑 Gestão de Tiers").setColor(0x5865f2).setDescription("Tier removido. Nenhum tier restante.")],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`vipadmin_dash:create_tier:${guildId}:root`).setLabel("➕ Criar Novo Tier").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`vipadmin_dash:home:${guildId}:root`).setLabel("◀ Voltar").setStyle(ButtonStyle.Secondary),
              ),
            ],
          });
        }
        const firstTierId = ids[0];
        const embed = await buildTierDashEmbed(guildId, firstTierId, vipConfig, vipService);
        return interaction.update({ embeds: [embed], components: buildTierDashComponents(firstTierId, guildId, true) });
      }

      if (action === "set_booster") {
        const gConf = vipService.getGuildConfig(guildId);
        const modal = new ModalBuilder()
          .setCustomId(`vipadmin_modal_booster_${guildId}`)
          .setTitle("🚀 Configurar Tier Booster Exclusivo")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("boosterTierId").setLabel("ID do Tier Booster (vazio para remover)").setStyle(TextInputStyle.Short).setRequired(false).setValue(gConf?.boosterTierId || ""),
            ),
          );
        return interaction.showModal(modal);
      }

      if (action === "set_dama_roles") {
        const gConf = await vipService.getGuildConfig(guildId) || {};
        const currentIds = gConf?.primeraDamaRoleIds || (gConf?.damaRoleId ? [gConf.damaRoleId] : []);
        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId(`vipadmin_roleselmenu_dama_${guildId}`)
          .setPlaceholder("Selecione os cargos de Primeira Dama")
          .setMinValues(0)
          .setMaxValues(10)
          .setDefaultRoles(currentIds.filter(Boolean));
        const embed = new EmbedBuilder()
          .setTitle("💍 Configurar Cargos de Primeira Dama")
          .setColor(0xe91e63)
          .setDescription(currentIds.length ? `Configuração atual: ${currentIds.map((id) => `<@&${id}>`).join(", ")}` : "Nenhum cargo configurado atualmente.");
        return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(roleSelect)] });
      }

      if (action === "cotas") {
        const tier = await vipConfig.getTierConfig(guildId, targetId);
        const cotasConfig = tier?.cotasConfig;
        const regras = Array.isArray(cotasConfig) ? cotasConfig : (cotasConfig ? [cotasConfig] : []);
        const descAtual = regras.length
          ? regras.map((r, i) => {
            if (r.modo === "A") return `[${i + 1}] Modo A: ${r.quantidade} cotas hierárquicas`;
            if (r.modo === "B") return `[${i + 1}] Modo B: ${r.quantidade} cotas do tier \`${r.targetTierId}\``;
            return `[${i + 1}] Desconhecido`;
          }).join("\n")
          : "Sem cotas configuradas.";
        const idC = (a) => `vipadmin_cotas:${a}:${guildId}:${targetId}`;
        const embed = new EmbedBuilder().setTitle(`⚙️ Cotas Avançadas — \`${targetId}\``).setColor(0xfee75c).setDescription(`Regras atuais:\n\n${descAtual}`);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(idC("add_a")).setLabel("➕ Adicionar Modo A").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(idC("add_b")).setLabel("➕ Adicionar Modo B").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(idC("clear")).setLabel("🗑️ Limpar Todas").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(idC("back")).setLabel("◀ Voltar").setStyle(ButtonStyle.Secondary),
        );
        return interaction.update({ embeds: [embed], components: [row] });
      }
    }

    if (interaction.customId.startsWith("vipadmin_tier_section:")) {
      const parts = interaction.customId.split(":");
      const section = parts[1];
      const guildId = parts[2];
      const tierId = parts[3];
      if (interaction.guildId !== guildId) return interaction.reply({ content: "Painel de outro servidor.", flags: MessageFlags.Ephemeral });
      const tier = await vipConfig.getTierConfig(guildId, tierId);
      if (!tier) return interaction.reply({ content: `Tier \`${tierId}\` não encontrado.`, flags: MessageFlags.Ephemeral });
      return showSectionModal(interaction, section, guildId, tierId, tier);
    }

    if (interaction.customId.startsWith("vipadmin_cotas:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const guildId = parts[2];
      const tierId = parts[3];
      if (interaction.guildId !== guildId) return interaction.reply({ content: "Painel de outro servidor.", flags: MessageFlags.Ephemeral });
      if (action === "back") {
        const tiers = await vipConfig.getGuildTiers(guildId);
        const embed = await buildTierDashEmbed(guildId, tierId, vipConfig, vipService);
        return interaction.update({ embeds: [embed], components: buildTierDashComponents(tierId, guildId, Object.keys(tiers).length > 0) });
      }
      if (action === "clear") {
        await vipConfig.updateTier(guildId, tierId, "cotas", { cotasConfig: [] });
        return interaction.reply({ content: `✅ Todas as cotas do tier \`${tierId}\` foram removidas.`, flags: MessageFlags.Ephemeral });
      }
      if (action === "add_a") {
        const modal = new ModalBuilder()
          .setCustomId(`vipadmin_modal_cota_A_${guildId}_${tierId}`)
          .setTitle(`Cota Modo A — ${tierId}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("quantidade").setLabel("Quantidade de cotas hierárquicas").setStyle(TextInputStyle.Short).setRequired(true),
            ),
          );
        return interaction.showModal(modal);
      }
      if (action === "add_b") {
        const modal = new ModalBuilder()
          .setCustomId(`vipadmin_modal_cota_B_${guildId}_${tierId}`)
          .setTitle(`Cota Modo B — ${tierId}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("targetTierId").setLabel("ID do tier alvo").setStyle(TextInputStyle.Short).setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("quantidade").setLabel("Quantidade de cotas").setStyle(TextInputStyle.Short).setRequired(true),
            ),
          );
        return interaction.showModal(modal);
      }
    }
  },

  async handleSelectMenu(interaction) {
    return this.handleStringSelectMenu(interaction);
  },

  async handleStringSelectMenu(interaction) {
    if (!interaction.customId?.startsWith("vipadmin_tier_select:")) return;
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: "❌ Você não tem permissão.", flags: MessageFlags.Ephemeral });
    }
    const guildId = interaction.customId.split(":")[1];
    if (interaction.guildId !== guildId) {
      return interaction.reply({ content: "Este menu pertence a outro servidor.", flags: MessageFlags.Ephemeral });
    }
    const tierId = interaction.values?.[0];
    if (!tierId) return interaction.reply({ content: "❌ Nenhum tier selecionado.", flags: MessageFlags.Ephemeral });
    const { vipConfig, vip: vipService } = interaction.client.services;
    const tiers = await vipConfig.getGuildTiers(guildId);
    const embed = await buildTierDashEmbed(guildId, tierId, vipConfig, vipService);
    return interaction.update({
      embeds: [embed],
      components: buildTierDashComponents(tierId, guildId, Object.keys(tiers).length > 0),
    });
  },

  async handleUserSelectMenu(interaction) {
    if (!interaction.inGuild()) return;
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: "❌ Você não tem permissão.", flags: MessageFlags.Ephemeral });
    }

    const { vip: vipService, family: familyService } = interaction.client.services;

    if (interaction.customId.startsWith("vipadmin_member_select:")) {
      const guildId = interaction.customId.split(":")[1];
      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este menu pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      const targetId = interaction.values?.[0];
      const vipData = targetId ? await vipService.getVipData(guildId, targetId) : null;
      const exp = vipData?.expiresAt ? `<t:${Math.floor(vipData.expiresAt / 1000)}:R>` : "Sem VIP ativo";
      const embed = new EmbedBuilder()
        .setTitle("👤 Painel de Membro")
        .setColor(0x57f287)
        .setDescription(`Membro selecionado: <@${targetId}>`)
        .addFields(
          { name: "Tier atual", value: vipData?.tierId ? `\`${vipData.tierId}\`` : "—", inline: true },
          { name: "Expiração", value: exp, inline: true },
        );
      return interaction.update({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`vipadmin_dash:member_give:${guildId}:${targetId}`).setLabel("Dar VIP").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`vipadmin_dash:member_remove:${guildId}:${targetId}`).setLabel("Remover VIP").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`vipadmin_dash:member_info:${guildId}:${targetId}`).setLabel("Ver Info").setStyle(ButtonStyle.Secondary),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`vipadmin_dash:members:${guildId}:root`).setLabel("◀ Escolher outro membro").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`vipadmin_dash:home:${guildId}:root`).setLabel("🏠 Painel").setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
    }

    if (interaction.customId.startsWith("vipadmin_family_owner_select:")) {
      const guildId = interaction.customId.split(":")[1];
      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este menu pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      const ownerId = interaction.values?.[0];
      const embed = await buildFamilyInfoEmbed(familyService, ownerId);
      return interaction.update({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`vipadmin_dash:family_delete:${guildId}:${ownerId}`).setLabel("🗑️ Deletar Família").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`vipadmin_dash:family_limit:${guildId}:${ownerId}`).setLabel("🔢 Alterar Limite").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`vipadmin_dash:family_info:${guildId}:${ownerId}`).setLabel("ℹ️ Ver Info").setStyle(ButtonStyle.Secondary),
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`vipadmin_dash:family:${guildId}:root`).setLabel("◀ Escolher outro dono").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`vipadmin_dash:home:${guildId}:root`).setLabel("🏠 Painel").setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
    }
  },

  async handleModal(interaction) {
    if (!interaction.customId?.startsWith("vipadmin_modal_")) return;
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: "❌ Sem permissão.", flags: MessageFlags.Ephemeral });
    }

    const { vipConfig, vip: vipService, family: familyService, vipChannel, vipRole } = interaction.client.services;
    const customId = interaction.customId;

    if (customId.startsWith("vipadmin_modal_infra_")) {
      const guildId = customId.replace("vipadmin_modal_infra_", "");
      const logChannelId = interaction.fields.getTextInputValue("logChannelId").trim() || null;
      const vipCategoryId = interaction.fields.getTextInputValue("vipCategoryId").trim() || null;
      const familyCategoryId = interaction.fields.getTextInputValue("familyCategoryId").trim() || null;
      const criarCallChannelId = interaction.fields.getTextInputValue("criarCallChannelId").trim() || null;
      const vipRoleSeparatorId = interaction.fields.getTextInputValue("vipRoleSeparatorId").trim() || null;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });

      for (const [label, id, kind] of [
        ["Canal de logs", logChannelId, "channel"],
        ["Categoria VIP", vipCategoryId, "channel"],
        ["Categoria Família", familyCategoryId, "channel"],
        ["Canal Criar Call", criarCallChannelId, "channel"],
        ["Separador VIP", vipRoleSeparatorId, "role"],
      ]) {
        if (!id) continue;
        if (kind === "channel") {
          const ch = await interaction.guild.channels.fetch(id).catch(() => null);
          if (!ch) return interaction.editReply({ content: `❌ ${label}: canal com ID \`${id}\` não encontrado.` });
        } else {
          const role = await interaction.guild.roles.fetch(id).catch(() => null);
          if (!role) return interaction.editReply({ content: `❌ ${label}: cargo com ID \`${id}\` não encontrado.` });
        }
      }

      await vipService.setGuildConfig(guildId, {
        logChannelId,
        vipCategoryId,
        familyCategoryId,
        criarCallChannelId,
        vipRoleSeparatorId,
        separatorId: vipRoleSeparatorId,
      });
      return interaction.editReply({ content: "✅ Infraestrutura atualizada com sucesso." });
    }

    if (customId.startsWith("vipadmin_modal_create_tier_")) {
      const guildId = customId.replace("vipadmin_modal_create_tier_", "");
      const tierId = interaction.fields.getTextInputValue("tierId").trim().toLowerCase();
      const roleId = interaction.fields.getTextInputValue("roleId").trim();
      const tierNameRaw = interaction.fields.getTextInputValue("tierName").trim();
      if (!tierId) return interaction.reply({ content: "❌ ID do tier inválido.", flags: MessageFlags.Ephemeral });
      const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
      if (!role) return interaction.reply({ content: `❌ Cargo com ID \`${roleId}\` não encontrado.`, flags: MessageFlags.Ephemeral });
      await vipConfig.setBase(guildId, tierId, role.id, tierNameRaw || role.name);
      return interaction.reply({ content: `✅ Tier \`${tierId}\` criado/atualizado com cargo <@&${role.id}>.`, flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith("vipadmin_modal_member_give_")) {
      const rest = customId.replace("vipadmin_modal_member_give_", "");
      const [guildId, targetId] = rest.split("_");
      const tierId = interaction.fields.getTextInputValue("tierId").trim().toLowerCase();
      const dias = parseInt(interaction.fields.getTextInputValue("dias").trim(), 10);
      if (!Number.isFinite(dias) || dias < 1) return interaction.reply({ content: "❌ Duração inválida.", flags: MessageFlags.Ephemeral });
      const tier = await vipConfig.getTierConfig(guildId, tierId);
      if (!tier) return interaction.reply({ content: `❌ O Tier \`${tierId}\` não existe.`, flags: MessageFlags.Ephemeral });
      const target = await interaction.guild.members.fetch(targetId).catch(() => null);
      if (!target) return interaction.reply({ content: "❌ Membro não encontrado no servidor.", flags: MessageFlags.Ephemeral });
      const expiresAt = Date.now() + dias * 24 * 60 * 60 * 1000;
      await vipService.addVip(guildId, target.id, { tierId, expiresAt, addedBy: interaction.user.id, source: "admin" });
      await vipRole.assignTierRole(target.id, tierId, { guildId }).catch((err) => interaction.client.services?.log?.error?.({ err }, "assignTierRole falhou no vipadmin"));
      if (tier.canCall || tier.chat_privado) await vipChannel.ensureVipChannels(target.id, { guildId });
      return interaction.reply({ content: `✅ VIP \`${tierId}\` ativado para <@${target.id}> por **${dias}** dias.`, flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith("vipadmin_modal_family_limit_")) {
      const rest = customId.replace("vipadmin_modal_family_limit_", "");
      const [, ownerId] = rest.split("_");
      const vagas = parseInt(interaction.fields.getTextInputValue("vagas").trim(), 10);
      if (!Number.isFinite(vagas) || vagas < 1) return interaction.reply({ content: "❌ Limite inválido.", flags: MessageFlags.Ephemeral });
      const family = await familyService.getFamilyByOwner(ownerId);
      if (!family) return interaction.reply({ content: "❌ Família não localizada.", flags: MessageFlags.Ephemeral });
      await familyService.updateMaxMembers(family.id, vagas);
      return interaction.reply({ content: `✅ Limite de **${family.name}** atualizado para **${vagas}**.`, flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith("vipadmin_modal_base_")) {
      const guildId = customId.replace("vipadmin_modal_base_", "");
      const vipBaseRoleId = interaction.fields.getTextInputValue("vipBaseRoleId").trim() || null;
      const cargoFantasmaId = interaction.fields.getTextInputValue("cargoFantasmaId").trim() || null;
      const vipRoleSepId = interaction.fields.getTextInputValue("vipRoleSeparatorId").trim() || null;
      const familyRoleSepId = interaction.fields.getTextInputValue("familyRoleSeparatorId").trim() || null;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });

      for (const [label, id] of [
        ["Cargo Base VIP", vipBaseRoleId],
        ["Cargo Fantasma", cargoFantasmaId],
        ["Separador VIP", vipRoleSepId],
        ["Separador Família", familyRoleSepId],
      ]) {
        if (!id) continue;
        const role = await interaction.guild.roles.fetch(id).catch(() => null);
        if (!role) return interaction.editReply({ content: `❌ ${label}: cargo com ID \`${id}\` não encontrado.` });
      }

      await vipService.setGuildConfig(guildId, {
        vipBaseRoleId,
        cargoFantasmaId,
        vipRoleSeparatorId: vipRoleSepId,
        familyRoleSeparatorId: familyRoleSepId,
        separatorId: vipRoleSepId,
      });

      return interaction.editReply({ content: "✅ Cargos base atualizados." });
    }

    if (customId.startsWith("vipadmin_modal_booster_")) {
      const guildId = customId.replace("vipadmin_modal_booster_", "");
      const boosterTierId = interaction.fields.getTextInputValue("boosterTierId").trim() || null;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
      if (boosterTierId) {
        const tierExists = await vipConfig.getTierConfig(guildId, boosterTierId).catch(() => null);
        if (!tierExists) return interaction.editReply({ content: `❌ Tier \`${boosterTierId}\` não encontrado.` });
      }
      await vipService.setGuildConfig(guildId, { boosterTierId });
      return interaction.editReply({ content: boosterTierId ? `✅ Tier Booster Exclusivo definido como \`${boosterTierId}\`.` : "✅ Tier Booster removido." });
    }

    if (customId.startsWith("vipadmin_modal_cota_A_")) {
      const rest = customId.replace("vipadmin_modal_cota_A_", "");
      const [guildId, ...tierParts] = rest.split("_");
      const tierId = tierParts.join("_");
      const quantidade = parseInt(interaction.fields.getTextInputValue("quantidade").trim(), 10);
      if (!Number.isFinite(quantidade) || quantidade < 1) return interaction.reply({ content: "❌ Quantidade inválida.", flags: MessageFlags.Ephemeral });
      const tier = await vipConfig.getTierConfig(guildId, tierId);
      const cotasConfig = tier?.cotasConfig;
      const regras = Array.isArray(cotasConfig) ? [...cotasConfig] : (cotasConfig ? [cotasConfig] : []);
      regras.push({ modo: "A", quantidade });
      await vipConfig.updateTier(guildId, tierId, "cotas", { cotasConfig: regras });
      return interaction.reply({ content: `✅ Cota Modo A adicionada ao tier \`${tierId}\`.`, flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith("vipadmin_modal_cota_B_")) {
      const rest = customId.replace("vipadmin_modal_cota_B_", "");
      const [guildId, ...tierParts] = rest.split("_");
      const tierId = tierParts.join("_");
      const targetTierId = interaction.fields.getTextInputValue("targetTierId").trim().toLowerCase();
      const quantidade = parseInt(interaction.fields.getTextInputValue("quantidade").trim(), 10);
      if (!targetTierId) return interaction.reply({ content: "❌ ID do tier alvo não pode ser vazio.", flags: MessageFlags.Ephemeral });
      if (!Number.isFinite(quantidade) || quantidade < 1) return interaction.reply({ content: "❌ Quantidade inválida.", flags: MessageFlags.Ephemeral });
      const targetTierCheck = await vipConfig.getTierConfig(guildId, targetTierId);
      if (!targetTierCheck) return interaction.reply({ content: `❌ Tier alvo \`${targetTierId}\` não encontrado.`, flags: MessageFlags.Ephemeral });
      const tier = await vipConfig.getTierConfig(guildId, tierId);
      const cotasConfig = tier?.cotasConfig;
      const regras = Array.isArray(cotasConfig) ? [...cotasConfig] : (cotasConfig ? [cotasConfig] : []);
      regras.push({ modo: "B", targetTierId, quantidade });
      await vipConfig.updateTier(guildId, tierId, "cotas", { cotasConfig: regras });
      return interaction.reply({ content: `✅ Cota Modo B adicionada ao tier \`${tierId}\`.`, flags: MessageFlags.Ephemeral });
    }

    const parts = customId.split("_");
    const section = parts[2];
    const guildId = parts[3];
    const tierId = parts.slice(4).join("_");

    if (section === "eco") {
      const valor_daily_extra = parseNum(interaction.fields.getTextInputValue("valor_daily_extra")) ?? 0;
      const bonus_inicial = parseNum(interaction.fields.getTextInputValue("bonus_inicial")) ?? 0;
      const midas = parseBool(interaction.fields.getTextInputValue("midas"));
      const preco_shop = parseNum(interaction.fields.getTextInputValue("preco_shop"));
      if (valor_daily_extra < 0) return interaction.reply({ content: "Daily extra inválido.", flags: MessageFlags.Ephemeral });
      if (bonus_inicial < 0) return interaction.reply({ content: "Bônus inicial inválido.", flags: MessageFlags.Ephemeral });
      if (preco_shop !== null && preco_shop < 0) return interaction.reply({ content: "preco_shop inválido.", flags: MessageFlags.Ephemeral });
      await vipConfig.updateTier(guildId, tierId, "eco", { valor_daily_extra, bonus_inicial, ...(midas !== null ? { midas } : {}), ...(preco_shop !== null ? { preco_shop } : {}) });
      return interaction.reply({ content: `✅ Economia do tier \`${tierId}\` atualizada.`, flags: MessageFlags.Ephemeral });
    }

    if (section === "soc") {
      const vagas_familia = parseNum(interaction.fields.getTextInputValue("vagas_familia")) ?? 0;
      const primeiras_damas = parseNum(interaction.fields.getTextInputValue("primeiras_damas")) ?? 0;
      const cotaRoleId = interaction.fields.getTextInputValue("cotaRoleId").trim() || null;
      const pode_presentear = parseBool(interaction.fields.getTextInputValue("pode_presentear"));
      if (vagas_familia < 0) return interaction.reply({ content: "Vagas família inválido.", flags: MessageFlags.Ephemeral });
      if (primeiras_damas < 0) return interaction.reply({ content: "Primeiras damas inválido.", flags: MessageFlags.Ephemeral });
      await vipConfig.updateTier(guildId, tierId, "soc", { vagas_familia, primeiras_damas, cotaRoleId, ...(pode_presentear !== null ? { pode_presentear } : {}) });
      return interaction.reply({ content: `✅ Configuração social do tier \`${tierId}\` atualizada.`, flags: MessageFlags.Ephemeral });
    }

    if (section === "tec") {
      const canCall = parseBool(interaction.fields.getTextInputValue("canCall"));
      const chat_privado = parseBool(interaction.fields.getTextInputValue("chat_privado"));
      const hasCustomRole = parseBool(interaction.fields.getTextInputValue("hasCustomRole"));
      const high_quality_voice = parseBool(interaction.fields.getTextInputValue("high_quality_voice"));
      await vipConfig.updateTier(guildId, tierId, "tec", {
        ...(canCall !== null ? { canCall } : {}),
        ...(chat_privado !== null ? { chat_privado } : {}),
        ...(hasCustomRole !== null ? { hasCustomRole } : {}),
        ...(high_quality_voice !== null ? { high_quality_voice } : {}),
      });
      return interaction.reply({ content: `✅ Configuração técnica do tier \`${tierId}\` atualizada.`, flags: MessageFlags.Ephemeral });
    }

    if (section === "shop") {
      const shop_enabled = parseBool(interaction.fields.getTextInputValue("shop_enabled"));
      const shop_price_per_day = parseNum(interaction.fields.getTextInputValue("shop_price_per_day"));
      const shop_fixed_price = parseNum(interaction.fields.getTextInputValue("shop_fixed_price"));
      const shop_default_days = parseNum(interaction.fields.getTextInputValue("shop_default_days"));
      if (shop_price_per_day !== null && shop_price_per_day < 0) return interaction.reply({ content: "Preço por dia inválido.", flags: MessageFlags.Ephemeral });
      if (shop_fixed_price !== null && shop_fixed_price < 0) return interaction.reply({ content: "Preço fixo inválido.", flags: MessageFlags.Ephemeral });
      if (shop_default_days !== null && shop_default_days < 0) return interaction.reply({ content: "Dias padrão inválidos.", flags: MessageFlags.Ephemeral });
      await vipConfig.updateTier(guildId, tierId, "shop", {
        ...(shop_enabled !== null ? { shop_enabled } : {}),
        ...(shop_price_per_day !== null ? { shop_price_per_day } : {}),
        ...(shop_fixed_price !== null ? { shop_fixed_price } : {}),
        ...(shop_default_days !== null ? { shop_default_days } : {}),
      });
      return interaction.reply({ content: `✅ Loja do tier \`${tierId}\` atualizada.`, flags: MessageFlags.Ephemeral });
    }
  },

  async handleRoleSelectMenu(interaction) {
    if (!interaction.inGuild()) return;
    if (!interaction.customId?.startsWith("vipadmin_roleselmenu_dama_")) return;
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: "❌ Você precisa de permissão ManageGuild para isso.", flags: MessageFlags.Ephemeral });
    }
    const guildId = interaction.customId.split("_")[3];
    if (interaction.guildId !== guildId) return interaction.reply({ content: "Este menu pertence a outro servidor.", flags: MessageFlags.Ephemeral });
    const { vip: vipService } = interaction.client.services;
    const selectedRoleIds = interaction.values || [];
    await interaction.deferUpdate().catch((err) => { logger.warn({ err }, "Falha em deferUpdate no vipadmin roleselmenu dama"); });
    await vipService.setGuildConfig(guildId, { primeraDamaRoleIds: selectedRoleIds });
    const embed = new EmbedBuilder()
      .setTitle("✅ Cargos de Primeira Dama Atualizados")
      .setColor(0xe91e63)
      .setDescription(selectedRoleIds.length ? `Os seguintes cargos foram configurados:\n${selectedRoleIds.map((id) => `• <@&${id}>`).join("\n")}` : "Todos os cargos de Primeira Dama foram removidos.");
    return interaction.editReply({ embeds: [embed], components: [] });
  },
};

async function showSectionModal(interaction, section, guildId, tierId, tier) {
  if (section === "eco") {
    const modal = new ModalBuilder()
      .setCustomId(`vipadmin_modal_eco_${guildId}_${tierId}`)
      .setTitle(`💰 Economia: ${tier.name || tierId}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("valor_daily_extra").setLabel("Daily extra (moedas). Vazio=0").setStyle(TextInputStyle.Short).setRequired(false).setValue(Number.isFinite(tier.valor_daily_extra) ? String(tier.valor_daily_extra) : ""),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("bonus_inicial").setLabel("Bônus inicial ao ganhar VIP. Vazio=0").setStyle(TextInputStyle.Short).setRequired(false).setValue(Number.isFinite(tier.bonus_inicial) ? String(tier.bonus_inicial) : ""),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("midas").setLabel("Midas? (1=sim, 0=não)").setStyle(TextInputStyle.Short).setRequired(false).setValue(tier.midas === true ? "1" : (tier.midas === false ? "0" : "")),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("preco_shop").setLabel("Preço legacy (preco_shop). Vazio=ignorar").setStyle(TextInputStyle.Short).setRequired(false).setValue(Number.isFinite(tier.preco_shop) ? String(tier.preco_shop) : ""),
        ),
      );
    return interaction.showModal(modal);
  }

  if (section === "soc") {
    const modal = new ModalBuilder()
      .setCustomId(`vipadmin_modal_soc_${guildId}_${tierId}`)
      .setTitle(`👨‍👩‍👧 Social: ${tier.name || tierId}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("vagas_familia").setLabel("Vagas família (número). Vazio=0").setStyle(TextInputStyle.Short).setRequired(false).setValue(Number.isFinite(tier.vagas_familia) ? String(tier.vagas_familia) : ""),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("primeiras_damas").setLabel("Cotas de damas (número). Vazio=0").setStyle(TextInputStyle.Short).setRequired(false).setValue(Number.isFinite(tier.primeiras_damas) ? String(tier.primeiras_damas) : ""),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("cotaRoleId").setLabel("Cargo de cota (Role ID). Vazio=nenhum").setStyle(TextInputStyle.Short).setRequired(false).setValue(typeof tier.cotaRoleId === "string" ? tier.cotaRoleId : ""),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("pode_presentear").setLabel("Pode presentear? (1=sim, 0=não)").setStyle(TextInputStyle.Short).setRequired(false).setValue(tier.pode_presentear === true ? "1" : (tier.pode_presentear === false ? "0" : "")),
        ),
      );
    return interaction.showModal(modal);
  }

  if (section === "tec") {
    const modal = new ModalBuilder()
      .setCustomId(`vipadmin_modal_tec_${guildId}_${tierId}`)
      .setTitle(`⚡ Técnico: ${tier.name || tierId}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("canCall").setLabel("Call privada? (1=sim, 0=não)").setStyle(TextInputStyle.Short).setRequired(false).setValue(tier.canCall === true ? "1" : (tier.canCall === false ? "0" : "")),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("chat_privado").setLabel("Chat privado? (1=sim, 0=não)").setStyle(TextInputStyle.Short).setRequired(false).setValue(tier.chat_privado === true ? "1" : (tier.chat_privado === false ? "0" : "")),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("hasCustomRole").setLabel("Cargo personalizado? (1=sim, 0=não)").setStyle(TextInputStyle.Short).setRequired(false).setValue(tier.hasCustomRole === true ? "1" : (tier.hasCustomRole === false ? "0" : "")),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("high_quality_voice").setLabel("Áudio high quality? (1=sim, 0=não)").setStyle(TextInputStyle.Short).setRequired(false).setValue(tier.high_quality_voice === true ? "1" : (tier.high_quality_voice === false ? "0" : "")),
        ),
      );
    return interaction.showModal(modal);
  }

  if (section === "shop") {
    const modal = new ModalBuilder()
      .setCustomId(`vipadmin_modal_shop_${guildId}_${tierId}`)
      .setTitle(`🛒 Loja VIP: ${String(tier.name || tierId).substring(0, 30)}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("shop_enabled").setLabel("Habilitar compra? (1=sim, 0=não)").setStyle(TextInputStyle.Short).setRequired(false).setValue(tier.shop_enabled === true ? "1" : (tier.shop_enabled === false ? "0" : "")),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("shop_price_per_day").setLabel("Preço/dia. Vazio=não usar").setStyle(TextInputStyle.Short).setRequired(false).setValue(Number.isFinite(tier.shop_price_per_day) ? String(tier.shop_price_per_day) : ""),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("shop_fixed_price").setLabel("Preço fixo. Vazio=não usar").setStyle(TextInputStyle.Short).setRequired(false).setValue(Number.isFinite(tier.shop_fixed_price) ? String(tier.shop_fixed_price) : ""),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("shop_default_days").setLabel("Dias padrão. Vazio=usar tier").setStyle(TextInputStyle.Short).setRequired(false).setValue(Number.isFinite(tier.shop_default_days) ? String(tier.shop_default_days) : ""),
        ),
      );
    return interaction.showModal(modal);
  }

  return interaction.reply({ content: "Seção desconhecida.", flags: MessageFlags.Ephemeral });
}
