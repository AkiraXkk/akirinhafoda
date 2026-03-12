const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shopadmin")
    .setDescription("Administração da loja e banco do bot")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand((s) =>
      s
        .setName("bank")
        .setDescription("Configurações do banco")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Ação")
            .setRequired(true)
            .addChoices(
              { name: "balance", value: "balance" },
              { name: "set_staff_role", value: "set_staff_role" }
            )
        )
        .addRoleOption((o) => o.setName("role").setDescription("Cargo que pode sacar"))
    )

    .addSubcommand((s) =>
      s
        .setName("withdraw")
        .setDescription("Sacar do banco para coins de um usuário")
        .addUserOption((o) => o.setName("user").setDescription("Usuário destino").setRequired(true))
        .addIntegerOption((o) => o.setName("amount").setDescription("Valor a sacar").setMinValue(1).setRequired(true))
    )

    .addSubcommand((s) =>
      s
        .setName("item_add")
        .setDescription("Adicionar/atualizar item do catálogo")
        .addStringOption((o) => o.setName("id").setDescription("ID único do item").setRequired(true))
        .addStringOption((o) =>
          o
            .setName("type").setDescription("Tipo")
            .setRequired(true)
            .addChoices(
              { name: "temporary_role", value: "temporary_role" },
              { name: "channel_access", value: "channel_access" }
            )
        )
        .addIntegerOption((o) => o.setName("price").setDescription("Preço em coins").setMinValue(1).setRequired(true))
        .addIntegerOption((o) => o.setName("days").setDescription("Duração em dias (0 = permanente)").setMinValue(0).setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Cargo (temporary_role)"))
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Canal (channel_access)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildForum)
        )
        .addStringOption((o) => o.setName("description").setDescription("Descrição"))
        .addBooleanOption((o) => o.setName("enabled").setDescription("Ativo?"))
    )

    .addSubcommand((s) =>
      s
        .setName("item_remove")
        .setDescription("Remover item do catálogo")
        .addStringOption((o) => o.setName("id").setDescription("ID do item").setRequired(true))
    )

    .addSubcommand((s) => s.setName("item_list").setDescription("Listar catálogo")),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "Use este comando em um servidor.", flags: MessageFlags.Ephemeral });
    }

    const shopService = interaction.client.services?.shop;
    const economyService = interaction.client.services?.economy;

    if (!shopService) {
      return interaction.reply({ content: "Serviço shop indisponível.", flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "bank") {
      const action = interaction.options.getString("action");

      if (action === "balance") {
        const bank = await shopService.getBank(guildId);
        const embed = new EmbedBuilder()
          .setTitle("🏦 Banco do Bot")
          .setDescription(`Saldo: **${bank.balance || 0} 🪙**`)
          .addFields({ name: "Cargo de saque", value: bank.staffWithdrawRoleId ? `<@&${bank.staffWithdrawRoleId}>` : "Não configurado" });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (action === "set_staff_role") {
        const role = interaction.options.getRole("role");
        if (!role) return interaction.reply({ content: "Informe o cargo.", flags: MessageFlags.Ephemeral });
        await shopService.setStaffWithdrawRole(guildId, role.id);
        return interaction.reply({ content: `✅ Cargo de saque definido: ${role}`, flags: MessageFlags.Ephemeral });
      }

      return interaction.reply({ content: "Ação inválida.", flags: MessageFlags.Ephemeral });
    }

    if (sub === "withdraw") {
      const bank = await shopService.getBank(guildId);
      const staffRoleId = bank.staffWithdrawRoleId;
      if (!staffRoleId) {
        return interaction.reply({ content: "Cargo de saque não configurado. Use /shopadmin bank action:set_staff_role", flags: MessageFlags.Ephemeral });
      }
      const hasRole = interaction.member?.roles?.cache?.has(staffRoleId);
      if (!hasRole) {
        return interaction.reply({ content: "Você não tem permissão para sacar.", flags: MessageFlags.Ephemeral });
      }

      if (!economyService) {
        return interaction.reply({ content: "Serviço economy indisponível.", flags: MessageFlags.Ephemeral });
      }

      const target = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");

      const w = await shopService.withdraw(guildId, amount, {
        by: interaction.user.id,
        to: target.id,
      });

      if (!w.ok) {
        return interaction.reply({ content: `❌ Falha ao sacar: ${w.reason || "erro"}`, flags: MessageFlags.Ephemeral });
      }

      await economyService.addCoins(guildId, target.id, amount);
      return interaction.reply({ content: `✅ Sacado **${amount} 🪙** para ${target}. Saldo do banco: **${w.balance} 🪙**`, flags: MessageFlags.Ephemeral });
    }

    if (sub === "item_add") {
      const id = interaction.options.getString("id");
      const type = interaction.options.getString("type");
      const priceCoins = interaction.options.getInteger("price");
      const days = interaction.options.getInteger("days");
      const role = interaction.options.getRole("role");
      const channel = interaction.options.getChannel("channel");
      const description = interaction.options.getString("description") || "";
      const enabled = interaction.options.getBoolean("enabled");

      if (type === "temporary_role" && !role) {
        return interaction.reply({ content: "Para temporary_role, informe o cargo.", flags: MessageFlags.Ephemeral });
      }
      if (type === "channel_access" && !channel) {
        return interaction.reply({ content: "Para channel_access, informe o canal.", flags: MessageFlags.Ephemeral });
      }

      const res = await shopService.upsertItem(guildId, {
        id,
        type,
        priceCoins,
        durationDays: days,
        roleId: role?.id || null,
        channelId: channel?.id || null,
        description,
        enabled: enabled ?? true,
      });

      if (!res.ok) {
        return interaction.reply({ content: `❌ Falha: ${res.reason}`, flags: MessageFlags.Ephemeral });
      }

      return interaction.reply({ content: `✅ Item **${id}** salvo.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === "item_remove") {
      const id = interaction.options.getString("id");
      const res = await shopService.removeItem(guildId, id);
      return interaction.reply({ content: res.existed ? `🗑️ Item **${id}** removido.` : `Item **${id}** não existia.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === "item_list") {
      const items = await shopService.listItems(guildId);
      if (!items.length) {
        return interaction.reply({ content: "Catálogo vazio.", flags: MessageFlags.Ephemeral });
      }

      const lines = items
        .slice(0, 25)
        .map((i) => `• **${i.id}** (${i.type}) - ${i.priceCoins} 🪙 - ${i.enabled ? "✅" : "❌"}`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setTitle("🛒 Catálogo da Loja")
        .setDescription(lines);

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({ content: "Subcomando inválido.", flags: MessageFlags.Ephemeral });
  },
};
