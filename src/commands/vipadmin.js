const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { createSuccessEmbed, createErrorEmbed, createEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { createPagination } = require("../utils/pagination");

const familyStore = createDataStore("families.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipadmin")
    .setDescription("Gerencia configurações avançadas de VIP (Tiers e Administração)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("list_tiers").setDescription("Lista todos os Tiers VIP configurados"))
    .addSubcommand((sub) =>
      sub
        .setName("add_tier")
        .setDescription("Adiciona ou atualiza um Tier VIP")
        .addRoleOption((opt) => opt.setName("cargo").setDescription("Cargo do Tier (Permissões)").setRequired(true))
        .addStringOption((opt) => opt.setName("nome").setDescription("Nome do Tier (ex: Gold)").setRequired(true))
        .addIntegerOption((opt) => opt.setName("limite_familia").setDescription("Máximo de membros na família").setRequired(true))
        .addIntegerOption((opt) => opt.setName("limite_damas").setDescription("Máximo de damas").setRequired(true))
        .addBooleanOption((opt) => opt.setName("pode_criar_familia").setDescription("Pode criar família?").setRequired(true))
        .addBooleanOption((opt) => opt.setName("cargo_estetico").setDescription("Cria cargo estético separado?").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove_tier")
        .setDescription("Remove um Tier VIP")
        .addRoleOption((opt) => opt.setName("cargo").setDescription("Cargo do Tier a remover").setRequired(true))
    )
    .addSubcommand((sub) => sub.setName("list_families").setDescription("Lista todas as famílias criadas"))
    .addSubcommand((sub) =>
      sub
        .setName("delete_family")
        .setDescription("Força a exclusão de uma família (Admin)")
        .addUserOption((opt) => opt.setName("dono").setDescription("Dono da família a deletar").setRequired(true))
    ),

  async execute(interaction) {
    const vipConfig = interaction.client.services.vipConfig;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "list_tiers") {
      const tiers = await vipConfig.getGuildTiers(guildId);
      if (!tiers || Object.keys(tiers).length === 0) {
        return interaction.reply({ embeds: [createEmbed({ description: "Nenhum Tier VIP configurado." })], ephemeral: true });
      }

      const fields = Object.values(tiers).map((t) => ({
        name: t.name,
        value: `Cargo: <@&${t.roleId}>\nFamília: ${t.limits.familyMembers} membros\nDamas: ${t.limits.damas}\nCria Família: ${t.limits.allowFamily ? "Sim" : "Não"}`,
        inline: true,
      }));

      return interaction.reply({
        embeds: [
          createEmbed({
            title: "💎 Tiers VIP Configurados",
            fields,
            color: 0x9B59B6,
          }),
        ],
        ephemeral: true,
      });
    }

    if (sub === "add_tier") {
      const role = interaction.options.getRole("cargo");
      const name = interaction.options.getString("nome");
      const limitFamily = interaction.options.getInteger("limite_familia");
      const limitDamas = interaction.options.getInteger("limite_damas");
      const allowFamily = interaction.options.getBoolean("pode_criar_familia");
      const aestheticRole = interaction.options.getBoolean("cargo_estetico");

      const tierData = {
        name,
        roleId: role.id,
        aesthetic: Boolean(aestheticRole),
        limits: {
          familyMembers: limitFamily,
          damas: limitDamas,
          allowFamily,
        },
      };

      await vipConfig.setGuildTier(guildId, role.id, tierData);

      return interaction.reply({
        embeds: [
          createSuccessEmbed(
            `Tier **${name}** configurado para o cargo ${role}!\nCria cargo estético: ${aestheticRole ? "Sim" : "Não"}`
          ),
        ],
        ephemeral: true,
      });
    }

    if (sub === "remove_tier") {
      const role = interaction.options.getRole("cargo");
      await vipConfig.removeGuildTier(guildId, role.id);

      return interaction.reply({
        embeds: [createSuccessEmbed(`Tier do cargo ${role} removido.`)],
        ephemeral: true,
      });
    }

    if (sub === "list_families") {
      const families = await familyStore.load();
      const familyList = Object.values(families || {});

      if (familyList.length === 0) {
        return interaction.reply({ embeds: [createEmbed({ description: "Nenhuma família criada." })], ephemeral: true });
      }

      await createPagination({
        interaction,
        items: familyList,
        itemsPerPage: 10,
        title: "🏰 Famílias do Servidor",
        embedBuilder: (items, page, total) => {
          const desc = items
            .map((f) => `**${f.name}** (Dono: <@${f.ownerId}>) - ${f.members.length} membros`)
            .join("\n");
          return createEmbed({
            title: "🏰 Famílias do Servidor",
            description: desc,
            footer: { text: `Página ${page + 1}/${total} • Total: ${familyList.length} famílias` },
          });
        },
      });

      return;
    }

    if (sub === "delete_family") {
      const owner = interaction.options.getUser("dono");
      const families = await familyStore.load();
      const family = Object.values(families || {}).find((f) => f.ownerId === owner.id);

      if (!family) {
        return interaction.reply({ embeds: [createErrorEmbed("Este usuário não é dono de nenhuma família.")], ephemeral: true });
      }

      const guild = interaction.guild;

      if (family.textChannelId) {
        const channel = await guild.channels.fetch(family.textChannelId).catch(() => null);
        if (channel) await channel.delete().catch(() => {});
      }
      if (family.voiceChannelId) {
        const channel = await guild.channels.fetch(family.voiceChannelId).catch(() => null);
        if (channel) await channel.delete().catch(() => {});
      }

      if (family.roleId) {
        const role = await guild.roles.fetch(family.roleId).catch(() => null);
        if (role) await role.delete().catch(() => {});
      }

      const id = family.id;
      delete families[id];
      await familyStore.save(families);

      return interaction.reply({ embeds: [createSuccessEmbed(`Família de ${owner} foi deletada forçadamente.`)], ephemeral: true });
    }
  },
};
