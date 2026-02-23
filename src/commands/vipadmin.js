const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { createSuccessEmbed, createErrorEmbed, createEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

const familyStore = createDataStore("families.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipadmin")
    .setDescription("Gerencia configurações avançadas de VIP (Tiers e Limites)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("list_tiers")
        .setDescription("Lista todos os Tiers VIP configurados")
    )
    .addSubcommand((sub) =>
      sub
        .setName("add_tier")
        .setDescription("Adiciona ou atualiza um Tier VIP")
        .addRoleOption((opt) => opt.setName("cargo").setDescription("Cargo do Tier (Permissões)").setRequired(true))
        .addStringOption((opt) => opt.setName("nome").setDescription("Nome do Tier (ex: Gold)").setRequired(true))
        .addIntegerOption((opt) => opt.setName("limite_familia").setDescription("Máximo de membros na família").setRequired(true))
        .addIntegerOption((opt) => opt.setName("limite_damas").setDescription("Máximo de damas").setRequired(true))
        .addBooleanOption((opt) => opt.setName("pode_criar_familia").setDescription("Pode criar família?").setRequired(true))
        .addBooleanOption((opt) => opt.setName("cargo_estetico").setDescription("Criar cargo estético separado?").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove_tier")
        .setDescription("Remove um Tier VIP")
        .addRoleOption((opt) => opt.setName("cargo").setDescription("Cargo do Tier a remover").setRequired(true))
    )
    .addSubcommand((sub) =>
        sub
          .setName("list_families")
          .setDescription("Lista todas as famílias criadas")
    )
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
        if (Object.keys(tiers).length === 0) {
            return interaction.reply({ embeds: [createEmbed({ description: "Nenhum Tier VIP configurado." })] });
        }

        const fields = Object.values(tiers).map(t => ({
            name: `${t.name}`,
            value: `Cargo: <@&${t.roleId}>\nFamília: ${t.limits.familyMembers} membros\nDamas: ${t.limits.damas}\nCria Família: ${t.limits.allowFamily ? "Sim" : "Não"}`,
            inline: true
        }));

        await interaction.reply({ 
            embeds: [createEmbed({
                title: "💎 Tiers VIP Configurados",
                fields,
                color: 0x9B59B6
            })] 
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
            aesthetic: aestheticRole,
            limits: {
                familyMembers: limitFamily,
                damas: limitDamas,
                allowFamily
            }
        };

        // Usa o ID do cargo como chave do Tier para facilitar busca
        await vipConfig.setGuildTier(guildId, role.id, tierData);

        await interaction.reply({ 
            embeds: [createSuccessEmbed(`Tier **${name}** configurado para o cargo ${role}!\n${aestheticRole ? "Cria cargo estético: Sim" : "Cria cargo estético: Não"}`)] 
        });
    }

    if (sub === "remove_tier") {
        const role = interaction.options.getRole("cargo");
        await vipConfig.removeGuildTier(guildId, role.id);
        
        await interaction.reply({ 
            embeds: [createSuccessEmbed(`Tier do cargo ${role} removido.`)] 
        });
    }

    if (sub === "list_families") {
        const families = await familyStore.load();
        const familyList = Object.values(families);

        if (familyList.length === 0) {
            return interaction.reply({ embeds: [createEmbed({ description: "Nenhuma família criada." })] });
        }

        // Paginação simples (top 10)
        const top = await Promise.all(familyList.slice(0, 10).map(async f => {
            return `**${f.name}** (Dono: <@${f.ownerId}>) - ${f.members.length} membros`;
        }));

        await interaction.reply({ 
            embeds: [createEmbed({
                title: "🏰 Famílias do Servidor",
                description: top.join("\n"),
                footer: `Total: ${familyList.length} famílias`
            })] 
        });
    }

    if (sub === "delete_family") {
        const owner = interaction.options.getUser("dono");
        const families = await familyStore.load();
        const family = Object.values(families).find(f => f.ownerId === owner.id);

        if (!family) {
            return interaction.reply({ embeds: [createErrorEmbed("Este usuário não é dono de nenhuma família.")], ephemeral: true });
        }

        const guild = interaction.guild;
        
        // Deletar canais
        if (family.textChannelId) {
            const channel = await guild.channels.fetch(family.textChannelId).catch(() => null);
            if (channel) await channel.delete().catch(() => {});
        }
        if (family.voiceChannelId) {
            const channel = await guild.channels.fetch(family.voiceChannelId).catch(() => null);
            if (channel) await channel.delete().catch(() => {});
        }

        // Deletar cargo
        if (family.roleId) {
            const role = await guild.roles.fetch(family.roleId).catch(() => null);
            if (role) await role.delete().catch(() => {});
        }

        delete families[family.id];
        await familyStore.save(families);

        await interaction.reply({ embeds: [createSuccessEmbed(`Família de ${owner} foi deletada forçadamente.`)] });
    }
  }
};
