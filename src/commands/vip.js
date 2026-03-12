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
    .addSubcommand(s => s.setName("info").setDescription("Ver benefícios ativos e painel VIP"))
    .addSubcommand(s => s.setName("call").setDescription("Mudar nome da call").addStringOption(o => o.setName("nome").setDescription("Novo nome").setRequired(true)))
    .addSubcommand(s => s.setName("dar").setDescription("Dar VIP da sua cota")
        .addUserOption(o => o.setName("membro").setDescription("Quem recebe").setRequired(true))
        .addStringOption(o => o.setName("tier").setDescription("Qual tier deseja dar (se houver mais de um)").setRequired(false))
    )
    .addSubcommand(s => s.setName("customizar").setDescription("Editar cargo pessoal").addStringOption(o => o.setName("nome").setDescription("Nome do cargo (opcional)")).addStringOption(o => o.setName("cor").setDescription("Cor em hex (opcional)"))),

  async execute(interaction) {
    const { vip: vipService, vipRole, vipChannel, vipConfig } = interaction.client.services;
    const tier = await vipService.getMemberTier(interaction.member);
    if (!tier) return interaction.reply({ content: "❌ Você não é VIP.", flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();

    if (sub === "info") {
      await vipChannel.ensureVipChannels(interaction.user.id, { guildId: interaction.guildId }).catch((err) => {
        logger.warn({ err, userId: interaction.user.id }, "Falha ao garantir canais VIP no /vip info");
      });

      const data = await vipService.getVipData(interaction.guildId, interaction.user.id);
      const settings = await vipService.getSettings(interaction.guildId, interaction.user.id) || {};
      const cotasUsadas = settings.cotasUsadas || {};
      const tierConfig = await vipConfig.getTierConfig(interaction.guildId, tier.id);
      
      const regras = Array.isArray(tierConfig?.cotasConfig) ? tierConfig.cotasConfig : (tierConfig?.cotasConfig ? [tierConfig.cotasConfig] : []);

      let cotasText = regras.map((r) => {
        if (r.modo === "A") return `🔹 **Modo A:** ${r.quantidade} cota(s) de tiers inferiores`;
        if (r.modo === "B") {
           const used = cotasUsadas[r.targetTierId] || 0;
           return `🔸 **Modo B:** ${used}/${r.quantidade} cota(s) do tier \`${r.targetTierId}\``;
        }
        return "";
      }).filter(Boolean).join("\n");

      if (!cotasText) cotasText = "Nenhuma cota configurada para o seu plano.";

      const expiresAt = data?.expiresAt;
      const embed = new EmbedBuilder().setTitle("💎 Painel VIP").setColor("Gold")
        .addFields(
          { name: "👑 Seu Plano", value: `\`${tier.name || tier.id}\``, inline: true },
          { name: "⏳ Expiração", value: expiresAt ? `<t:${Math.floor(expiresAt/1000)}:R>` : "Permanente", inline: true },
          { name: "🎁 Minhas Cotas", value: cotasText, inline: false }
        );

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`vip_action_${interaction.guildId}_${interaction.user.id}`)
        .setPlaceholder("Escolha uma ação")
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel("Criar/Sincronizar Canais").setValue("create_channels").setEmoji("🗂️"),
          new StringSelectMenuOptionBuilder().setLabel("Renomear Call Privada").setValue("call_rename").setEmoji("✏️"),
          new StringSelectMenuOptionBuilder().setLabel("Customizar Cargo Pessoal").setValue("custom_role").setEmoji("🎨"),
          new StringSelectMenuOptionBuilder().setLabel("Dar VIP da sua cota").setValue("give_quota").setEmoji("🎁"),
          new StringSelectMenuOptionBuilder().setLabel("Gerenciar cotas dadas").setValue("manage_quota").setEmoji("⚙️"),
          new StringSelectMenuOptionBuilder().setLabel("Compartilhar Cargo Personalizado").setValue("share_role").setEmoji("🤝")
        );

      const btnPrimeiraDama = new ButtonBuilder()
        .setCustomId(`vip_btn_primeiradama_${interaction.guildId}_${interaction.user.id}`)
        .setLabel("Primeira Dama")
        .setEmoji("👑")
        .setStyle(ButtonStyle.Secondary);

      return interaction.reply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(menu),
          new ActionRowBuilder().addComponents(btnPrimeiraDama),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === "call") {
      if (!tier.canCall) return interaction.reply("❌ Seu tier não permite Call Privada.");
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const res = await vipChannel.updateChannelName(interaction.user.id, interaction.options.getString("nome"), { guildId: interaction.guildId });
      return interaction.editReply(res.ok ? "✅ Nome atualizado!" : `❌ ${res.reason}`);
    }

    if (sub === "dar") {
      const target = interaction.options.getMember("membro");
      const chosenTierId = interaction.options.getString("tier")?.toLowerCase();

      if (target.id === interaction.user.id) return interaction.reply({ content: "❌ Você não pode dar VIP para si mesmo.", flags: MessageFlags.Ephemeral });
      if (target.user?.bot) return interaction.reply({ content: "❌ Você não pode dar VIP para bots.", flags: MessageFlags.Ephemeral });

      const validTiers = [];
      const orderedTiers = await vipService.getOrderedTiers(interaction.guildId);
      for (const t of orderedTiers) {
         const check = await vipService.verificarCota(interaction.guildId, interaction.user.id, t.id);
         if (check.ok) validTiers.push(t);
      }

      if (validTiers.length === 0) return interaction.reply({ content: "❌ Você não possui cotas disponíveis ou esgotou seu limite.", flags: MessageFlags.Ephemeral });

      let targetTierId = chosenTierId;
      if (!targetTierId) {
         if (validTiers.length === 1) {
             targetTierId = validTiers[0].id;
         } else {
            const menu = new StringSelectMenuBuilder()
              .setCustomId(`vip_give_tier_${interaction.guildId}_${interaction.user.id}_${target.id}`)
              .setPlaceholder("Selecione qual VIP deseja dar")
              .addOptions(validTiers.map(t => new StringSelectMenuOptionBuilder().setLabel(t.name || t.id).setValue(t.id)));

            return interaction.reply({ content: `Você tem opções de cota. Qual VIP deseja dar para <@${target.id}>?`, components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
         }
      } else {
         const check = await vipService.verificarCota(interaction.guildId, interaction.user.id, targetTierId);
         if (!check.ok) return interaction.reply({ content: `❌ ${check.reason}`, flags: MessageFlags.Ephemeral });
      }

      return processGiveVip(interaction, target.id, targetTierId);
    }

    if (sub === "customizar") {
      if (!tier.hasCustomRole) return interaction.reply("❌ Seu tier não permite cargo personalizado.");
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const res = await vipRole.updatePersonalRole(interaction.user.id, { 
        roleName: interaction.options.getString("nome"), 
        roleColor: interaction.options.getString("cor") 
      }, { guildId: interaction.guildId });
      return interaction.editReply(res.ok ? "✅ Cargo atualizado!" : "❌ Erro ao atualizar.");
    }
  },
  async handleSelectMenu(interaction) {
    if (!interaction.inGuild()) return;
    if (!interaction.customId?.startsWith("vip_")) return;

    const { vip: vipService, vipRole, vipChannel } = interaction.client.services;

    // ── Resposta ao selecionar o Tier que vai dar ──
    if (interaction.customId.startsWith("vip_give_tier_")) {
       const parts = parseCustomId(interaction.customId);
       // ["vip", "give", "tier", guildId, ownerId, targetUserId]
       const ownerId = parts[4];
       const targetUserId = parts[5];
       const tierId = interaction.values[0];
       
       if (ownerId !== interaction.user.id) return interaction.reply({ content: "Você não tem permissão.", flags: MessageFlags.Ephemeral });

       await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
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

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

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
              if (member) await member.roles.remove(tier.cotaRoleId).catch(() => {});
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

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

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

      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

      const tier = await vipService.getMemberTier(interaction.member);
      if (!tier) return interaction.editReply({ content: "❌ Você não é VIP." });

      const targetMember = await interaction.guild.members.fetch(selectedUserId).catch(() => null);
      if (!targetMember) return interaction.editReply({ content: "❌ Membro não encontrado no servidor." });
      if (targetMember.user?.bot) return interaction.editReply({ content: "❌ Você não pode definir um bot como Primeira Dama." });

      // Recupera o cargo de Primeira Dama das configurações do servidor
      const gConfig = await getGuildConfig(guildId);
      const damaRoleId = gConfig?.damaRoleId;

      if (!damaRoleId) {
        return interaction.editReply({ content: "❌ O cargo de Primeira Dama não está configurado neste servidor. Peça a um administrador para usar `/dama config`." });
      }

      try {
        await targetMember.roles.add(damaRoleId);
        return interaction.editReply({ content: `👑 **${targetMember.user.username}** agora é sua Primeira Dama! 💍` });
      } catch (err) {
        console.error(`[VIP] Falha ao adicionar cargo de Primeira Dama userId=${selectedUserId}:`, err.message);
        return interaction.editReply({ content: "❌ Não foi possível adicionar o cargo. Verifique se o cargo do bot tem permissão suficiente na hierarquia do servidor." });
      }
    }
  },

  async handleButton(interaction) {
    if (!interaction.inGuild()) return;
    if (!interaction.customId?.startsWith("vip_btn_")) return;

    const { vip: vipService } = interaction.client.services;

    // ── Botão: Primeira Dama ──
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

    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

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
  }
};
