// ============================================================
//  family.js  —  Refatorado
//  Novidades:
//   • Cargo de família posicionado abaixo de familyRoleSeparatorId
//   • Canal de texto da família com Cargo Fantasma:
//       ViewChannel: true, SendMessages: false
//   • familyService.deleteFamily integrado (vipExpiryManager)
//   • Lê cargoFantasmaId e familyRoleSeparatorId de
//     vipService.getGuildConfig
// ============================================================

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

const familyStore = createDataStore("families.json");

// ─── Helper: permissões do canal de família ───────────────────────────────────
function buildFamilyChannelPerms(guild, roleId, botId, cargoFantasmaId) {
  const perms = [
    { id: guild.id, deny: ["ViewChannel"] },
    { id: botId,    allow: ["ViewChannel", "ManageChannels"] },
  ];

  if (roleId) {
    perms.push({
      id: roleId,
      allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"],
    });
  }

  // Fantasma — vê mas não escreve
  if (cargoFantasmaId) {
    perms.push({
      id: cargoFantasmaId,
      allow: ["ViewChannel"],
      deny:  ["SendMessages", "Connect"],
    });
  }

  return perms;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("family")
    .setDescription("Sistema de Família VIP")
    .addSubcommandGroup((group) =>
      group
        .setName("manage")
        .setDescription("Gerencie sua família")
        .addSubcommand((sub) =>
          sub.setName("create")
            .setDescription("Cria uma nova família (Requer VIP)")
            .addStringOption((opt) => opt.setName("nome").setDescription("Nome da família").setRequired(true))
        )
        .addSubcommand((sub) => sub.setName("delete").setDescription("Deleta sua família"))
        .addSubcommand((sub) =>
          sub.setName("invite")
            .setDescription("Convida um membro para a família")
            .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário a convidar").setRequired(true))
        )
        .addSubcommand((sub) =>
          sub.setName("kick")
            .setDescription("Remove um membro da família")
            .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário a remover").setRequired(true))
        )
        .addSubcommand((sub) => sub.setName("leave").setDescription("Sai da família atual"))
        .addSubcommand((sub) => sub.setName("info").setDescription("Mostra informações da família"))
        .addSubcommand((sub) =>
          sub.setName("promote")
            .setDescription("Promove um membro a admin")
            .addUserOption((opt) => opt.setName("usuario").setDescription("Membro a promover").setRequired(true))
        )
        .addSubcommand((sub) =>
          sub.setName("demote")
            .setDescription("Rebaixa um admin da família")
            .addUserOption((opt) => opt.setName("usuario").setDescription("Admin a rebaixar").setRequired(true))
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("config")
        .setDescription("Personaliza sua família")
        .addSubcommand((sub) =>
          sub.setName("rename")
            .setDescription("Renomeia a família")
            .addStringOption((opt) => opt.setName("novo_nome").setDescription("Novo nome").setRequired(true))
        )
        .addSubcommand((sub) =>
          sub.setName("color")
            .setDescription("Altera a cor do cargo")
            .addStringOption((opt) => opt.setName("cor").setDescription("Cor Hex (ex: #FF0000)").setRequired(true))
        )
        .addSubcommand((sub) => sub.setName("decorate").setDescription("Decora os canais com templates"))
    )
    .addSubcommandGroup((group) =>
      group
        .setName("bank")
        .setDescription("Banco da Família")
        .addSubcommand((sub) =>
          sub.setName("deposit")
            .setDescription("Deposita moedas")
            .addIntegerOption((opt) => opt.setName("quantia").setDescription("Valor").setMinValue(1).setRequired(true))
        )
        .addSubcommand((sub) =>
          sub.setName("withdraw")
            .setDescription("Saca moedas (Dono/Admin)")
            .addIntegerOption((opt) => opt.setName("quantia").setDescription("Valor").setMinValue(1).setRequired(true))
        )
        .addSubcommand((sub) => sub.setName("balance").setDescription("Ver saldo"))
    )
    .addSubcommandGroup((group) =>
      group
        .setName("info")
        .setDescription("Informações e utilidades")
        .addSubcommand((sub) => sub.setName("list").setDescription("Lista o ranking das maiores famílias"))
        .addSubcommand((sub) =>
          sub.setName("transfer")
            .setDescription("Transfere a liderança")
            .addUserOption((opt) => opt.setName("novo_lider").setDescription("Novo dono").setRequired(true))
        )
        .addSubcommand((sub) => sub.setName("upgrade").setDescription("Compra slot extra de membro"))
        .addSubcommand((sub) => sub.setName("panel").setDescription("Abre o painel de controle da família"))
    ),

  // ─── EXECUTE ────────────────────────────────────────────────────────────────
  async execute(interaction) {
    const sub           = interaction.options.getSubcommand();
    const group         = interaction.options.getSubcommandGroup(false);
    const families      = await familyStore.load();
    const userId        = interaction.user.id;
    const guildId       = interaction.guildId;
    const economyService = interaction.client.services?.economy;
    const vipService    = interaction.client.services?.vip;

    // ── MANAGE ────────────────────────────────────────────────────────────────
    if (group === "manage") {

      // ── create ──────────────────────────────────────────────────────────────
      if (sub === "create") {
        const name = interaction.options.getString("nome");

        const tier       = vipService ? await vipService.getMemberTier(interaction.member) : null;
        const tierConfig = tier ? await vipService.getTierConfig(guildId, tier.id) : null;
        const maxVagas   = tierConfig?.vagas_familia ?? (tier ? 1 : 0);

        if (!tier || maxVagas < 1) {
          return interaction.reply({
            embeds: [createErrorEmbed("Apenas membros VIP com permissão de família podem criar famílias!")],
            flags: MessageFlags.Ephemeral,
          });
        }

        if (Object.values(families).find((f) => f.ownerId === userId)) {
          return interaction.reply({
            embeds: [createErrorEmbed("Você já tem uma família! Use `/family manage delete` primeiro.")],
            flags: MessageFlags.Ephemeral,
          });
        }

        if (Object.values(families).find((f) => f.name.toLowerCase() === name.toLowerCase())) {
          return interaction.reply({
            embeds: [createErrorEmbed(`Já existe uma família chamada **${name}**!`)],
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply();

        const gConfig          = vipService.getGuildConfig(guildId);
        const familyCategoryId = gConfig?.familyCategoryId || null;
        const cargoFantasmaId  = gConfig?.cargoFantasmaId  || null;
        const separadorFamId   = gConfig?.familyRoleSeparatorId || null;
        const familyId         = `family_${Date.now()}_${userId}`;

        // Cria cargo da família
        let roleId = null;
        try {
          const role = await interaction.guild.roles.create({
            name:   `🏠 ${name}`,
            reason: "Criação de família VIP",
          });
          roleId = role.id;

          // Posiciona abaixo do separador de família
          if (separadorFamId) {
            const sep = await interaction.guild.roles.fetch(separadorFamId).catch(() => null);
            if (sep) await role.setPosition(sep.position - 1).catch(() => {});
          }

          await interaction.member.roles.add(role).catch(() => {});
        } catch (e) {
          interaction.client.services?.log?.error?.({ err: e }, "Falha ao criar cargo de família");
        }

        // Cria canal de texto da família com permissão de fantasma
        let channelId = null;
        try {
          const ch = await interaction.guild.channels.create({
            name:   `🏠-${name.toLowerCase().replace(/\s+/g, "-")}`,
            type:   ChannelType.GuildText,
            parent: familyCategoryId,
            permissionOverwrites: buildFamilyChannelPerms(
              interaction.guild,
              roleId,
              interaction.client.user.id,
              cargoFantasmaId,
            ),
          });
          channelId = ch.id;
        } catch (e) {
          interaction.client.services?.log?.error?.({ err: e }, "Falha ao criar canal de família");
        }

        const newFamily = {
          id:         familyId,
          name,
          ownerId:    userId,
          members:    [userId],
          admins:     [userId],
          maxMembers: maxVagas,
          createdAt:  Date.now(),
          roleId,
          channelId,
          bankBalance: 0,
        };

        await familyStore.update(familyId, () => newFamily);

        return interaction.editReply({
          embeds: [createSuccessEmbed(
            `✅ Família **${name}** criada!\n\n👑 Dono: <@${userId}>\n👥 Membros: 1/${maxVagas}\n\nUse \`/family config\` para personalizar.`
          )],
        });
      }

      // ── delete ───────────────────────────────────────────────────────────────
      if (sub === "delete") {
        const family = Object.values(families).find((f) => f.ownerId === userId);
        if (!family) {
          return interaction.reply({ embeds: [createErrorEmbed("Você não tem uma família!")], flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        for (const memberId of family.members) {
          const member = await interaction.guild.members.fetch(memberId).catch(() => null);
          if (member && family.roleId) await member.roles.remove(family.roleId).catch(() => {});
        }

        if (family.roleId) {
          const role = await interaction.guild.roles.fetch(family.roleId).catch(() => null);
          if (role) await role.delete().catch(() => {});
        }

        if (family.channelId) {
          const channel = await interaction.guild.channels.fetch(family.channelId).catch(() => null);
          if (channel) await channel.delete().catch(() => {});
        }

        await familyStore.update(family.id, () => null);

        return interaction.editReply({ embeds: [createSuccessEmbed(`✅ Família **${family.name}** deletada!`)] });
      }

      // ── info ─────────────────────────────────────────────────────────────────
      if (sub === "info") {
        const family = Object.values(families).find((f) => f.members.includes(userId));
        if (!family) {
          return interaction.reply({ embeds: [createErrorEmbed("Você não está em nenhuma família!")], flags: MessageFlags.Ephemeral });
        }

        const isOwner = family.ownerId === userId;
        const isAdmin = family.admins.includes(userId);

        return interaction.reply({
          embeds: [createEmbed({
            title:  `🏠 ${family.name}`,
            description: isOwner ? "👑 Você é o dono" : isAdmin ? "⭐ Você é admin" : "👤 Você é membro",
            color:  isOwner ? 0xffd700 : isAdmin ? 0x00ff00 : 0x0099ff,
            fields: [
              { name: "👑 Dono",     value: `<@${family.ownerId}>`,                         inline: true },
              { name: "👥 Membros",  value: `${family.members.length}/${family.maxMembers}`, inline: true },
              { name: "📅 Criada",   value: `<t:${Math.floor(family.createdAt / 1000)}:d>`,  inline: true },
              { name: "⭐ Admins",   value: family.admins.map((id) => `<@${id}>`).join(", ") || "Nenhum", inline: false },
            ],
            footer: { text: "WDA - Todos os direitos reservados" },
          })],
        });
      }

      // ── leave ────────────────────────────────────────────────────────────────
      if (sub === "leave") {
        const family = Object.values(families).find((f) => f.members.includes(userId));
        if (!family) return interaction.reply({ embeds: [createErrorEmbed("Você não está em nenhuma família!")], flags: MessageFlags.Ephemeral });
        if (family.ownerId === userId) return interaction.reply({ embeds: [createErrorEmbed("Você é o dono! Delete a família ou transfira a liderança primeiro.")], flags: MessageFlags.Ephemeral });

        await familyStore.update(family.id, () => ({
          ...family,
          members: family.members.filter((id) => id !== userId),
          admins:  family.admins.filter((id) => id !== userId),
        }));

        if (family.roleId) {
          const member = await interaction.guild.members.fetch(userId).catch(() => null);
          if (member) await member.roles.remove(family.roleId).catch(() => {});
        }

        return interaction.reply({ embeds: [createSuccessEmbed(`✅ Você saiu da família **${family.name}**!`)] });
      }

      // ── invite ───────────────────────────────────────────────────────────────
      if (sub === "invite") {
        const targetUser = interaction.options.getUser("usuario");
        const family     = Object.values(families).find((f) => f.ownerId === userId || f.admins.includes(userId));

        if (!family) return interaction.reply({ embeds: [createErrorEmbed("Você não tem família para convidar membros!")], flags: MessageFlags.Ephemeral });
        if (family.members.length >= family.maxMembers) return interaction.reply({ embeds: [createErrorEmbed(`A família já atingiu **${family.maxMembers}** membros!`)], flags: MessageFlags.Ephemeral });
        if (family.members.includes(targetUser.id)) return interaction.reply({ embeds: [createErrorEmbed("Este usuário já está na família!")], flags: MessageFlags.Ephemeral });

        await familyStore.update(family.id, () => ({ ...family, members: [...family.members, targetUser.id] }));

        if (family.roleId) {
          const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
          if (member) await member.roles.add(family.roleId).catch(() => {});
        }

        return interaction.reply({
          embeds: [createSuccessEmbed(`✅ **${targetUser.username}** convidado para **${family.name}**!\n👥 ${family.members.length + 1}/${family.maxMembers}`)],
        });
      }

      // ── kick ─────────────────────────────────────────────────────────────────
      if (sub === "kick") {
        const targetUser = interaction.options.getUser("usuario");
        const family     = Object.values(families).find((f) => f.ownerId === userId || f.admins.includes(userId));

        if (!family) return interaction.reply({ embeds: [createErrorEmbed("Você não tem família!")], flags: MessageFlags.Ephemeral });
        if (targetUser.id === family.ownerId) return interaction.reply({ embeds: [createErrorEmbed("Não pode remover o dono!")], flags: MessageFlags.Ephemeral });
        if (!family.members.includes(targetUser.id)) return interaction.reply({ embeds: [createErrorEmbed("Este usuário não está na família!")], flags: MessageFlags.Ephemeral });

        await familyStore.update(family.id, () => ({
          ...family,
          members: family.members.filter((id) => id !== targetUser.id),
          admins:  family.admins.filter((id) => id !== targetUser.id),
        }));

        if (family.roleId) {
          const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
          if (member) await member.roles.remove(family.roleId).catch(() => {});
        }

        return interaction.reply({ embeds: [createSuccessEmbed(`✅ **${targetUser.username}** removido de **${family.name}**!`)] });
      }

      // ── promote ──────────────────────────────────────────────────────────────
      if (sub === "promote") {
        const targetUser = interaction.options.getUser("usuario");
        const family     = Object.values(families).find((f) => f.ownerId === userId);

        if (!family) return interaction.reply({ embeds: [createErrorEmbed("Apenas o dono pode promover membros!")], flags: MessageFlags.Ephemeral });
        if (!family.members.includes(targetUser.id)) return interaction.reply({ embeds: [createErrorEmbed("Usuário não está na família!")], flags: MessageFlags.Ephemeral });
        if (family.admins.includes(targetUser.id)) return interaction.reply({ embeds: [createErrorEmbed("Já é admin!")], flags: MessageFlags.Ephemeral });

        await familyStore.update(family.id, () => ({ ...family, admins: [...family.admins, targetUser.id] }));
        return interaction.reply({ embeds: [createSuccessEmbed(`✅ **${targetUser.username}** promovido a admin de **${family.name}**!`)] });
      }

      // ── demote ───────────────────────────────────────────────────────────────
      if (sub === "demote") {
        const targetUser = interaction.options.getUser("usuario");
        const family     = Object.values(families).find((f) => f.ownerId === userId);

        if (!family) return interaction.reply({ embeds: [createErrorEmbed("Apenas o dono pode rebaixar admins!")], flags: MessageFlags.Ephemeral });
        if (!family.admins.includes(targetUser.id)) return interaction.reply({ embeds: [createErrorEmbed("Não é admin!")], flags: MessageFlags.Ephemeral });
        if (targetUser.id === family.ownerId) return interaction.reply({ embeds: [createErrorEmbed("Não pode rebaixar a si mesmo!")], flags: MessageFlags.Ephemeral });

        await familyStore.update(family.id, () => ({ ...family, admins: family.admins.filter((id) => id !== targetUser.id) }));
        return interaction.reply({ embeds: [createSuccessEmbed(`✅ **${targetUser.username}** rebaixado de admin de **${family.name}**!`)] });
      }
    }

    // ── CONFIG ────────────────────────────────────────────────────────────────
    if (group === "config") {
      const family = Object.values(families).find((f) => f.ownerId === userId);
      if (!family) return interaction.reply({ embeds: [createErrorEmbed("Apenas o dono pode configurar a família!")], flags: MessageFlags.Ephemeral });

      if (sub === "rename") {
        const newName = interaction.options.getString("novo_nome");
        if (Object.values(families).find((f) => f.name.toLowerCase() === newName.toLowerCase() && f.id !== family.id)) {
          return interaction.reply({ embeds: [createErrorEmbed(`Já existe a família **${newName}**!`)], flags: MessageFlags.Ephemeral });
        }

        await familyStore.update(family.id, () => ({ ...family, name: newName }));

        if (family.roleId) {
          const role = await interaction.guild.roles.fetch(family.roleId).catch(() => null);
          if (role) await role.setName(`🏠 ${newName}`).catch(() => {});
        }
        if (family.channelId) {
          const channel = await interaction.guild.channels.fetch(family.channelId).catch(() => null);
          if (channel) await channel.setName(`🏠-${newName.toLowerCase().replace(/\s+/g, "-")}`).catch(() => {});
        }

        return interaction.reply({ embeds: [createSuccessEmbed(`✅ Família renomeada para **${newName}**!`)] });
      }

      if (sub === "color") {
        const color = interaction.options.getString("cor");
        if (!/^#[0-9A-F]{6}$/i.test(color)) {
          return interaction.reply({ embeds: [createErrorEmbed("Cor inválida! Use formato hex: #FF0000")], flags: MessageFlags.Ephemeral });
        }

        await familyStore.update(family.id, () => ({ ...family, color }));

        if (family.roleId) {
          const role = await interaction.guild.roles.fetch(family.roleId).catch(() => null);
          if (role) await role.setColor(parseInt(color.replace("#", ""), 16)).catch(() => {});
        }

        return interaction.reply({ embeds: [createSuccessEmbed(`✅ Cor alterada para **${color}**!`)] });
      }

      if (sub === "decorate") {
        return interaction.reply({ embeds: [createEmbed({ title: "🎨 Decoração de Canais", description: "Sistema em desenvolvimento!", color: 0x0099ff })] });
      }
    }

    // ── BANK ──────────────────────────────────────────────────────────────────
    if (group === "bank") {
      const family = Object.values(families).find((f) => f.members.includes(userId));
      if (!family) return interaction.reply({ embeds: [createErrorEmbed("Você não está em nenhuma família!")], flags: MessageFlags.Ephemeral });

      if (sub === "deposit") {
        const amount      = interaction.options.getInteger("quantia");
        if (!economyService) return interaction.reply({ embeds: [createErrorEmbed("Serviço de economia indisponível!")], flags: MessageFlags.Ephemeral });
        const userBalance = await economyService.getBalance(guildId, userId);
        if (userBalance.coins < amount) return interaction.reply({ embeds: [createErrorEmbed(`Você não tem **${amount}** moedas!`)], flags: MessageFlags.Ephemeral });

        await economyService.removeCoins(guildId, userId, amount);
        await familyStore.update(family.id, () => ({ ...family, bankBalance: (family.bankBalance || 0) + amount }));

        return interaction.reply({ embeds: [createSuccessEmbed(`✅ **${amount}** moedas depositadas!\n🏦 Novo saldo: **${(family.bankBalance || 0) + amount}**`)] });
      }

      if (sub === "withdraw") {
        const amount  = interaction.options.getInteger("quantia");
        const balance = family.bankBalance || 0;

        if (balance < amount) return interaction.reply({ embeds: [createErrorEmbed(`Banco sem saldo suficiente! Saldo: **${balance}**`)], flags: MessageFlags.Ephemeral });
        if (!family.admins.includes(userId) && family.ownerId !== userId) {
          return interaction.reply({ embeds: [createErrorEmbed("Apenas admins e o dono podem sacar!")], flags: MessageFlags.Ephemeral });
        }

        await familyStore.update(family.id, () => ({ ...family, bankBalance: balance - amount }));
        if (economyService) await economyService.addCoins(guildId, userId, amount);

        return interaction.reply({ embeds: [createSuccessEmbed(`✅ **${amount}** moedas sacadas!\n🏦 Saldo restante: **${balance - amount}**`)] });
      }

      if (sub === "balance") {
        return interaction.reply({
          embeds: [createEmbed({ title: `🏦 Banco da ${family.name}`, description: `Saldo: **${family.bankBalance || 0}** moedas`, color: 0x00ff00 })],
        });
      }
    }

    // ── INFO GROUP ────────────────────────────────────────────────────────────
    if (group === "info") {

      if (sub === "list") {
        const sorted = Object.values(families).sort((a, b) => b.members.length - a.members.length).slice(0, 10);
        if (sorted.length === 0) {
          return interaction.reply({ embeds: [createEmbed({ title: "🏠 Ranking", description: "Nenhuma família encontrada!", color: 0xff0000 })] });
        }

        const fields = sorted.map((f, i) => ({
          name:  `${i + 1}. ${f.name}`,
          value: `👥 ${f.members.length}/${f.maxMembers} membros\n👑 Dono: <@${f.ownerId}>`,
          inline: false,
        }));

        return interaction.reply({ embeds: [createEmbed({ title: "🏠 Ranking de Famílias", description: "Top 10 com mais membros", color: 0x0099ff, fields })] });
      }

      if (sub === "transfer") {
        const newLeader = interaction.options.getUser("novo_lider");
        const family    = Object.values(families).find((f) => f.ownerId === userId);

        if (!family) return interaction.reply({ embeds: [createErrorEmbed("Você não é dono de nenhuma família!")], flags: MessageFlags.Ephemeral });
        if (!family.members.includes(newLeader.id)) return interaction.reply({ embeds: [createErrorEmbed("O usuário não está na família!")], flags: MessageFlags.Ephemeral });

        await familyStore.update(family.id, () => ({
          ...family,
          ownerId: newLeader.id,
          admins:  [newLeader.id, ...family.admins.filter((id) => id !== newLeader.id)],
        }));

        return interaction.reply({ embeds: [createSuccessEmbed(`✅ Liderança de **${family.name}** transferida para **${newLeader.username}**!`)] });
      }

      if (sub === "upgrade") {
        const family = Object.values(families).find((f) => f.ownerId === userId);
        if (!family) return interaction.reply({ embeds: [createErrorEmbed("Apenas o dono pode comprar slots!")], flags: MessageFlags.Ephemeral });

        const upgradeCost = 5000;
        if (!economyService) return interaction.reply({ embeds: [createErrorEmbed("Serviço de economia indisponível!")], flags: MessageFlags.Ephemeral });

        const userBalance = await economyService.getBalance(guildId, userId);
        if (userBalance.coins < upgradeCost) {
          return interaction.reply({ embeds: [createErrorEmbed(`Você precisa de **${upgradeCost}** moedas! Saldo: **${userBalance.coins}**`)], flags: MessageFlags.Ephemeral });
        }

        await economyService.removeCoins(guildId, userId, upgradeCost);
        const newMax = family.maxMembers + 1;
        await familyStore.update(family.id, () => ({ ...family, maxMembers: newMax }));

        return interaction.reply({ embeds: [createSuccessEmbed(`✅ Slot extra comprado!\n💸 Custo: **${upgradeCost}** moedas\n👥 Novo limite: **${newMax}**`)] });
      }

      if (sub === "panel") {
        const family  = Object.values(families).find((f) => f.members.includes(userId));
        if (!family) return interaction.reply({ embeds: [createErrorEmbed("Você não está em nenhuma família!")], flags: MessageFlags.Ephemeral });

        const isOwner = family.ownerId === userId;
        const isAdmin = family.admins.includes(userId);

        const embed = createEmbed({
          title:       `🏠 Painel da ${family.name}`,
          description: isOwner ? "👑 Você é o dono" : isAdmin ? "⭐ Você é admin" : "👤 Você é membro",
          color:       isOwner ? 0xffd700 : isAdmin ? 0x00ff00 : 0x0099ff,
          fields:      [
            { name: "👥 Membros", value: `${family.members.length}/${family.maxMembers}`, inline: true },
            { name: "🏦 Banco",   value: `${family.bankBalance || 0} moedas`,             inline: true },
            { name: "📅 Criada",  value: `<t:${Math.floor(family.createdAt / 1000)}:d>`,  inline: true },
          ],
        });

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("family_btn_info").setLabel("Informações").setStyle(ButtonStyle.Primary).setEmoji("ℹ️"),
          new ButtonBuilder().setCustomId("family_btn_invite_menu").setLabel("Convidar").setStyle(ButtonStyle.Success).setEmoji("📩"),
        );
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("family_btn_leave").setLabel("Sair").setStyle(ButtonStyle.Danger).setEmoji("🚪"),
        );

        return interaction.reply({ embeds: [embed], components: [row1, row2], flags: MessageFlags.Ephemeral });
      }
    }
  },

  // ─── HANDLE BUTTON ──────────────────────────────────────────────────────────
  async handleButton(interaction) {
    const id = interaction.customId;

    if (id === "family_btn_leave") {
      return interaction.reply({ embeds: [createErrorEmbed("Use o comando `/family manage leave` para sair da família.")], flags: MessageFlags.Ephemeral });
    }

    if (id === "family_btn_info") {
      return interaction.reply({ content: "Use os comandos slash para mais detalhes sobre a família.", flags: MessageFlags.Ephemeral });
    }

    if (id === "family_btn_invite_menu") {
      const userSelect = new UserSelectMenuBuilder()
        .setCustomId("family_invite_user")
        .setPlaceholder("Selecione o usuário")
        .setMinValues(1)
        .setMaxValues(1);

      const row      = new ActionRowBuilder().addComponents(userSelect);
      const cancelRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("family_btn_cancel").setLabel("Cancelar").setStyle(ButtonStyle.Secondary),
      );

      return interaction.reply({ content: "Selecione o usuário para convidar:", components: [row, cancelRow], flags: MessageFlags.Ephemeral });
    }

    if (id === "family_btn_cancel") {
      return interaction.update({ content: "❌ Ação cancelada.", components: [], embeds: [] });
    }
  },

  // ─── HANDLE USER SELECT MENU ────────────────────────────────────────────────
  async handleUserSelectMenu(interaction) {
    if (interaction.customId !== "family_invite_user") return;

    const userId       = interaction.user.id;
    const selectedUser = interaction.users.first();
    const families     = await familyStore.load();

    if (!selectedUser) return interaction.reply({ content: "❌ Nenhum usuário selecionado.", flags: MessageFlags.Ephemeral });
    if (selectedUser.bot) return interaction.reply({ content: "❌ Não é possível convidar bots.", flags: MessageFlags.Ephemeral });
    if (selectedUser.id === userId) return interaction.reply({ content: "❌ Você não pode se convidar.", flags: MessageFlags.Ephemeral });

    const userFamily = Object.values(families).find((f) => f.members.includes(selectedUser.id));
    if (userFamily) return interaction.reply({ content: `❌ ${selectedUser.username} já está na família **${userFamily.name}**.`, flags: MessageFlags.Ephemeral });

    const myFamily = Object.values(families).find((f) => f.ownerId === userId);
    if (!myFamily) return interaction.reply({ content: "❌ Você não tem família.", flags: MessageFlags.Ephemeral });
    if (myFamily.members.length >= myFamily.maxMembers) {
      return interaction.reply({ content: `❌ Sua família já atingiu **${myFamily.maxMembers}** membros.`, flags: MessageFlags.Ephemeral });
    }

    await familyStore.update(myFamily.id, () => ({ ...myFamily, members: [...myFamily.members, selectedUser.id] }));

    if (myFamily.roleId) {
      const member = await interaction.guild.members.fetch(selectedUser.id).catch(() => null);
      if (member) await member.roles.add(myFamily.roleId).catch(() => {});
    }

    await interaction.update({ content: `✅ **${selectedUser.username}** convidado!`, components: [] });

    // DM de boas-vindas
    try {
      const member = await interaction.guild.members.fetch(selectedUser.id);
      await member.send({
        embeds: [createEmbed({
          title:       "🎉 Convite para Família",
          description: `Você foi convidado para a família **${myFamily.name}** por **${interaction.user.username}**!`,
          color:       0x00ff00,
        })],
      });
    } catch (_) {}
  },

  // ─── HANDLE MODAL ───────────────────────────────────────────────────────────
  async handleModal(interaction) {
    if (interaction.customId === "family_invite_modal") {
      return interaction.reply({ content: "❌ Modal descontinuado. Use o novo sistema de convite por menu.", flags: MessageFlags.Ephemeral });
    }
  },
};
