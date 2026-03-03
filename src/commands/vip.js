const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

function parseCustomId(customId) {
  return String(customId || "").split("_");
}

function isSameUser(interaction, expectedUserId) {
  return interaction.user?.id === expectedUserId;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vip")
    .setDescription("Gerencie suas vantagens VIP")
    .addSubcommand(s => s.setName("info").setDescription("Ver benefícios ativos"))
    .addSubcommand(s => s.setName("call").setDescription("Mudar nome da call").addStringOption(o => o.setName("nome").setDescription("Novo nome").setRequired(true)))
    .addSubcommand(s => s.setName("dar").setDescription("Dar VIP da sua cota").addUserOption(o => o.setName("membro").setDescription("Quem recebe").setRequired(true)))
    .addSubcommand(s => s.setName("customizar").setDescription("Editar cargo pessoal").addStringOption(o => o.setName("nome")).addStringOption(o => o.setName("cor"))),

  async execute(interaction) {
    const { vip: vipService, vipRole, vipChannel } = interaction.client.services;
    const tier = await vipService.getMemberTier(interaction.member);
    if (!tier) return interaction.reply({ content: "❌ Você não é VIP.", ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === "info") {
      const data = await vipService.getVipData(interaction.guildId, interaction.user.id);
      const embed = new EmbedBuilder().setTitle("💎 Painel VIP").setColor("Gold")
        .addFields(
          { name: "Expiração", value: `<t:${Math.floor(data.expiresAt/1000)}:R>`, inline: true },
          { name: "Cotas Usadas", value: `${(data.vipsDados || []).length}/${tier.primeiras_damas || 0}`, inline: true }
        );

      const menu = new StringSelectMenuBuilder()
        .setCustomId(`vip_action_${interaction.guildId}_${interaction.user.id}`)
        .setPlaceholder("Escolha uma ação")
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel("Renomear Call Privada").setValue("call_rename"),
          new StringSelectMenuOptionBuilder().setLabel("Customizar Cargo Pessoal").setValue("custom_role"),
          new StringSelectMenuOptionBuilder().setLabel("Dar VIP da sua cota").setValue("give_quota"),
          new StringSelectMenuOptionBuilder().setLabel("Gerenciar cotas dadas").setValue("manage_quota")
        );

      return interaction.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true,
      });
    }

    if (sub === "call") {
      if (!tier.canCall) return interaction.reply("❌ Seu tier não permite Call Privada.");
      await interaction.deferReply({ ephemeral: true });
      const res = await vipChannel.updateChannelName(interaction.user.id, interaction.options.getString("nome"), { guildId: interaction.guildId });
      return interaction.editReply(res.ok ? "✅ Nome atualizado!" : `❌ ${res.reason}`);
    }

    if (sub === "dar") {
      const target = interaction.options.getMember("membro");
      const settings = await vipService.getSettings(interaction.guildId, interaction.user.id) || {};
      const dados = settings.vipsDados || [];

      if (dados.length >= (tier.primeiras_damas || 0)) return interaction.reply("❌ Cota esgotada.");
      if (!tier.cotaRoleId) return interaction.reply("❌ Cargo de cota não configurado.");

      await target.roles.add(tier.cotaRoleId);
      dados.push(target.id);
      await vipService.setSettings(interaction.guildId, interaction.user.id, { vipsDados: dados });
      return interaction.reply(`✅ Você deu VIP para ${target}!`);
    }

    if (sub === "customizar") {
      if (!tier.hasCustomRole) return interaction.reply("❌ Seu tier não permite cargo personalizado.");
      await interaction.deferReply({ ephemeral: true });
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

    if (interaction.customId.startsWith("vip_action_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[2];
      const ownerId = parts[3];
      if (interaction.guildId !== guildId) {
        return interaction.reply({ content: "Este painel pertence a outro servidor.", ephemeral: true });
      }
      if (!isSameUser(interaction, ownerId)) {
        return interaction.reply({ content: "Apenas quem abriu o painel pode usar.", ephemeral: true });
      }

      const tier = await vipService.getMemberTier(interaction.member);
      if (!tier) {
        return interaction.reply({ content: "❌ Você não é VIP.", ephemeral: true });
      }

      const action = interaction.values?.[0];
      if (!action) return interaction.reply({ content: "Seleção inválida.", ephemeral: true });

      if (action === "call_rename") {
        if (!tier.canCall) {
          return interaction.reply({ content: "❌ Seu tier não permite Call Privada.", ephemeral: true });
        }
        const modal = new ModalBuilder()
          .setCustomId(`vip_modal_call_${interaction.guildId}_${interaction.user.id}`)
          .setTitle("Renomear Call Privada");

        const nameInput = new TextInputBuilder()
          .setCustomId("nome")
          .setLabel("Novo nome")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
        return interaction.showModal(modal);
      }

      if (action === "custom_role") {
        if (!tier.hasCustomRole) {
          return interaction.reply({ content: "❌ Seu tier não permite cargo personalizado.", ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId(`vip_modal_role_${interaction.guildId}_${interaction.user.id}`)
          .setTitle("Customizar Cargo Pessoal");

        const nomeInput = new TextInputBuilder()
          .setCustomId("nome")
          .setLabel("Nome do cargo (opcional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const corInput = new TextInputBuilder()
          .setCustomId("cor")
          .setLabel("Cor (hex, ex: #ff0000) (opcional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nomeInput),
          new ActionRowBuilder().addComponents(corInput)
        );
        return interaction.showModal(modal);
      }

      if (action === "give_quota") {
        const settings = await vipService.getSettings(interaction.guildId, interaction.user.id) || {};
        const dados = settings.vipsDados || [];

        if ((dados.length >= (tier.primeiras_damas || 0))) {
          return interaction.reply({ content: "❌ Cota esgotada.", ephemeral: true });
        }
        if (!tier.cotaRoleId) {
          return interaction.reply({ content: "❌ Cargo de cota não configurado.", ephemeral: true });
        }

        const userPick = new UserSelectMenuBuilder()
          .setCustomId(`vip_give_${interaction.guildId}_${interaction.user.id}`)
          .setPlaceholder("Selecione quem vai receber")
          .setMinValues(1)
          .setMaxValues(1);

        return interaction.reply({
          content: "Selecione o usuário para receber VIP da sua cota:",
          components: [new ActionRowBuilder().addComponents(userPick)],
          ephemeral: true,
        });
      }

      if (action === "manage_quota") {
        const settings = await vipService.getSettings(interaction.guildId, interaction.user.id) || {};
        const dados = settings.vipsDados || [];

        if (!dados.length) {
          return interaction.reply({ content: "Você ainda não deu VIP da cota para ninguém.", ephemeral: true });
        }

        // Fetch user information for better display
        const userOptions = await Promise.all(
          dados.slice(0, 25).map(async (uid) => {
            try {
              const user = await interaction.client.users.fetch(uid).catch(() => null);
              const label = user ? `${user.username} (${uid})` : uid;
              return new StringSelectMenuOptionBuilder().setLabel(label).setValue(uid);
            } catch {
              return new StringSelectMenuOptionBuilder().setLabel(uid).setValue(uid);
            }
          })
        );

        const menu = new StringSelectMenuBuilder()
          .setCustomId(`vip_quota_remove_${interaction.guildId}_${interaction.user.id}`)
          .setPlaceholder("Selecione quem remover da sua cota")
          .addOptions(userOptions);

        return interaction.reply({
          content: "Remover alguém da sua lista de cotas (isso remove o cargo de cota se configurado):",
          components: [new ActionRowBuilder().addComponents(menu)],
          ephemeral: true,
        });
      }

      return interaction.reply({ content: "Ação não reconhecida.", ephemeral: true });
    }

    if (interaction.customId.startsWith("vip_give_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[2];
      const ownerId = parts[3];
      if (interaction.guildId !== guildId) {
        return interaction.reply({ content: "Este menu pertence a outro servidor.", ephemeral: true });
      }
      if (!isSameUser(interaction, ownerId)) {
        return interaction.reply({ content: "Apenas quem abriu o painel pode usar.", ephemeral: true });
      }

      const tier = await vipService.getMemberTier(interaction.member);
      if (!tier) {
        return interaction.reply({ content: "❌ Você não é VIP.", ephemeral: true });
      }

      const selectedUserId = interaction.values?.[0];
      if (!selectedUserId) {
        return interaction.reply({ content: "Seleção inválida.", ephemeral: true });
      }

      const settings = await vipService.getSettings(interaction.guildId, interaction.user.id) || {};
      const dados = settings.vipsDados || [];
      if (dados.length >= (tier.primeiras_damas || 0)) {
        return interaction.reply({ content: "❌ Cota esgotada.", ephemeral: true });
      }
      if (!tier.cotaRoleId) {
        return interaction.reply({ content: "❌ Cargo de cota não configurado.", ephemeral: true });
      }

      const target = await interaction.guild.members.fetch(selectedUserId).catch(() => null);
      if (!target) {
        return interaction.reply({ content: "Usuário não encontrado no servidor.", ephemeral: true });
      }
      if (target.id === interaction.user.id) {
        return interaction.reply({ content: "❌ Você não pode dar VIP para si mesmo.", ephemeral: true });
      }
      if (target.user?.bot) {
        return interaction.reply({ content: "❌ Você não pode dar VIP para bots.", ephemeral: true });
      }

      await target.roles.add(tier.cotaRoleId).catch(() => {});
      dados.push(target.id);
      await vipService.setSettings(interaction.guildId, interaction.user.id, { vipsDados: dados });
      return interaction.reply({ content: `✅ Você deu VIP para ${target}!`, ephemeral: true });
    }

    if (interaction.customId.startsWith("vip_quota_remove_")) {
      const parts = parseCustomId(interaction.customId);
      const guildId = parts[2];
      const ownerId = parts[3];
      if (interaction.guildId !== guildId) {
        return interaction.reply({ content: "Este menu pertence a outro servidor.", ephemeral: true });
      }
      if (!isSameUser(interaction, ownerId)) {
        return interaction.reply({ content: "Apenas quem abriu o painel pode usar.", ephemeral: true });
      }

      const removeUserId = interaction.values?.[0];
      if (!removeUserId) {
        return interaction.reply({ content: "Seleção inválida.", ephemeral: true });
      }

      const tier = await vipService.getMemberTier(interaction.member);
      if (!tier) {
        return interaction.reply({ content: "❌ Você não é VIP.", ephemeral: true });
      }

      const settings = await vipService.getSettings(interaction.guildId, interaction.user.id) || {};
      let dados = settings.vipsDados || [];
      dados = dados.filter((id) => id !== removeUserId);
      await vipService.setSettings(interaction.guildId, interaction.user.id, { vipsDados: dados });

      if (tier.cotaRoleId) {
        const member = await interaction.guild.members.fetch(removeUserId).catch(() => null);
        if (member) await member.roles.remove(tier.cotaRoleId).catch(() => {});
      }

      return interaction.reply({ content: "✅ Removido da sua lista de cotas.", ephemeral: true });
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

    if (interaction.guildId !== guildId) {
      return interaction.reply({ content: "Este modal pertence a outro servidor.", ephemeral: true });
    }
    if (!isSameUser(interaction, ownerId)) {
      return interaction.reply({ content: "Apenas quem abriu o painel pode usar.", ephemeral: true });
    }

    const tier = await vipService.getMemberTier(interaction.member);
    if (!tier) {
      return interaction.reply({ content: "❌ Você não é VIP.", ephemeral: true });
    }

    if (modalType === "call") {
      if (!tier.canCall) return interaction.reply({ content: "❌ Seu tier não permite Call Privada.", ephemeral: true });
      const nome = interaction.fields.getTextInputValue("nome");
      const res = await vipChannel.updateChannelName(interaction.user.id, nome, { guildId: interaction.guildId });
      return interaction.reply({ content: res.ok ? "✅ Nome atualizado!" : `❌ ${res.reason}`, ephemeral: true });
    }

    if (modalType === "role") {
      if (!tier.hasCustomRole) return interaction.reply({ content: "❌ Seu tier não permite cargo personalizado.", ephemeral: true });
      const roleName = (interaction.fields.getTextInputValue("nome") || "").trim() || null;
      const roleColor = (interaction.fields.getTextInputValue("cor") || "").trim() || null;
      const res = await vipRole.updatePersonalRole(interaction.user.id, { roleName, roleColor }, { guildId: interaction.guildId });
      return interaction.reply({ content: res.ok ? "✅ Cargo atualizado!" : "❌ Erro ao atualizar.", ephemeral: true });
    }
  }
};
