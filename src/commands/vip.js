const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");
const { getGuildConfig } = require("../config/guildConfig");
const { logger } = require("../logger");

// Approximate milliseconds per month (30-day month) for streak calculation
const APPROX_MS_PER_MONTH = 30 * 24 * 60 * 60 * 1000;

// ── VIP Milestones ────────────────────────────────────────────────────────────
const VIP_MILESTONES = [
  { months: 0,  label: "🥉 Estreante", multiplier: 0  },
  { months: 1,  label: "🥈 Fiel",      multiplier: 5  },
  { months: 3,  label: "🏅 Leal",      multiplier: 10 },
  { months: 6,  label: "🥇 Veterano",  multiplier: 15 },
  { months: 12, label: "💎 Lendário",  multiplier: 25 },
];

function resolveVipMilestone(streakMonths) {
  let current = VIP_MILESTONES[0];
  for (const m of VIP_MILESTONES) {
    if (streakMonths >= m.months) current = m;
  }
  return current;
}

// ── Dashboard Builders ────────────────────────────────────────────────────────
function buildVipDashboardEmbed(userId, avatarUrl, tier, data, settings) {
  const addedAt = data?.addedAt;
  const streakMonths = addedAt ? Math.floor((Date.now() - addedAt) / APPROX_MS_PER_MONTH) : 0;
  const milestone = resolveVipMilestone(streakMonths);
  const expiresAt = data?.expiresAt;
  const stealthMode = settings?.stealthMode === true;

  return new EmbedBuilder()
    .setTitle("💎 Dashboard VIP")
    .setColor("Gold")
    .setThumbnail(avatarUrl)
    .addFields(
      { name: "👑 Plano Ativo",  value: `\`${tier.name || tier.id}\``, inline: true },
      { name: "⏳ Expiração",    value: expiresAt ? `<t:${Math.floor(expiresAt / 1000)}:R>` : "Permanente", inline: true },
      { name: "🔥 VIP Streak",   value: `${streakMonths} ${streakMonths === 1 ? "mês" : "meses"} consecutivo(s)`, inline: true },
      { name: "🏆 Milestone",    value: `${milestone.label} (+${milestone.multiplier}% economia)`, inline: true },
      { name: "🕵️ Stealth Mode", value: stealthMode ? "✅ Ativo" : "❌ Inativo", inline: true },
    )
    .setFooter({ text: "vip | © WDA - Todos os direitos reservados" });
}

function buildVipCategoryMenu(guildId, userId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`vip_cat_${guildId}_${userId}`)
    .setPlaceholder("🗂️ Navegar entre categorias...")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("👨‍👩‍👧‍👦 Social").setValue("social").setDescription("Família e Primeira Dama"),
      new StringSelectMenuOptionBuilder().setLabel("🎭 Estética").setValue("estetica").setDescription("Cargo Personalizado e Som de Entrada"),
      new StringSelectMenuOptionBuilder().setLabel("🎙️ Privacidade").setValue("privacidade").setDescription("Canais Privados e Stealth Mode"),
      new StringSelectMenuOptionBuilder().setLabel("🪙 Economia").setValue("economia").setDescription("Milestones e Bônus Ativos"),
      new StringSelectMenuOptionBuilder().setLabel("🎁 Presentes").setValue("presentes").setDescription("Cotas de VIP para amigos"),
    );
  return new ActionRowBuilder().addComponents(menu);
}

function buildBackRow(guildId, userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vip_btn_back_${guildId}_${userId}`)
      .setLabel("⬅ Voltar ao Hub")
      .setStyle(ButtonStyle.Secondary),
  );
}

function parseCustomId(customId) {
  return String(customId || "").split("_");
}

function isSameUser(interaction, expectedUserId) {
  return interaction.user?.id === expectedUserId;
}

// ── Helper: Função Central para Dar o VIP da Cota ──
async function processGiveVip(interaction, targetUserId, tierId) {
  const { vip: vipService, vipRole, vipChannel, vipConfig } = interaction.client.services;
  const guildId = interaction.guildId;
  const donorId = interaction.user.id;

  // Verifica permissão final
  const check = await vipService.verificarCota(guildId, donorId, tierId);
  if (!check.ok) {
     const msg = { content: `❌ ${check.reason}`, flags: MessageFlags.Ephemeral };
     return interaction.replied || interaction.deferred ? interaction.editReply(msg) : interaction.reply(msg);
  }

  const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
  if (!targetMember) {
     const msg = { content: "❌ Membro não encontrado no servidor.", flags: MessageFlags.Ephemeral };
     return interaction.replied || interaction.deferred ? interaction.editReply(msg) : interaction.reply(msg);
  }

  // Verifica se o alvo já tem ESSE VIP ativo
  const existingData = await vipService.getVipData(guildId, targetUserId);
  if (existingData && existingData.tierId === tierId && existingData.expiresAt > Date.now()) {
      const msg = { content: `❌ <@${targetUserId}> já possui o VIP **${tierId}** ativo.`, flags: MessageFlags.Ephemeral };
      return interaction.replied || interaction.deferred ? interaction.editReply(msg) : interaction.reply(msg);
  }

  // Define a duração da cota (Padrão: 30 dias)
  const dias = 30;
  const expiresAt = Date.now() + dias * 24 * 60 * 60 * 1000;

  // 1. Adiciona o VIP no banco (isso já entrega o Cargo Base VIP automaticamente)
  await vipService.addVip(guildId, targetUserId, {
    tierId: tierId,
    expiresAt,
    addedBy: donorId,
    source: "cota"
  });

  // 2. Entrega o cargo específico do Tier e posiciona
  await vipRole.assignTierRole(targetUserId, tierId, { guildId }).catch(()=>{});

  // 3. Cria os canais se o tier permitir
  const targetTierConfig = await vipConfig.getTierConfig(guildId, tierId);
  if (targetTierConfig && (targetTierConfig.canCall || targetTierConfig.chat_privado)) {
     await vipChannel.ensureVipChannels(targetUserId, { guildId });
  }

  // 4. Desconta a cota do doador
  await vipService.registrarUso(guildId, donorId, tierId);

  // 5. Salva na lista de "Cotas Dadas" do doador para ele gerenciar depois
  const settings = await vipService.getSettings(guildId, donorId);
  const vipsDados = settings.vipsDados || [];
  vipsDados.push({ userId: targetUserId, tierId: tierId, date: Date.now() });
  await vipService.setSettings(guildId, donorId, { vipsDados });

  const msg = { content: `✅ Você deu o VIP **${targetTierConfig?.name || tierId.toUpperCase()}** para <@${targetUserId}> por **${dias} dias** com sucesso!`, components: [], flags: MessageFlags.Ephemeral };
  return interaction.replied || interaction.deferred ? interaction.editReply(msg) : interaction.reply(msg);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vip")
    .setDescription("Gerencie suas vantagens VIP")
    .addSubcommand(s => s.setName("info").setDescription("Ver benefícios ativos e painel VIP")),

  async execute(interaction) {
    const { vip: vipService, vipChannel } = interaction.client.services;
    const tier = await vipService.getMemberTier(interaction.member);
    if (!tier) return interaction.reply({ content: "❌ Você não é VIP.", flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();

    if (sub === "info") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em deferReply no /vip info"); });

      await vipChannel.ensureVipChannels(interaction.user.id, { guildId: interaction.guildId }).catch((err) => {
        logger.warn({ err, userId: interaction.user.id }, "Falha ao garantir canais VIP no /vip info");
      });

      const data = await vipService.getVipData(interaction.guildId, interaction.user.id);
      const settings = await vipService.getSettings(interaction.guildId, interaction.user.id) || {};

      const embed = buildVipDashboardEmbed(
        interaction.user.id,
        interaction.user.displayAvatarURL({ dynamic: true }),
        tier,
        data,
        settings,
      );

      return interaction.editReply({
        embeds: [embed],
        components: [buildVipCategoryMenu(interaction.guildId, interaction.user.id)],
      });
    }
  },
  async handleSelectMenu(interaction) {
    if (!interaction.inGuild()) return;
    if (!interaction.customId?.startsWith("vip_")) return;

    const { vip: vipService, vipRole, vipChannel, vipConfig } = interaction.client.services;

    // ── Navegação por categorias (Hub principal) ──────────────────────────────
    if (interaction.customId.startsWith("vip_cat_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[2];
      const ownerId = parts[3];

      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este menu pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas o dono do painel pode navegar.", flags: MessageFlags.Ephemeral });

      const category = interaction.values?.[0];
      const tier = await vipService.getMemberTier(interaction.member);
      if (!tier) return interaction.reply({ content: "❌ Você não é VIP.", flags: MessageFlags.Ephemeral });

      const tierConfig = await vipConfig.getTierConfig(guildId, tier.id).catch(() => null);
      const backRow = buildBackRow(guildId, ownerId);

      await interaction.deferUpdate().catch((err) => { logger.warn({ err }, "Falha em deferUpdate no vip_cat"); });

      // ── Social ──────────────────────────────────────────────────────────
      if (category === "social") {
        const familyService = interaction.client.services?.family;
        const family = familyService
          ? (await familyService.getFamilyByOwner(ownerId).catch(() => null) || await familyService.getFamilyByMember(ownerId).catch(() => null))
          : null;
        const gConf = await getGuildConfig(guildId).catch(() => ({}));
        const damaRoleIds = gConf?.primeraDamaRoleIds?.length
          ? gConf.primeraDamaRoleIds
          : (gConf?.damaRoleId ? [gConf.damaRoleId] : []);

        const embed = new EmbedBuilder()
          .setTitle("👨‍👩‍👧‍👦 Categoria: Social")
          .setColor("Purple")
          .addFields(
            { name: "🏠 Família", value: family ? `**${family.name}** — ${family.members.length}/${family.maxMembers} membros` : "Sem família ativa. Use `/family criar`.", inline: false },
            { name: "💍 Cargos de Primeira Dama", value: damaRoleIds.length ? damaRoleIds.map(id => `<@&${id}>`).join(", ") : "Não configurado pelo admin.", inline: false },
            { name: "💳 Vagas de Família (Tier)", value: `\`${tierConfig?.vagas_familia ?? 0}\` vagas`, inline: true },
            { name: "👑 Cotas de Dama (Tier)", value: `\`${tierConfig?.primeiras_damas ?? 0}\` cota(s)`, inline: true },
          )
          .setFooter({ text: "vip | © WDA - Todos os direitos reservados" });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`vip_btn_primeiradama_${guildId}_${ownerId}`)
            .setLabel("💍 Definir Primeira Dama")
            .setStyle(ButtonStyle.Primary),
        );

        return interaction.editReply({ embeds: [embed], components: [row, backRow] });
      }

      // ── Estética ─────────────────────────────────────────────────────────
      if (category === "estetica") {
        const settings = await vipService.getSettings(guildId, ownerId) || {};
        const hasRole = !!settings.roleId;
        const hasIntro = !!settings.introSoundUrl;

        const embed = new EmbedBuilder()
          .setTitle("🎭 Categoria: Estética")
          .setColor(0x9b59b6)
          .addFields(
            { name: "🎭 Cargo Personalizado", value: hasRole ? `<@&${settings.roleId}>` : "Não configurado", inline: true },
            { name: "✨ Som de Entrada", value: hasIntro ? "✅ Configurado" : "❌ Não definido", inline: true },
            { name: "📋 Permissões do Tier", value: `Cargo Custom: ${tierConfig?.hasCustomRole ? "✅" : "❌"} | Intro Sound: ${(tierConfig?.hasIntroSound || tierConfig?.canCall) ? "✅" : "❌"}`, inline: false },
          )
          .setFooter({ text: "vip | © WDA - Todos os direitos reservados" });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`vip_btn_role_${guildId}_${ownerId}`)
            .setLabel("🎭 Customizar Cargo")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!tierConfig?.hasCustomRole),
          new ButtonBuilder()
            .setCustomId(`vip_btn_intro_${guildId}_${ownerId}`)
            .setLabel("✨ Som de Entrada")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!tierConfig?.hasIntroSound && !tierConfig?.canCall),
        );

        return interaction.editReply({ embeds: [embed], components: [row, backRow] });
      }

      // ── Privacidade ───────────────────────────────────────────────────────
      if (category === "privacidade") {
        const settings = await vipService.getSettings(guildId, ownerId) || {};
        const stealthMode = settings.stealthMode === true;

        const embed = new EmbedBuilder()
          .setTitle("🎙️ Categoria: Privacidade")
          .setColor(0x2f3136)
          .addFields(
            { name: "🎙️ Canal de Voz",  value: tierConfig?.canCall ? "✅ Disponível no seu tier" : "❌ Não disponível", inline: true },
            { name: "💬 Chat Privado",   value: tierConfig?.chat_privado ? "✅ Disponível no seu tier" : "❌ Não disponível", inline: true },
            { name: "🕵️ Stealth Mode",  value: stealthMode ? "✅ Ativo — Entradas silenciosas" : "❌ Inativo — Entradas normais", inline: false },
          )
          .setFooter({ text: "vip | © WDA - Todos os direitos reservados" });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`vip_btn_voice_${guildId}_${ownerId}`)
            .setLabel("🎙️ Renomear Voz")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!tierConfig?.canCall),
          new ButtonBuilder()
            .setCustomId(`vip_btn_chat_${guildId}_${ownerId}`)
            .setLabel("💬 Sincronizar Chat")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!tierConfig?.chat_privado),
          new ButtonBuilder()
            .setCustomId(`vip_btn_stealth_${guildId}_${ownerId}`)
            .setLabel(stealthMode ? "🕵️ Stealth: ON" : "🕵️ Stealth: OFF")
            .setStyle(stealthMode ? ButtonStyle.Success : ButtonStyle.Secondary),
        );

        return interaction.editReply({ embeds: [embed], components: [row, backRow] });
      }

      // ── Economia / Milestones ─────────────────────────────────────────────
      if (category === "economia") {
        const data = await vipService.getVipData(guildId, ownerId);
        const addedAt = data?.addedAt;
        const streakMonths = addedAt ? Math.floor((Date.now() - addedAt) / APPROX_MS_PER_MONTH) : 0;
        const milestone = resolveVipMilestone(streakMonths);
        const nextMilestone = VIP_MILESTONES.slice().reverse().find(m => m.months > streakMonths) || null;

        const allMedals = VIP_MILESTONES.map(m => {
          const reached = streakMonths >= m.months;
          return `${reached ? "✅" : "⬜"} ${m.label} (${m.months === 0 ? "Inicial" : `${m.months}m`}) — +${m.multiplier}%`;
        }).join("\n");

        const embed = new EmbedBuilder()
          .setTitle("🪙 Categoria: Economia")
          .setColor("Gold")
          .addFields(
            { name: "🔥 VIP Streak",            value: `${streakMonths} ${streakMonths === 1 ? "mês" : "meses"} consecutivo(s)`, inline: true },
            { name: "🏆 Milestone Atual",        value: milestone.label, inline: true },
            { name: "📈 Multiplicador Ativo",    value: `+${milestone.multiplier}% em economia`, inline: true },
            { name: "💰 Bônus Diário (Tier)",    value: `+${tierConfig?.valor_daily_extra ?? 0} 🪙 por coleta`, inline: true },
            { name: "🎁 Bônus Inicial (Tier)",   value: `${tierConfig?.bonus_inicial ?? 0} 🪙 ao receber VIP`, inline: true },
            nextMilestone
              ? { name: "🎯 Próxima Conquista", value: `${nextMilestone.label} em ${nextMilestone.months - streakMonths} ${nextMilestone.months - streakMonths === 1 ? "mês" : "meses"}`, inline: false }
              : { name: "🎯 Status", value: "Você atingiu o nível máximo! 💎", inline: false },
            { name: "📊 Trilha de Medalhas", value: allMedals, inline: false },
          )
          .setFooter({ text: "vip | © WDA - Todos os direitos reservados" });

        return interaction.editReply({ embeds: [embed], components: [backRow] });
      }

      // ── Presentes ─────────────────────────────────────────────────────────
      if (category === "presentes") {
        const settings = await vipService.getSettings(guildId, ownerId) || {};
        const cotasUsadas = settings.cotasUsadas || {};
        const vipsDados = settings.vipsDados || [];
        const regras = Array.isArray(tierConfig?.cotasConfig) ? tierConfig.cotasConfig : (tierConfig?.cotasConfig ? [tierConfig.cotasConfig] : []);

        const cotasText = regras.map((r) => {
          if (r.modo === "A") return `🔹 **Modo A:** ${r.quantidade} cota(s) de tiers inferiores`;
          if (r.modo === "B") {
            const used = cotasUsadas[r.targetTierId] || 0;
            return `🔸 **Modo B:** ${used}/${r.quantidade} usadas do tier \`${r.targetTierId}\``;
          }
          return "";
        }).filter(Boolean).join("\n") || "Nenhuma cota disponível no seu plano.";

        const embed = new EmbedBuilder()
          .setTitle("🎁 Categoria: Presentes")
          .setColor(0xf1c40f)
          .addFields(
            { name: "📋 Suas Cotas", value: cotasText, inline: false },
            { name: "🎁 VIPs Dados", value: vipsDados.length ? `${vipsDados.length} presente(s) registrado(s)` : "Nenhum.", inline: true },
          )
          .setFooter({ text: "vip | © WDA - Todos os direitos reservados" });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`vip_quota_give_${guildId}_${ownerId}`)
            .setLabel("🎁 Dar VIP da Cota")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`vip_quota_manage_${guildId}_${ownerId}`)
            .setLabel("⚙️ Gerenciar Cotas")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!vipsDados.length),
        );

        return interaction.editReply({ embeds: [embed], components: [row, backRow] });
      }

      return interaction.editReply({ content: "Categoria desconhecida.", embeds: [], components: [] });
    }

    // ── Resposta ao selecionar o Tier que vai dar ──
    if (interaction.customId.startsWith("vip_give_tier_")) {
       const parts = parseCustomId(interaction.customId);
       // ["vip", "give", "tier", guildId, ownerId, targetUserId]
       const ownerId = parts[4];
       const targetUserId = parts[5];
       const tierId = interaction.values[0];
       
       if (ownerId !== interaction.user.id) return interaction.reply({ content: "Você não tem permissão.", flags: MessageFlags.Ephemeral });

       await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
       return processGiveVip(interaction, targetUserId, tierId);
    }

    // ── Resposta ao selecionar a pessoa que vai receber o VIP ──
    else if (interaction.customId.startsWith("vip_give_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[2];
      const ownerId = parts[3];
      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este menu pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas quem abriu o painel pode usar.", flags: MessageFlags.Ephemeral });

      const selectedUserId = interaction.values?.[0];
      if (!selectedUserId) return interaction.reply({ content: "Seleção inválida.", flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });

      const target = await interaction.guild.members.fetch(selectedUserId).catch(() => null);
      if (!target) return interaction.editReply({ content: "Usuário não encontrado no servidor." });
      if (target.id === interaction.user.id) return interaction.editReply({ content: "❌ Você não pode dar VIP para si mesmo." });
      if (target.user?.bot) return interaction.editReply({ content: "❌ Você não pode dar VIP para bots." });

      const validTiers = [];
      const orderedTiers = await vipService.getOrderedTiers(interaction.guildId);
      for (const t of orderedTiers) {
         const check = await vipService.verificarCota(interaction.guildId, interaction.user.id, t.id);
         if (check.ok) validTiers.push(t);
      }

      if (validTiers.length === 0) return interaction.editReply({ content: "❌ Você esgotou suas cotas." });
      if (validTiers.length === 1) return processGiveVip(interaction, selectedUserId, validTiers[0].id);

      const menu = new StringSelectMenuBuilder()
          .setCustomId(`vip_give_tier_${interaction.guildId}_${interaction.user.id}_${selectedUserId}`)
          .setPlaceholder("Selecione qual VIP deseja dar")
          .addOptions(validTiers.map(t => new StringSelectMenuOptionBuilder().setLabel(t.name || t.id).setValue(t.id)));

      return interaction.editReply({
          content: `Você tem opções de cota. Qual VIP deseja dar para <@${selectedUserId}>?`,
          components: [new ActionRowBuilder().addComponents(menu)],
      });
    }

    // ── Resposta ao remover um VIP dado por cota ──
    if (interaction.customId.startsWith("vip_quota_remove_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[3];
      const ownerId = parts[4];
      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este menu pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas quem abriu o painel pode usar.", flags: MessageFlags.Ephemeral });

      const removeUserId = interaction.values?.[0];
      if (!removeUserId) return interaction.reply({ content: "Seleção inválida.", flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const settings = await vipService.getSettings(interaction.guildId, interaction.user.id) || {};
      let dados = settings.vipsDados || [];

      // Localiza o registro (aceita o formato antigo string e o novo object)
      const removedEntry = dados.find(d => (typeof d === "string" ? d : d.userId) === removeUserId);
      if (!removedEntry) return interaction.editReply({ content: "Registro não encontrado." });

      dados = dados.filter((d) => (typeof d === "string" ? d : d.userId) !== removeUserId);
      await vipService.setSettings(interaction.guildId, interaction.user.id, { vipsDados: dados });

      const tId = typeof removedEntry === "string" ? null : removedEntry.tierId;

      if (!tId) {
          // Sistema Legado (Removia só o cargo de cota)
          const tier = await vipService.getMemberTier(interaction.member);
          if (tier && tier.cotaRoleId) {
              const member = await interaction.guild.members.fetch(removeUserId).catch(() => null);
              if (member) await member.roles.remove(tier.cotaRoleId).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });
          }
      } else {
          // Novo Sistema VIP Integrado
          await vipChannel.deleteVipChannels(removeUserId, { guildId });
          await vipRole.deletePersonalRole(removeUserId, { guildId });
          await vipRole.removeTierRole(removeUserId, tId, { guildId });
          await vipService.removeVip(guildId, removeUserId);

          // Restitui a cota para o doador
          const cotasUsadas = settings.cotasUsadas || {};
          if (cotasUsadas[tId] > 0) {
              cotasUsadas[tId] -= 1;
              await vipService.setSettings(guildId, interaction.user.id, { cotasUsadas });
          }
      }

      return interaction.editReply({ content: `✅ VIP revogado de <@${removeUserId}> e sua cota foi restaurada.` });
    }

    // ── Resposta ao Menu Principal do Painel /vip info ──
    if (interaction.customId.startsWith("vip_action_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[2];
      const ownerId = parts[3];
      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este painel pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas quem abriu o painel pode usar.", flags: MessageFlags.Ephemeral });

      const tier = await vipService.getMemberTier(interaction.member);
      if (!tier) return interaction.reply({ content: "❌ Você não é VIP.", flags: MessageFlags.Ephemeral });

      const action = interaction.values?.[0];
      if (!action) return interaction.reply({ content: "Seleção inválida.", flags: MessageFlags.Ephemeral });

      if (action === "create_channels") {
        if (!tier.canCall && !tier.chat_privado) return interaction.reply({ content: "❌ Seu tier não possui benefícios de canais personalizados.", flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const res = await vipChannel.ensureVipChannels(interaction.user.id, { guildId: interaction.guildId });
        if (res.ok) return interaction.editReply({ content: "✅ Seus canais VIP foram criados/sincronizados com sucesso!" });
        else return interaction.editReply({ content: "❌ Ocorreu um erro ao criar seus canais." });
      }

      if (action === "call_rename") {
        if (!tier.canCall) return interaction.reply({ content: "❌ Seu tier não permite Call Privada.", flags: MessageFlags.Ephemeral });
        const modal = new ModalBuilder().setCustomId(`vip_modal_call_${interaction.guildId}_${interaction.user.id}`).setTitle("Renomear Call Privada");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("nome").setLabel("Novo nome").setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(modal);
      }

      if (action === "custom_role") {
        if (!tier.hasCustomRole) return interaction.reply({ content: "❌ Seu tier não permite cargo personalizado.", flags: MessageFlags.Ephemeral });
        const modal = new ModalBuilder().setCustomId(`vip_modal_role_${interaction.guildId}_${interaction.user.id}`).setTitle("Customizar Cargo Pessoal");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("nome").setLabel("Nome do cargo (opcional)").setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("cor").setLabel("Cor (hex, ex: #ff0000) (opcional)").setStyle(TextInputStyle.Short).setRequired(false))
        );
        return interaction.showModal(modal);
      }

      if (action === "give_quota") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const validTiers = [];
        const orderedTiers = await vipService.getOrderedTiers(interaction.guildId);
        for (const t of orderedTiers) {
           const check = await vipService.verificarCota(interaction.guildId, interaction.user.id, t.id);
           if (check.ok) validTiers.push(t);
        }

        if (validTiers.length === 0) return interaction.editReply({ content: "❌ Você não possui cotas disponíveis ou esgotou seu limite." });

        const userPick = new UserSelectMenuBuilder().setCustomId(`vip_give_${interaction.guildId}_${interaction.user.id}`).setPlaceholder("Selecione quem vai receber").setMinValues(1).setMaxValues(1);
        return interaction.editReply({ content: "Selecione o usuário para receber o VIP da sua cota:", components: [new ActionRowBuilder().addComponents(userPick)] });
      }

      if (action === "manage_quota") {
        const settings = await vipService.getSettings(interaction.guildId, interaction.user.id) || {};
        const dados = settings.vipsDados || [];

        if (!dados.length) return interaction.reply({ content: "Você ainda não deu VIP para ninguém.", flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const userOptions = await Promise.all(
          dados.slice(0, 25).map(async (data) => {
            const uid = typeof data === "string" ? data : data.userId;
            const tId = typeof data === "string" ? "Legado" : data.tierId;
            try {
              const user = await interaction.client.users.fetch(uid).catch(() => null);
              const label = user ? `${user.username} (Tier: ${tId})` : `${uid} (${tId})`;
              return new StringSelectMenuOptionBuilder().setLabel(label).setValue(uid);
            } catch {
              return new StringSelectMenuOptionBuilder().setLabel(`${uid} (${tId})`).setValue(uid);
            }
          })
        );

        const menu = new StringSelectMenuBuilder().setCustomId(`vip_quota_remove_${interaction.guildId}_${interaction.user.id}`).setPlaceholder("Selecione quem remover da sua cota").addOptions(userOptions);
        return interaction.editReply({ content: "Remover VIP e recuperar sua cota:", components: [new ActionRowBuilder().addComponents(menu)] });
      }

      if (action === "share_role") {
        const settings = await vipService.getSettings(interaction.guildId, interaction.user.id);
        if (!settings?.roleId) return interaction.reply({ content: "❌ Você ainda não possui um cargo personalizado configurado. Use a opção 'Customizar Cargo Pessoal' primeiro.", flags: MessageFlags.Ephemeral });

        const userPick = new UserSelectMenuBuilder()
          .setCustomId(`vip_share_role_${interaction.guildId}_${interaction.user.id}`)
          .setPlaceholder("Selecione quem vai receber o cargo")
          .setMinValues(1).setMaxValues(1);
        return interaction.reply({ content: "Selecione o membro que vai receber seu cargo personalizado:", components: [new ActionRowBuilder().addComponents(userPick)], flags: MessageFlags.Ephemeral });
      }
    }
  },

  async handleUserSelectMenu(interaction) {
    if (!interaction.inGuild()) return;
    if (!interaction.customId?.startsWith("vip_")) return;

    const { vip: vipService } = interaction.client.services;

    // ── Resposta ao selecionar a pessoa que vai receber o VIP (cota) ──
    if (interaction.customId.startsWith("vip_give_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[2];
      const ownerId = parts[3];
      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este menu pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas quem abriu o painel pode usar.", flags: MessageFlags.Ephemeral });

      const selectedUserId = interaction.values?.[0];
      if (!selectedUserId) return interaction.reply({ content: "Seleção inválida.", flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });

      const target = await interaction.guild.members.fetch(selectedUserId).catch(() => null);
      if (!target) return interaction.editReply({ content: "Usuário não encontrado no servidor." });
      if (target.id === interaction.user.id) return interaction.editReply({ content: "❌ Você não pode dar VIP para si mesmo." });
      if (target.user?.bot) return interaction.editReply({ content: "❌ Você não pode dar VIP para bots." });

      const validTiers = [];
      const orderedTiers = await vipService.getOrderedTiers(interaction.guildId);
      for (const t of orderedTiers) {
         const check = await vipService.verificarCota(interaction.guildId, interaction.user.id, t.id);
         if (check.ok) validTiers.push(t);
      }

      if (validTiers.length === 0) return interaction.editReply({ content: "❌ Você esgotou suas cotas." });
      if (validTiers.length === 1) return processGiveVip(interaction, selectedUserId, validTiers[0].id);

      const menu = new StringSelectMenuBuilder()
          .setCustomId(`vip_give_tier_${interaction.guildId}_${interaction.user.id}_${selectedUserId}`)
          .setPlaceholder("Selecione qual VIP deseja dar")
          .addOptions(validTiers.map(t => new StringSelectMenuOptionBuilder().setLabel(t.name || t.id).setValue(t.id)));

      return interaction.editReply({
          content: `Você tem opções de cota. Qual VIP deseja dar para <@${selectedUserId}>?`,
          components: [new ActionRowBuilder().addComponents(menu)],
      });
    }

    // ── Compartilhar cargo personalizado com outro membro ──
    if (interaction.customId.startsWith("vip_share_role_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[3];
      const ownerId = parts[4];
      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este menu pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas o dono do VIP pode usar esta opção.", flags: MessageFlags.Ephemeral });

      const targetUserId = interaction.values?.[0];
      if (!targetUserId) return interaction.reply({ content: "Seleção inválida.", flags: MessageFlags.Ephemeral });
      if (targetUserId === interaction.user.id) return interaction.reply({ content: "❌ Você não pode compartilhar o cargo consigo mesmo.", flags: MessageFlags.Ephemeral });

      const settings = await vipService.getSettings(guildId, ownerId);
      if (!settings?.roleId) return interaction.reply({ content: "❌ Você não possui um cargo personalizado configurado. Use 'Customizar Cargo Pessoal' primeiro.", flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      if (!targetMember) return interaction.editReply({ content: "❌ Membro não encontrado no servidor." });
      if (targetMember.user?.bot) return interaction.editReply({ content: "❌ Você não pode compartilhar o cargo com um bot." });

      try {
        await targetMember.roles.add(settings.roleId);
        return interaction.editReply({ content: `✅ Seu cargo personalizado foi compartilhado com <@${targetUserId}> com sucesso!` });
      } catch {
        return interaction.editReply({ content: "❌ Não foi possível adicionar o cargo. Verifique se o cargo do bot tem permissão suficiente na hierarquia do servidor." });
      }
    }

    // ── Seleção de Primeira Dama ──
    if (interaction.customId.startsWith("vip_select_primeiradama_")) {
      const parts = parseCustomId(interaction.customId);
      // ["vip", "select", "primeiradama", guildId, ownerId]
      const guildId = parts[3];
      const ownerId = parts[4];

      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este menu pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas o dono do VIP pode usar esta opção.", flags: MessageFlags.Ephemeral });

      const selectedUserId = interaction.values?.[0];
      if (!selectedUserId) return interaction.reply({ content: "Seleção inválida.", flags: MessageFlags.Ephemeral });
      if (selectedUserId === interaction.user.id) return interaction.reply({ content: "❌ Você não pode se definir como sua própria Primeira Dama.", flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });

      const tier = await vipService.getMemberTier(interaction.member);
      if (!tier) return interaction.editReply({ content: "❌ Você não é VIP." });

      const targetMember = await interaction.guild.members.fetch(selectedUserId).catch(() => null);
      if (!targetMember) return interaction.editReply({ content: "❌ Membro não encontrado no servidor." });
      if (targetMember.user?.bot) return interaction.editReply({ content: "❌ Você não pode definir um bot como Primeira Dama." });

      // Recupera o(s) cargo(s) de Primeira Dama das configurações do servidor
      const gConfig = await getGuildConfig(guildId);
      const damaRoleIds = gConfig?.primeraDamaRoleIds?.length
        ? gConfig.primeraDamaRoleIds
        : (gConfig?.damaRoleId ? [gConfig.damaRoleId] : []);

      if (!damaRoleIds.length) {
        return interaction.editReply({ content: "❌ Os cargos de Primeira Dama não estão configurados neste servidor. Peça a um administrador para usar `/vipadmin config`." });
      }

      try {
        for (const roleId of damaRoleIds) {
          await targetMember.roles.add(roleId).catch((err) => { logger.warn({ err, roleId }, "Falha ao adicionar cargo de Primeira Dama"); });
        }
        return interaction.editReply({ content: `👑 **${targetMember.user.username}** agora é sua Primeira Dama! 💍` });
      } catch (err) {
        logger.error({ err, userId: selectedUserId }, "[VIP] Falha ao adicionar cargo de Primeira Dama");
        return interaction.editReply({ content: "❌ Não foi possível adicionar o cargo. Verifique se o cargo do bot tem permissão suficiente na hierarquia do servidor." });
      }
    }
  },

  async handleButton(interaction) {
    if (!interaction.inGuild()) return;
    if (!interaction.customId?.startsWith("vip_btn_") &&
        !interaction.customId?.startsWith("vip_quota_give_") &&
        !interaction.customId?.startsWith("vip_quota_manage_")) return;

    const { vip: vipService, vipChannel } = interaction.client.services;

    // ── Botão: Voltar ao Hub principal ────────────────────────────────────────
    if (interaction.customId.startsWith("vip_btn_back_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[3];
      const ownerId = parts[4];

      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este painel pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas o dono do VIP pode usar esta opção.", flags: MessageFlags.Ephemeral });

      await interaction.deferUpdate().catch((err) => { logger.warn({ err }, "Falha em deferUpdate no back button"); });

      const tier = await vipService.getMemberTier(interaction.member);
      if (!tier) return interaction.editReply({ content: "❌ Você não é VIP.", embeds: [], components: [] });

      const data = await vipService.getVipData(guildId, ownerId);
      const settings = await vipService.getSettings(guildId, ownerId) || {};
      const embed = buildVipDashboardEmbed(ownerId, interaction.user.displayAvatarURL({ dynamic: true }), tier, data, settings);

      return interaction.editReply({
        embeds: [embed],
        components: [buildVipCategoryMenu(guildId, ownerId)],
      });
    }

    // ── Botão: Família ────────────────────────────────────────────────────────
    if (interaction.customId.startsWith("vip_btn_family_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[3];
      const ownerId = parts[4];

      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este painel pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas o dono do VIP pode usar esta opção.", flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });

      const familyService = interaction.client.services?.family;
      if (!familyService) return interaction.editReply({ content: "❌ Sistema de família indisponível." });

      const family = await familyService.getFamilyByOwner(ownerId).catch(() => null)
                  || await familyService.getFamilyByMember(ownerId).catch(() => null);

      if (!family) {
        return interaction.editReply({ content: "❌ Você não possui uma família. Use `/family criar` para criar uma." });
      }

      const embed = new EmbedBuilder()
        .setTitle(`👨‍👩‍👧‍👦 Família: ${family.name}`)
        .setColor("Purple")
        .addFields(
          { name: "👤 Líder", value: `<@${family.ownerId}>`, inline: true },
          { name: "👥 Membros", value: `${(family.members || []).length} / ${family.maxMembers || "?"}`, inline: true },
        )
        .setFooter({ text: "vip | © WDA - Todos os direitos reservados" });

      return interaction.editReply({ embeds: [embed] });
    }

    // ── Botão: Primeira Dama ──────────────────────────────────────────────────
    if (interaction.customId.startsWith("vip_btn_primeiradama_")) {
      const parts = parseCustomId(interaction.customId);
      // ["vip", "btn", "primeiradama", guildId, ownerId]
      const guildId = parts[3];
      const ownerId = parts[4];

      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este painel pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas o dono do VIP pode usar esta opção.", flags: MessageFlags.Ephemeral });

      const tier = await vipService.getMemberTier(interaction.member);
      if (!tier) return interaction.reply({ content: "❌ Você não é VIP.", flags: MessageFlags.Ephemeral });

      if (!(tier.primeiras_damas > 0)) {
        return interaction.reply({ content: "❌ Seu plano VIP não inclui o benefício de Primeira Dama.", flags: MessageFlags.Ephemeral });
      }

      const userSelect = new UserSelectMenuBuilder()
        .setCustomId(`vip_select_primeiradama_${interaction.guildId}_${interaction.user.id}`)
        .setPlaceholder("Quem será a sua Primeira Dama? 👑")
        .setMinValues(1)
        .setMaxValues(1);

      return interaction.reply({
        components: [new ActionRowBuilder().addComponents(userSelect)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── Botão: Canal de Voz ────────────────────────────────────────────────────
    if (interaction.customId.startsWith("vip_btn_voice_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[3];
      const ownerId = parts[4];

      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este painel pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas o dono do VIP pode usar esta opção.", flags: MessageFlags.Ephemeral });

      const tier = await vipService.getMemberTier(interaction.member);
      if (!tier) return interaction.reply({ content: "❌ Você não é VIP.", flags: MessageFlags.Ephemeral });
      if (!tier.canCall) return interaction.reply({ content: "❌ Seu plano não inclui Canal de Voz privado.", flags: MessageFlags.Ephemeral });

      const modal = new ModalBuilder()
        .setCustomId(`vip_modal_call_${guildId}_${ownerId}`)
        .setTitle("🎙️ Renomear Canal de Voz");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("nome")
            .setLabel("Novo nome para sua Call Privada")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder("Ex: Call da Família"),
        ),
      );

      return interaction.showModal(modal);
    }

    // ── Botão: Chat Privado ────────────────────────────────────────────────────
    if (interaction.customId.startsWith("vip_btn_chat_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[3];
      const ownerId = parts[4];

      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este painel pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas o dono do VIP pode usar esta opção.", flags: MessageFlags.Ephemeral });

      const tier = await vipService.getMemberTier(interaction.member);
      if (!tier) return interaction.reply({ content: "❌ Você não é VIP.", flags: MessageFlags.Ephemeral });
      if (!tier.chat_privado) return interaction.reply({ content: "❌ Seu plano não inclui Chat Privado.", flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });

      await vipChannel.ensureVipChannels(ownerId, { guildId }).catch((err) => {
        logger.warn({ err, userId: ownerId }, "[VIP] Falha ao garantir canais via botão chat");
      });

      return interaction.editReply({ content: "✅ Canal de chat privado sincronizado!" });
    }

    // ── Botão: Stealth Mode ───────────────────────────────────────────────────
    if (interaction.customId.startsWith("vip_btn_stealth_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[3];
      const ownerId = parts[4];

      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este painel pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas o dono do VIP pode usar esta opção.", flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });

      const settings = await vipService.getSettings(guildId, ownerId) || {};
      const newStealth = !settings.stealthMode;
      await vipService.setSettings(guildId, ownerId, { stealthMode: newStealth });

      return interaction.editReply({
        content: `🕵️ Stealth Mode **${newStealth ? "ativado" : "desativado"}**! Suas entradas em call ${newStealth ? "não serão" : "serão"} anunciadas.`,
      });
    }

    // ── Botão: Som de Entrada ─────────────────────────────────────────────────
    if (interaction.customId.startsWith("vip_btn_intro_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[3];
      const ownerId = parts[4];

      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este painel pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas o dono do VIP pode usar esta opção.", flags: MessageFlags.Ephemeral });

      const tier = await vipService.getMemberTier(interaction.member);
      if (!tier) return interaction.reply({ content: "❌ Você não é VIP.", flags: MessageFlags.Ephemeral });
      if (!tier.canCall && !tier.hasIntroSound) return interaction.reply({ content: "❌ Seu plano não suporta Som de Entrada.", flags: MessageFlags.Ephemeral });

      const modal = new ModalBuilder()
        .setCustomId(`vip_modal_intro_${guildId}_${ownerId}`)
        .setTitle("🎵 Configurar Som de Entrada");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("url")
            .setLabel("URL do Áudio (MP3/WAV)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder("https://exemplo.com/audio.mp3 (vazio para remover)"),
        ),
      );

      return interaction.showModal(modal);
    }

    // ── Botão: Cargo Pessoal ──────────────────────────────────────────────────
    if (interaction.customId.startsWith("vip_btn_role_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[3];
      const ownerId = parts[4];

      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este painel pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas o dono do VIP pode usar esta opção.", flags: MessageFlags.Ephemeral });

      const tier = await vipService.getMemberTier(interaction.member);
      if (!tier) return interaction.reply({ content: "❌ Você não é VIP.", flags: MessageFlags.Ephemeral });
      if (!tier.hasCustomRole) return interaction.reply({ content: "❌ Seu plano não inclui Cargo Personalizado.", flags: MessageFlags.Ephemeral });

      const modal = new ModalBuilder()
        .setCustomId(`vip_modal_role_${guildId}_${ownerId}`)
        .setTitle("🎭 Customizar Cargo Pessoal");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("nome")
            .setLabel("Nome do cargo (opcional)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("cor")
            .setLabel("Cor em hex (ex: #ff0000) (opcional)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false),
        ),
      );

      return interaction.showModal(modal);
    }

    // ── Botão: Cotas de Presente ──────────────────────────────────────────────
    if (interaction.customId.startsWith("vip_btn_quota_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[3];
      const ownerId = parts[4];

      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este painel pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas o dono do VIP pode usar esta opção.", flags: MessageFlags.Ephemeral });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`vip_quota_give_${guildId}_${ownerId}`)
          .setLabel("Dar VIP da Minha Cota")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🎁"),
        new ButtonBuilder()
          .setCustomId(`vip_quota_manage_${guildId}_${ownerId}`)
          .setLabel("Gerenciar Cotas Dadas")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("⚙️"),
      );

      return interaction.reply({
        content: "O que deseja fazer com suas cotas?",
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── Botão: Dar VIP da Cota (sub-ação) ────────────────────────────────────
    if (interaction.customId.startsWith("vip_quota_give_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[3];
      const ownerId = parts[4];

      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este painel pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas o dono do VIP pode usar esta opção.", flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });

      const validTiers = [];
      const orderedTiers = await vipService.getOrderedTiers(guildId);
      for (const t of orderedTiers) {
        const check = await vipService.verificarCota(guildId, ownerId, t.id);
        if (check.ok) validTiers.push(t);
      }

      if (validTiers.length === 0) return interaction.editReply({ content: "❌ Você não possui cotas disponíveis ou esgotou seu limite." });

      const userPick = new UserSelectMenuBuilder()
        .setCustomId(`vip_give_${guildId}_${ownerId}`)
        .setPlaceholder("Selecione quem vai receber")
        .setMinValues(1)
        .setMaxValues(1);

      return interaction.editReply({ content: "Selecione o usuário para receber o VIP da sua cota:", components: [new ActionRowBuilder().addComponents(userPick)] });
    }

    // ── Botão: Gerenciar Cotas Dadas (sub-ação) ───────────────────────────────
    if (interaction.customId.startsWith("vip_quota_manage_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[3];
      const ownerId = parts[4];

      if (interaction.guildId !== guildId) return interaction.reply({ content: "Este painel pertence a outro servidor.", flags: MessageFlags.Ephemeral });
      if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas o dono do VIP pode usar esta opção.", flags: MessageFlags.Ephemeral });

      const settings = await vipService.getSettings(guildId, ownerId) || {};
      const dados = settings.vipsDados || [];

      if (!dados.length) return interaction.reply({ content: "Você ainda não deu VIP para ninguém.", flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });

      const userOptions = await Promise.all(
        dados.slice(0, 25).map(async (data) => {
          const uid = typeof data === "string" ? data : data.userId;
          const tId = typeof data === "string" ? "Legado" : data.tierId;
          try {
            const user = await interaction.client.users.fetch(uid).catch(() => null);
            const label = user ? `${user.username} (Tier: ${tId})` : `${uid} (${tId})`;
            return new StringSelectMenuOptionBuilder().setLabel(label.slice(0, 100)).setValue(uid);
          } catch {
            return new StringSelectMenuOptionBuilder().setLabel(`${uid} (${tId})`).setValue(uid);
          }
        }),
      );

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`vip_quota_remove_${guildId}_${ownerId}`)
        .setPlaceholder("Selecione quem remover da sua cota")
        .addOptions(userOptions);

      return interaction.editReply({ content: "Remover VIP e recuperar sua cota:", components: [new ActionRowBuilder().addComponents(menu)] });
    }
  },

  async handleModal(interaction) {
    if (!interaction.inGuild()) return;
    if (!interaction.customId?.startsWith("vip_modal_")) return;

    const { vip: vipService, vipRole, vipChannel } = interaction.client.services;
    const parts = parseCustomId(interaction.customId);
    const modalType = parts[2];
    const guildId = parts[3];
    const ownerId = parts[4];

    if (interaction.guildId !== guildId) return interaction.reply({ content: "Este modal pertence a outro servidor.", flags: MessageFlags.Ephemeral });
    if (!isSameUser(interaction, ownerId)) return interaction.reply({ content: "Apenas quem abriu o painel pode usar.", flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((err) => { logger.warn({ err }, "Falha em chamada Discord API"); });

    const tier = await vipService.getMemberTier(interaction.member);
    if (!tier) return interaction.editReply({ content: "❌ Você não é VIP." });

    if (modalType === "call") {
      if (!tier.canCall) return interaction.editReply({ content: "❌ Seu tier não permite Call Privada." });
      const nome = interaction.fields.getTextInputValue("nome");
      const res = await vipChannel.updateChannelName(interaction.user.id, nome, { guildId: interaction.guildId });
      return interaction.editReply({ content: res.ok ? "✅ Nome atualizado!" : `❌ ${res.reason}` });
    }

    if (modalType === "role") {
      if (!tier.hasCustomRole) return interaction.editReply({ content: "❌ Seu tier não permite cargo personalizado." });
      const roleName = (interaction.fields.getTextInputValue("nome") || "").trim() || null;
      const roleColor = (interaction.fields.getTextInputValue("cor") || "").trim() || null;
      const res = await vipRole.updatePersonalRole(interaction.user.id, { roleName, roleColor }, { guildId: interaction.guildId });
      return interaction.editReply({ content: res.ok ? "✅ Cargo atualizado!" : "❌ Erro ao atualizar." });
    }

    if (modalType === "intro") {
      if (!tier.canCall && !tier.hasIntroSound) return interaction.editReply({ content: "❌ Seu tier não suporta Som de Entrada." });
      const url = (interaction.fields.getTextInputValue("url") || "").trim() || null;
      if (url && !/^https?:\/\/.+\.(mp3|wav|ogg|opus|webm)(\?.*)?$/i.test(url)) {
        return interaction.editReply({ content: "❌ URL inválida. Use um link direto para um arquivo de áudio (mp3, wav, ogg, opus, webm)." });
      }
      await vipService.setSettings(guildId, ownerId, { introSoundUrl: url });
      return interaction.editReply({ content: url ? `✅ Som de entrada configurado!` : "✅ Som de entrada removido." });
    }
  }
};
