// ============================================================
//  vipadmin.js  —  Refatorado
//  Novidades:
//   • Sub-menu /tiers tier substituído por Dashboard de Botões
//   • Botão "🎭 Definir Cargos Base" → modal com vipBaseRoleId,
//     cargoFantasmaId, vipRoleSeparatorId, familyRoleSeparatorId
//   • Botão "➕ Adicionar/Editar Tier VIP" → mantém modais eco/soc/tec/shop
//   • Botão "🗑️ Remover Tier VIP" → confirma e deleta
//   • Botão "⚙️ Cotas Avançadas" → painel de configuração Modo A e B
//   • Botão "✖ Fechar"
//   • /membros add e remove integrados com cargo base VIP
//     via vipService (internamente) e vipRole.assignTierRole
// ============================================================

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
  ChannelType,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBool(raw) {
  if (raw === "" || raw == null) return null;
  return raw === "1" || raw.toLowerCase() === "sim" || raw.toLowerCase() === "true";
}

function parseNum(raw) {
  if (raw === "" || raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Constrói a embed do painel principal de um tier
async function buildTierDashEmbed(guildId, tierId, vipConfig, vipService) {
  const gConf = vipService.getGuildConfig(guildId);
  const tier  = await vipConfig.getTierConfig(guildId, tierId);
  const tiers = await vipConfig.getGuildTiers(guildId);

  const allTierNames = Object.keys(tiers)
    .map((id) => `\`${id}\``)
    .join(", ") || "—";

  const cotasDesc = (() => {
    if (!tier?.cotasConfig) return "Não configurado";
    const regras = Array.isArray(tier.cotasConfig) ? tier.cotasConfig : [tier.cotasConfig];
    return regras.map((r) => {
      if (r.modo === "A") return `🔹 Modo A (Hierárquico): **${r.quantidade}** cotas de tiers inferiores`;
      if (r.modo === "B") return `🔸 Modo B (Específico): **${r.quantidade}** cotas do tier \`${r.targetTierId}\``;
      return "Desconhecido";
    }).join("\n");
  })();

  return new EmbedBuilder()
    .setTitle(`⚙️ Painel VIP Admin — Tier \`${tierId}\``)
    .setColor(0x5865f2)
    .setDescription([
      `**Cargo:** ${tier?.roleId ? `<@&${tier.roleId}>` : "❌ Não definido"}`,
      `**Nome:** ${tier?.name || tierId}`,
      "",
      "**── Cargos Globais ──**",
      `🔑 Cargo Base VIP: ${gConf?.vipBaseRoleId   ? `<@&${gConf.vipBaseRoleId}>`        : "❌ Não definido"}`,
      `👻 Cargo Fantasma: ${gConf?.cargoFantasmaId  ? `<@&${gConf.cargoFantasmaId}>`      : "❌ Não definido"}`,
      `📌 Sep. VIP:       ${gConf?.vipRoleSeparatorId ? `<@&${gConf.vipRoleSeparatorId}>` : "❌ Não definido"}`,
      `📌 Sep. Família:   ${gConf?.familyRoleSeparatorId ? `<@&${gConf.familyRoleSeparatorId}>` : "❌ Não definido"}`,
      "",
      "**── Benefícios ──**",
      `💰 Daily extra: \`${tier?.valor_daily_extra ?? 0}\` | Bônus inicial: \`${tier?.bonus_inicial ?? 0}\` | Midas: \`${tier?.midas ? "Sim" : "Não"}\``,
      `👨‍👩‍👧 Família: \`${tier?.vagas_familia ?? 0}\` vagas | Damas: \`${tier?.primeiras_damas ?? 0}\``,
      `⚡ Call: \`${tier?.canCall ? "Sim" : "Não"}\` | Chat: \`${tier?.chat_privado ? "Sim" : "Não"}\` | Cargo Custom: \`${tier?.hasCustomRole ? "Sim" : "Não"}\``,
      `🛒 Shop: \`${tier?.shop_enabled ? "Ativo" : "Inativo"}\` — Preço: \`${tier?.shop_fixed_price ?? "—"}\` fixo / \`${tier?.shop_price_per_day ?? "—"}\` por dia`,
      "",
      "**── Cotas Avançadas ──**",
      cotasDesc,
      "",
      `**Todos os tiers:** ${allTierNames}`,
    ].join("\n"))
    .setFooter({ text: "Use os botões abaixo para configurar." });
}

// Constrói os botões do painel principal
function buildTierDashComponents(tierId, guildId, hasTiers) {
  const id = (action) => `vipadmin_dash:${action}:${guildId}:${tierId}`;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id("set_base_roles"))
      .setLabel("🎭 Definir Cargos Base")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(id("add_tier"))
      .setLabel("➕ Adicionar/Editar Tier")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(id("remove_tier"))
      .setLabel("🗑️ Remover Tier")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!hasTiers),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id("cotas"))
      .setLabel("⚙️ Cotas Avançadas")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(id("close"))
      .setLabel("✖ Fechar")
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

// ─── Módulo Principal ──────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipadmin")
    .setDescription("👑 Painel Supremo de Administração VIP e Família")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommandGroup((group) =>
      group.setName("infra").setDescription("Infraestrutura VIP")
        .addSubcommand((sub) =>
          sub.setName("setup").setDescription("Configura a estrutura técnica do VIP")
            .addChannelOption((opt) => opt.setName("logs").setDescription("Canal de auditoria").setRequired(true))
            .addChannelOption((opt) => opt.setName("categoria").setDescription("Categoria para canais VIP").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
            .addChannelOption((opt) => opt.setName("categoria_familia").setDescription("Categoria de Famílias").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
            .addChannelOption((opt) => opt.setName("canal_criar_call").setDescription("Canal '➕ Criar Call VIP'").addChannelTypes(ChannelType.GuildVoice).setRequired(true))
            .addRoleOption((opt) => opt.setName("separador_vip").setDescription("Separador de cargos VIP personalizados").setRequired(true))
            .addRoleOption((opt) => opt.setName("separador_familia").setDescription("Separador de cargos de Família").setRequired(false))
            .addRoleOption((opt) => opt.setName("cargo_base_vip").setDescription("Cargo Base VIP global").setRequired(false))
            .addRoleOption((opt) => opt.setName("fantasma").setDescription("Cargo Fantasma (Vigilante)").setRequired(false))
        )
    )

    .addSubcommandGroup((group) =>
      group.setName("tiers").setDescription("Gestão de Tiers")
        .addSubcommand((sub) =>
          sub.setName("tier").setDescription("Abre o painel de um tier (cria se não existir)")
            .addStringOption((opt) => opt.setName("id").setDescription("ID do tier (ex: supremo, diamante)").setRequired(true))
            .addRoleOption((opt) => opt.setName("cargo").setDescription("Cargo do Discord correspondente").setRequired(true))
        )
    )

    .addSubcommandGroup((group) =>
      group.setName("membros").setDescription("Controle de Membros")
        .addSubcommand((sub) =>
          sub.setName("add").setDescription("Ativa o VIP para um membro")
            .addUserOption((opt) => opt.setName("membro").setDescription("Destinatário").setRequired(true))
            .addStringOption((opt) => opt.setName("tier").setDescription("ID do Tier").setRequired(true))
            .addIntegerOption((opt) => opt.setName("dias").setDescription("Duração em dias").setRequired(true).setMinValue(1))
        )
        .addSubcommand((sub) =>
          sub.setName("remove").setDescription("Remove o VIP de um membro imediatamente")
            .addUserOption((opt) => opt.setName("membro").setDescription("Membro a ser removido").setRequired(true))
        )
        .addSubcommand((sub) =>
          sub.setName("list").setDescription("Lista Tiers configurados e membros VIP ativos")
        )
    )

    .addSubcommandGroup((group) =>
      group.setName("family").setDescription("Gestão de Família (Admin Force)")
        .addSubcommand((sub) =>
          sub.setName("info").setDescription("Detalhes técnicos de uma família")
            .addUserOption((opt) => opt.setName("dono").setDescription("Dono da família").setRequired(true))
        )
        .addSubcommand((sub) =>
          sub.setName("delete").setDescription("Apaga uma família e limpa cargos/canais")
            .addUserOption((opt) => opt.setName("dono").setDescription("Dono da família").setRequired(true))
        )
        .addSubcommand((sub) =>
          sub.setName("limit").setDescription("Altera o limite de vagas de uma família")
            .addUserOption((opt) => opt.setName("dono").setDescription("Dono da família").setRequired(true))
            .addIntegerOption((opt) => opt.setName("vagas").setDescription("Novo limite").setRequired(true).setMinValue(1))
        )
    ),

  // ─── EXECUTE ────────────────────────────────────────────────────────────────
  async execute(interaction) {
    const { vip: vipService, vipConfig, family: familyService, vipChannel, vipRole } =
      interaction.client.services;
    const sub     = interaction.options.getSubcommand();
    const group   = interaction.options.getSubcommandGroup();
    const guildId = interaction.guildId;

    // ── GRUPO: family ──────────────────────────────────────────────────────────
    if (group === "family") {
      const targetOwner = interaction.options.getUser("dono");

      if (sub === "info") {
        const family = await familyService.getFamilyByOwner(targetOwner.id);
        if (!family) return interaction.reply({ content: "❌ Este utilizador não lidera uma família.", flags: MessageFlags.Ephemeral });

        const embed = new EmbedBuilder()
          .setTitle(`🏠 Família: ${family.name}`)
          .setColor("Purple")
          .addFields(
            { name: "Líder",    value: `<@${family.ownerId}>`, inline: true },
            { name: "Ocupação", value: `👥 ${family.members.length} / ${family.maxMembers} membros`, inline: true },
            { name: "ID Interno", value: `\`${family.id}\``, inline: false },
          );
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (sub === "delete") {
        await familyService.deleteFamily(interaction.guild, targetOwner.id);
        return interaction.reply({ content: `🗑️ Família de <@${targetOwner.id}> apagada e canais limpos.`, flags: MessageFlags.Ephemeral });
      }

      if (sub === "limit") {
        const vagas  = interaction.options.getInteger("vagas");
        const family = await familyService.getFamilyByOwner(targetOwner.id);
        if (!family) return interaction.reply({ content: "❌ Família não localizada.", flags: MessageFlags.Ephemeral });
        await familyService.updateMaxMembers(family.id, vagas);
        return interaction.reply({ content: `✅ Limite de **${family.name}** atualizado para **${vagas}**.`, flags: MessageFlags.Ephemeral });
      }
    }

    // ── GRUPO: infra ───────────────────────────────────────────────────────────
    if (sub === "setup") {
      const separadorVip    = interaction.options.getRole("separador_vip");
      const separadorFamilia = interaction.options.getRole("separador_familia");
      const cargoBaseVip    = interaction.options.getRole("cargo_base_vip");
      const fantasma        = interaction.options.getRole("fantasma");

      await vipService.setGuildConfig(guildId, {
        logChannelId:          interaction.options.getChannel("logs").id,
        vipCategoryId:         interaction.options.getChannel("categoria").id,
        familyCategoryId:      interaction.options.getChannel("categoria_familia").id,
        criarCallChannelId:    interaction.options.getChannel("canal_criar_call").id,
        // Separadores
        vipRoleSeparatorId:    separadorVip?.id    || null,
        familyRoleSeparatorId: separadorFamilia?.id || null,
        // Legado (mantido para compatibilidade com vipRoleManager antigo)
        separatorId:           separadorVip?.id    || null,
        // Cargo base VIP global
        vipBaseRoleId:         cargoBaseVip?.id    || null,
        // Fantasma
        cargoFantasmaId:       fantasma?.id        || null,
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Infraestrutura VIP configurada")
        .setColor(0x57f287)
        .addFields(
          { name: "📋 Logs",              value: `<#${interaction.options.getChannel("logs").id}>`, inline: true },
          { name: "📁 Cat. VIP",          value: `<#${interaction.options.getChannel("categoria").id}>`, inline: true },
          { name: "📁 Cat. Família",      value: `<#${interaction.options.getChannel("categoria_familia").id}>`, inline: true },
          { name: "🔊 Criar Call",        value: `<#${interaction.options.getChannel("canal_criar_call").id}>`, inline: true },
          { name: "📌 Sep. VIP",          value: separadorVip    ? `<@&${separadorVip.id}>`     : "—", inline: true },
          { name: "📌 Sep. Família",      value: separadorFamilia ? `<@&${separadorFamilia.id}>` : "—", inline: true },
          { name: "🔑 Cargo Base VIP",    value: cargoBaseVip    ? `<@&${cargoBaseVip.id}>`     : "—", inline: true },
          { name: "👻 Cargo Fantasma",    value: fantasma        ? `<@&${fantasma.id}>`         : "—", inline: true },
        );

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ── GRUPO: tiers — abre dashboard ────────────────────────────────────────
    if (sub === "tier") {
      const tid  = interaction.options.getString("id").toLowerCase();
      const role = interaction.options.getRole("cargo");

      // Garante que a base do tier existe
      await vipConfig.setBase(guildId, tid, role.id, role.name);

      const tiers    = await vipConfig.getGuildTiers(guildId);
      const hasTiers = Object.keys(tiers).length > 0;
      const embed    = await buildTierDashEmbed(guildId, tid, vipConfig, vipService);

      return interaction.reply({
        embeds:     [embed],
        components: buildTierDashComponents(tid, guildId, hasTiers),
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── GRUPO: membros ─────────────────────────────────────────────────────────
    if (sub === "add") {
      const target  = interaction.options.getMember("membro");
      const tid     = interaction.options.getString("tier").toLowerCase();
      const dias    = interaction.options.getInteger("dias");
      const tier    = await vipConfig.getTierConfig(guildId, tid);

      if (!tier) {
        return interaction.reply({ content: `❌ O Tier \`${tid}\` não existe. Configure-o em /vipadmin tiers tier.`, flags: MessageFlags.Ephemeral });
      }

      const expiresAt = Date.now() + dias * 24 * 60 * 60 * 1000;

      // addVip já entrega o cargo base internamente
      await vipService.addVip(guildId, target.id, {
        tierId:    tid,
        expiresAt,
        addedBy:   interaction.user.id,
        source:    "admin",
      });

      // Entrega e posiciona o cargo do Tier
      await vipRole.assignTierRole(target.id, tid, { guildId }).catch((err) =>
        interaction.client.services?.log?.error?.({ err }, "assignTierRole falhou no vipadmin add")
      );

      // Cria canais VIP se o tier exigir
      if (tier.canCall || tier.chat_privado) {
        await vipChannel.ensureVipChannels(target.id, { guildId });
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ VIP Ativado")
        .setColor(0x57f287)
        .setDescription(`<@${target.id}> agora é **${tier.name || tid.toUpperCase()}** por **${dias}** dias.`)
        .addFields(
          { name: "Tier",    value: `\`${tid}\``,             inline: true },
          { name: "Expira",  value: `<t:${Math.floor(expiresAt / 1000)}:R>`, inline: true },
          { name: "Por",     value: `<@${interaction.user.id}>`, inline: true },
        );

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === "remove") {
      const target = interaction.options.getMember("membro");

      await vipChannel.deleteVipChannels(target.id, { guildId });
      await vipRole.deletePersonalRole(target.id, { guildId });

      const data = await vipService.getVipData(guildId, target.id);
      if (data?.tierId) {
        await vipRole.removeTierRole(target.id, data.tierId, { guildId });
      }

      // removeVip remove o cargo base internamente
      await vipService.removeVip(guildId, target.id);

      return interaction.reply({
        content:   `🚫 VIP de <@${target.id}> removido e todos os ativos apagados.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "list") {
      const tiers  = await vipConfig.getGuildTiers(guildId);
      const report = await vipService.getFullVipReport(guildId);
      const gConf  = vipService.getGuildConfig(guildId);

      const embed = new EmbedBuilder()
        .setTitle("📊 Dashboard VIP")
        .setColor(0x5865f2);

      const tierText = Object.keys(tiers)
        .map((t) => `• **${t.toUpperCase()}**: <@&${tiers[t].roleId}>`)
        .join("\n") || "Nenhum tier configurado.";
      embed.addFields({ name: "🏷️ Tiers Configurados", value: tierText });

      const activeVips = report.activeVips || [];
      const vipText    = activeVips
        .map((v) => {
          const exp = v.expiresAt ? `<t:${Math.floor(v.expiresAt / 1000)}:d>` : "Permanente";
          return `<@${v.userId}> — \`${v.tierId}\` — Expira: ${exp}`;
        })
        .join("\n") || "Nenhum membro ativo.";
      embed.addFields({ name: `👑 Membros Ativos (${activeVips.length})`, value: vipText.substring(0, 1024) });

      embed.addFields(
        { name: "🔑 Cargo Base VIP",   value: gConf?.vipBaseRoleId   ? `<@&${gConf.vipBaseRoleId}>`        : "Não definido", inline: true },
        { name: "👻 Cargo Fantasma",   value: gConf?.cargoFantasmaId  ? `<@&${gConf.cargoFantasmaId}>`      : "Não definido", inline: true },
        { name: "📌 Sep. VIP",         value: gConf?.vipRoleSeparatorId ? `<@&${gConf.vipRoleSeparatorId}>` : "Não definido", inline: true },
        { name: "📌 Sep. Família",     value: gConf?.familyRoleSeparatorId ? `<@&${gConf.familyRoleSeparatorId}>` : "Não definido", inline: true },
      );

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },

  // ─── HANDLE BUTTON ──────────────────────────────────────────────────────────
  async handleButton(interaction) {
    if (!interaction.customId?.startsWith("vipadmin_dash:")) return;

    // Valida permissão
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: "❌ Você não tem permissão.", flags: MessageFlags.Ephemeral });
    }

    const parts   = interaction.customId.split(":");
    // formato: vipadmin_dash:<action>:<guildId>:<tierId>
    const action  = parts[1];
    const guildId = parts[2];
    const tierId  = parts[3];

    if (interaction.guildId !== guildId) {
      return interaction.reply({ content: "Este painel pertence a outro servidor.", flags: MessageFlags.Ephemeral });
    }

    const { vipConfig, vip: vipService } = interaction.client.services;

    // ── ✖ Fechar ──────────────────────────────────────────────────────────────
    if (action === "close") {
      return interaction.message.delete().catch(() => {});
    }

    // ── 🎭 Definir Cargos Base ────────────────────────────────────────────────
    if (action === "set_base_roles") {
      const gConf = vipService.getGuildConfig(guildId);

      const modal = new ModalBuilder()
        .setCustomId(`vipadmin_modal_base_${guildId}`)
        .setTitle("🎭 Definir Cargos Base VIP")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("vipBaseRoleId")
              .setLabel("ID do Cargo Base VIP global")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(gConf?.vipBaseRoleId || ""),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("cargoFantasmaId")
              .setLabel("ID do Cargo Fantasma (Vigilante)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(gConf?.cargoFantasmaId || ""),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("vipRoleSeparatorId")
              .setLabel("ID do Separador VIP")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(gConf?.vipRoleSeparatorId || ""),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("familyRoleSeparatorId")
              .setLabel("ID do Separador de Família")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setValue(gConf?.familyRoleSeparatorId || ""),
          ),
        );

      return interaction.showModal(modal);
    }

    // ── ➕ Adicionar/Editar Tier — mostra sub-menu de seções ──────────────────
    if (action === "add_tier") {
      const tier = await vipConfig.getTierConfig(guildId, tierId);
      if (!tier) {
        return interaction.reply({ content: `❌ Tier \`${tierId}\` não encontrado no banco.`, flags: MessageFlags.Ephemeral });
      }

      const id = (sec) => `vipadmin_tier_section:${sec}:${guildId}:${tierId}`;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(id("eco")).setLabel("💰 Economia").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id("soc")).setLabel("👨‍👩‍👧 Social").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id("tec")).setLabel("⚡ Técnico").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(id("shop")).setLabel("🛒 Loja").setStyle(ButtonStyle.Secondary),
      );

      return interaction.reply({
        content:    `Qual seção deseja editar para o tier \`${tierId}\`?`,
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── 🗑️ Remover Tier ───────────────────────────────────────────────────────
    if (action === "remove_tier") {
      const tiers = await vipConfig.getGuildTiers(guildId);
      if (!tiers[tierId]) {
        return interaction.reply({ content: `❌ Tier \`${tierId}\` não encontrado.`, flags: MessageFlags.Ephemeral });
      }

      await vipConfig.removeTier(guildId, tierId);

      const newTiers    = await vipConfig.getGuildTiers(guildId);
      const hasTiers    = Object.keys(newTiers).length > 0;
      const firstTierId = Object.keys(newTiers)[0] || tierId;
      const embed       = await buildTierDashEmbed(guildId, firstTierId, vipConfig, vipService);

      return interaction.update({
        embeds:     [embed],
        components: buildTierDashComponents(firstTierId, guildId, hasTiers),
      });
    }

    // ── ⚙️ Cotas Avançadas ────────────────────────────────────────────────────
    if (action === "cotas") {
      const tier = await vipConfig.getTierConfig(guildId, tierId);
      const cotasConfig  = tier?.cotasConfig;
      const regras       = Array.isArray(cotasConfig) ? cotasConfig : (cotasConfig ? [cotasConfig] : []);

      const descAtual = regras.length
        ? regras.map((r, i) => {
            if (r.modo === "A") return `[${i+1}] Modo A: ${r.quantidade} cotas hierárquicas`;
            if (r.modo === "B") return `[${i+1}] Modo B: ${r.quantidade} cotas do tier \`${r.targetTierId}\``;
            return `[${i+1}] Desconhecido`;
          }).join("\n")
        : "Sem cotas configuradas.";

      const idC = (a) => `vipadmin_cotas:${a}:${guildId}:${tierId}`;

      const embed = new EmbedBuilder()
        .setTitle(`⚙️ Cotas Avançadas — \`${tierId}\``)
        .setColor(0xfee75c)
        .setDescription([
          "**Regras atuais:**",
          descAtual,
          "",
          "**Modo A (Hierárquico):** o VIP pode dar X cotas de qualquer tier inferior ao seu.",
          "**Modo B (Específico):** o VIP pode dar X cotas de um tier pré-definido.",
          "",
          "Use os botões para adicionar ou limpar regras.",
        ].join("\n"));

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(idC("add_a")).setLabel("➕ Adicionar Modo A").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(idC("add_b")).setLabel("➕ Adicionar Modo B").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(idC("clear")).setLabel("🗑️ Limpar Todas").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(idC("back")).setLabel("◀ Voltar").setStyle(ButtonStyle.Secondary),
      );

      return interaction.update({ embeds: [embed], components: [row] });
    }
  },

  // ─── HANDLE BUTTON — Seções do Tier e Cotas ─────────────────────────────────
  async handleButtonSecondary(interaction) {
    const { vipConfig, vip: vipService } = interaction.client.services;

    // ── Sub-seções do tier (eco / soc / tec / shop) ──────────────────────────
    if (interaction.customId?.startsWith("vipadmin_tier_section:")) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "❌ Sem permissão.", flags: MessageFlags.Ephemeral });
      }

      const parts   = interaction.customId.split(":");
      const section = parts[1];
      const guildId = parts[2];
      const tierId  = parts[3];

      if (interaction.guildId !== guildId) {
        return interaction.reply({ content: "Painel de outro servidor.", flags: MessageFlags.Ephemeral });
      }

      const tier = await vipConfig?.getTierConfig(guildId, tierId);
      if (!tier) {
        return interaction.reply({ content: `Tier \`${tierId}\` não encontrado.`, flags: MessageFlags.Ephemeral });
      }

      return _showSectionModal(interaction, section, guildId, tierId, tier);
    }

    // ── Cotas ────────────────────────────────────────────────────────────────
    if (interaction.customId?.startsWith("vipadmin_cotas:")) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "❌ Sem permissão.", flags: MessageFlags.Ephemeral });
      }

      const parts   = interaction.customId.split(":");
      const action  = parts[1];
      const guildId = parts[2];
      const tierId  = parts[3];

      if (interaction.guildId !== guildId) {
        return interaction.reply({ content: "Painel de outro servidor.", flags: MessageFlags.Ephemeral });
      }

      // ◀ Voltar ao painel principal
      if (action === "back") {
        const tiers   = await vipConfig.getGuildTiers(guildId);
        const embed   = await buildTierDashEmbed(guildId, tierId, vipConfig, vipService);
        return interaction.update({
          embeds:     [embed],
          components: buildTierDashComponents(tierId, guildId, Object.keys(tiers).length > 0),
        });
      }

      // 🗑️ Limpar todas as regras de cota
      if (action === "clear") {
        await vipConfig.updateTier(guildId, tierId, "cotas", { cotasConfig: [] });
        return interaction.reply({ content: `✅ Todas as cotas do tier \`${tierId}\` foram removidas.`, flags: MessageFlags.Ephemeral });
      }

      // ➕ Adicionar Modo A
      if (action === "add_a") {
        const modal = new ModalBuilder()
          .setCustomId(`vipadmin_modal_cota_A_${guildId}_${tierId}`)
          .setTitle(`Cota Modo A — ${tierId}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("quantidade")
                .setLabel("Quantidade de cotas hierárquicas")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Ex: 3"),
            ),
          );
        return interaction.showModal(modal);
      }

      // ➕ Adicionar Modo B
      if (action === "add_b") {
        const modal = new ModalBuilder()
          .setCustomId(`vipadmin_modal_cota_B_${guildId}_${tierId}`)
          .setTitle(`Cota Modo B — ${tierId}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("targetTierId")
                .setLabel("ID do tier alvo (qual tier será dado)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Ex: ouro"),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("quantidade")
                .setLabel("Quantidade de cotas para esse tier")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Ex: 2"),
            ),
          );
        return interaction.showModal(modal);
      }
    }
  },

  // ─── HANDLE MODAL ───────────────────────────────────────────────────────────
  async handleModal(interaction) {
    if (!interaction.customId?.startsWith("vipadmin_modal_")) return;

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: "❌ Sem permissão.", flags: MessageFlags.Ephemeral });
    }

    const { vipConfig, vip: vipService } = interaction.client.services;
    const customId = interaction.customId;

    // ── Cargos Base ───────────────────────────────────────────────────────────
    if (customId.startsWith("vipadmin_modal_base_")) {
      const guildId = customId.replace("vipadmin_modal_base_", "");

      const vipBaseRoleId      = interaction.fields.getTextInputValue("vipBaseRoleId").trim()      || null;
      const cargoFantasmaId    = interaction.fields.getTextInputValue("cargoFantasmaId").trim()    || null;
      const vipRoleSepId       = interaction.fields.getTextInputValue("vipRoleSeparatorId").trim() || null;
      const familyRoleSepId    = interaction.fields.getTextInputValue("familyRoleSeparatorId").trim() || null;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

      // Valida os IDs que foram preenchidos
      for (const [label, id] of [
        ["Cargo Base VIP",   vipBaseRoleId],
        ["Cargo Fantasma",   cargoFantasmaId],
        ["Separador VIP",    vipRoleSepId],
        ["Separador Família", familyRoleSepId],
      ]) {
        if (id) {
          const role = await interaction.guild.roles.fetch(id).catch(() => null);
          if (!role) {
            return interaction.editReply({ content: `❌ ${label}: cargo com ID \`${id}\` não encontrado.` });
          }
        }
      }

      await vipService.setGuildConfig(guildId, {
        vipBaseRoleId,
        cargoFantasmaId,
        vipRoleSeparatorId:    vipRoleSepId,
        familyRoleSeparatorId: familyRoleSepId,
        // Compatibilidade
        separatorId: vipRoleSepId,
      });

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Cargos Base atualizados")
            .setColor(0x57f287)
            .addFields(
              { name: "🔑 Cargo Base VIP",   value: vipBaseRoleId    ? `<@&${vipBaseRoleId}>`    : "—", inline: true },
              { name: "👻 Cargo Fantasma",   value: cargoFantasmaId  ? `<@&${cargoFantasmaId}>`  : "—", inline: true },
              { name: "📌 Sep. VIP",         value: vipRoleSepId     ? `<@&${vipRoleSepId}>`     : "—", inline: true },
              { name: "📌 Sep. Família",     value: familyRoleSepId  ? `<@&${familyRoleSepId}>`  : "—", inline: true },
            ),
        ],
      });
    }

    // ── Cotas Modo A ──────────────────────────────────────────────────────────
    if (customId.startsWith("vipadmin_modal_cota_A_")) {
      const rest    = customId.replace("vipadmin_modal_cota_A_", "");
      const [guildId, ...tierParts] = rest.split("_");
      const tierId  = tierParts.join("_");

      const quantidadeRaw = interaction.fields.getTextInputValue("quantidade").trim();
      const quantidade    = parseInt(quantidadeRaw, 10);
      if (!Number.isFinite(quantidade) || quantidade < 1) {
        return interaction.reply({ content: "❌ Quantidade inválida.", flags: MessageFlags.Ephemeral });
      }

      const tier          = await vipConfig.getTierConfig(guildId, tierId);
      const cotasConfig   = tier?.cotasConfig;
      const regras        = Array.isArray(cotasConfig) ? [...cotasConfig] : (cotasConfig ? [cotasConfig] : []);
      regras.push({ modo: "A", quantidade });

      await vipConfig.updateTier(guildId, tierId, "cotas", { cotasConfig: regras });

      return interaction.reply({
        content:   `✅ Cota Modo A adicionada ao tier \`${tierId}\`: **${quantidade}** cotas hierárquicas.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── Cotas Modo B ──────────────────────────────────────────────────────────
    if (customId.startsWith("vipadmin_modal_cota_B_")) {
      const rest    = customId.replace("vipadmin_modal_cota_B_", "");
      const [guildId, ...tierParts] = rest.split("_");
      const tierId  = tierParts.join("_");

      const targetTierId  = interaction.fields.getTextInputValue("targetTierId").trim().toLowerCase();
      const quantidadeRaw = interaction.fields.getTextInputValue("quantidade").trim();
      const quantidade    = parseInt(quantidadeRaw, 10);

      if (!targetTierId) {
        return interaction.reply({ content: "❌ ID do tier alvo não pode ser vazio.", flags: MessageFlags.Ephemeral });
      }
      if (!Number.isFinite(quantidade) || quantidade < 1) {
        return interaction.reply({ content: "❌ Quantidade inválida.", flags: MessageFlags.Ephemeral });
      }

      // Verifica se o tier alvo existe
      const targetTierCheck = await vipConfig.getTierConfig(guildId, targetTierId);
      if (!targetTierCheck) {
        return interaction.reply({ content: `❌ Tier alvo \`${targetTierId}\` não encontrado. Crie-o primeiro.`, flags: MessageFlags.Ephemeral });
      }

      const tier          = await vipConfig.getTierConfig(guildId, tierId);
      const cotasConfig   = tier?.cotasConfig;
      const regras        = Array.isArray(cotasConfig) ? [...cotasConfig] : (cotasConfig ? [cotasConfig] : []);
      regras.push({ modo: "B", targetTierId, quantidade });

      await vipConfig.updateTier(guildId, tierId, "cotas", { cotasConfig: regras });

      return interaction.reply({
        content:   `✅ Cota Modo B adicionada ao tier \`${tierId}\`: **${quantidade}** cotas do tier \`${targetTierId}\`.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── Seções do Tier (eco / soc / tec / shop) ───────────────────────────────
    const parts   = customId.split("_");
    // formato: vipadmin_modal_<section>_<guildId>_<tierId>
    const section = parts[2];
    const guildId = parts[3];
    const tierId  = parts.slice(4).join("_");

    if (!vipConfig) {
      return interaction.reply({ content: "Serviço vipConfig indisponível.", flags: MessageFlags.Ephemeral });
    }

    if (section === "eco") {
      const valor_daily_extra = parseNum(interaction.fields.getTextInputValue("valor_daily_extra")) ?? 0;
      const bonus_inicial     = parseNum(interaction.fields.getTextInputValue("bonus_inicial"))     ?? 0;
      const midas             = parseBool(interaction.fields.getTextInputValue("midas"));
      const preco_shop        = parseNum(interaction.fields.getTextInputValue("preco_shop"));

      if (valor_daily_extra < 0) return interaction.reply({ content: "Daily extra inválido.", flags: MessageFlags.Ephemeral });
      if (bonus_inicial     < 0) return interaction.reply({ content: "Bônus inicial inválido.", flags: MessageFlags.Ephemeral });
      if (preco_shop !== null && preco_shop < 0) return interaction.reply({ content: "preco_shop inválido.", flags: MessageFlags.Ephemeral });

      await vipConfig.updateTier(guildId, tierId, "eco", {
        valor_daily_extra,
        bonus_inicial,
        ...(midas    !== null ? { midas }     : {}),
        ...(preco_shop !== null ? { preco_shop } : {}),
      });
      return interaction.reply({ content: `✅ Economia do tier \`${tierId}\` atualizada.`, flags: MessageFlags.Ephemeral });
    }

    if (section === "soc") {
      const vagas_familia    = parseNum(interaction.fields.getTextInputValue("vagas_familia"))    ?? 0;
      const primeiras_damas  = parseNum(interaction.fields.getTextInputValue("primeiras_damas"))  ?? 0;
      const cotaRoleId       = interaction.fields.getTextInputValue("cotaRoleId").trim()          || null;
      const pode_presentear  = parseBool(interaction.fields.getTextInputValue("pode_presentear"));

      if (vagas_familia   < 0) return interaction.reply({ content: "Vagas família inválido.", flags: MessageFlags.Ephemeral });
      if (primeiras_damas < 0) return interaction.reply({ content: "Primeiras damas inválido.", flags: MessageFlags.Ephemeral });

      await vipConfig.updateTier(guildId, tierId, "soc", {
        vagas_familia,
        primeiras_damas,
        cotaRoleId,
        ...(pode_presentear !== null ? { pode_presentear } : {}),
      });
      return interaction.reply({ content: `✅ Configuração social do tier \`${tierId}\` atualizada.`, flags: MessageFlags.Ephemeral });
    }

    if (section === "tec") {
      const canCall           = parseBool(interaction.fields.getTextInputValue("canCall"));
      const chat_privado      = parseBool(interaction.fields.getTextInputValue("chat_privado"));
      const hasCustomRole     = parseBool(interaction.fields.getTextInputValue("hasCustomRole"));
      const high_quality_voice = parseBool(interaction.fields.getTextInputValue("high_quality_voice"));

      await vipConfig.updateTier(guildId, tierId, "tec", {
        ...(canCall            !== null ? { canCall }            : {}),
        ...(chat_privado       !== null ? { chat_privado }       : {}),
        ...(hasCustomRole      !== null ? { hasCustomRole }      : {}),
        ...(high_quality_voice !== null ? { high_quality_voice } : {}),
      });
      return interaction.reply({ content: `✅ Configuração técnica do tier \`${tierId}\` atualizada.`, flags: MessageFlags.Ephemeral });
    }

    if (section === "shop") {
      const shop_enabled     = parseBool(interaction.fields.getTextInputValue("shop_enabled"));
      const shop_price_per_day = parseNum(interaction.fields.getTextInputValue("shop_price_per_day"));
      const shop_fixed_price   = parseNum(interaction.fields.getTextInputValue("shop_fixed_price"));
      const shop_default_days  = parseNum(interaction.fields.getTextInputValue("shop_default_days"));

      if (shop_price_per_day !== null && shop_price_per_day < 0) return interaction.reply({ content: "Preço por dia inválido.", flags: MessageFlags.Ephemeral });
      if (shop_fixed_price   !== null && shop_fixed_price   < 0) return interaction.reply({ content: "Preço fixo inválido.", flags: MessageFlags.Ephemeral });
      if (shop_default_days  !== null && shop_default_days  < 0) return interaction.reply({ content: "Dias padrão inválidos.", flags: MessageFlags.Ephemeral });

      await vipConfig.updateTier(guildId, tierId, "shop", {
        ...(shop_enabled     !== null ? { shop_enabled }     : {}),
        ...(shop_price_per_day !== null ? { shop_price_per_day } : {}),
        ...(shop_fixed_price   !== null ? { shop_fixed_price }   : {}),
        ...(shop_default_days  !== null ? { shop_default_days }  : {}),
      });
      return interaction.reply({ content: `✅ Loja do tier \`${tierId}\` atualizada.`, flags: MessageFlags.Ephemeral });
    }
  },
};

// ─── Função interna para mostrar modais de seção ──────────────────────────────
async function _showSectionModal(interaction, section, guildId, tierId, tier) {
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
