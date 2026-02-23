const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");

const couplesStore = createDataStore("couples.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dama")
    .setDescription("Sistema de Primeira Dama")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Define sua primeira dama (Requer cargo de permissão)")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Sua dama").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove sua primeira dama")
    )
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Configura o cargo de Dama e quem pode usar (Admin)")
        .addRoleOption((opt) => opt.setName("cargo_dama").setDescription("Cargo que será dado à dama").setRequired(true))
        .addRoleOption((opt) => opt.setName("cargo_perm").setDescription("Cargo que pode definir dama").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    // CONFIG (Admin)
    if (sub === "config") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ embeds: [createErrorEmbed("Você precisa de permissão de Gerenciar Servidor.")], ephemeral: true });
        }

        const roleDama = interaction.options.getRole("cargo_dama");
        const rolePerm = interaction.options.getRole("cargo_perm");

        await setGuildConfig(guildId, {
            damaRoleId: roleDama.id,
            damaPermRoleId: rolePerm.id
        });

        await interaction.reply({ 
            embeds: [createSuccessEmbed(`Configuração salva!\n**Cargo Dama:** ${roleDama}\n**Quem pode usar:** ${rolePerm}`)] 
        });
    }

    // SET
    if (sub === "set") {
        const config = await getGuildConfig(guildId);
        
        if (!config.damaPermRoleId || !config.damaRoleId) {
            return interaction.reply({ embeds: [createErrorEmbed("O sistema de Dama não está configurado neste servidor.")], ephemeral: true });
        }

        if (!interaction.member.roles.cache.has(config.damaPermRoleId)) {
            return interaction.reply({ embeds: [createErrorEmbed(`Você precisa ter o cargo <@&${config.damaPermRoleId}> para definir uma dama.`)], ephemeral: true });
        }

        const target = interaction.options.getUser("usuario");
        const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);

        if (!targetMember) {
            return interaction.reply({ embeds: [createErrorEmbed("Usuário não encontrado.")], ephemeral: true });
        }

        // Salvar casal
        const couples = await couplesStore.load();
        const existing = couples[guildId] || {};
        
        // Verifica limite de damas baseado no Tier VIP
        const vipConfig = interaction.client.services.vipConfig;
        const tier = await vipConfig.getMemberTier(interaction.member);
        const maxDamas = tier?.limits?.damas || 1; // Default 1 se não tiver tier configurado

        // Como o armazenamento atual era { userId: damaId } (apenas 1), precisamos migrar para array se permitir múltiplas
        // Para simplificar e manter compatibilidade, se maxDamas > 1, usamos uma estrutura diferente ou hackeamos a existente?
        // Vamos alterar a estrutura para: { userId: [damaId1, damaId2] } ou manter string se for só 1.
        // Melhor padronizar para array.
        
        let currentDamas = existing[userId];
        if (!Array.isArray(currentDamas)) {
            currentDamas = currentDamas ? [currentDamas] : [];
        }

        if (currentDamas.length >= maxDamas) {
             return interaction.reply({ embeds: [createErrorEmbed(`Você atingiu o limite de **${maxDamas}** damas para o seu VIP (${tier?.name || "Padrão"}).`)], ephemeral: true });
        }

        if (currentDamas.includes(target.id)) {
             return interaction.reply({ embeds: [createErrorEmbed("Essa usuária já é sua dama.")], ephemeral: true });
        }

        currentDamas.push(target.id);
        existing[userId] = currentDamas;
        
        couples[guildId] = existing;
        await couplesStore.save(couples);

        // Dar cargo
        await targetMember.roles.add(config.damaRoleId).catch(() => {
            return interaction.followUp({ content: "Não consegui dar o cargo. Verifique minhas permissões.", ephemeral: true });
        });

        await interaction.reply({ 
            embeds: [createSuccessEmbed(`${target} agora é uma das suas Damas!`)] 
        });
    }

    // REMOVE
    if (sub === "remove") {
        // Se tiver múltiplas, precisa especificar qual remover? 
        // Como o comando original não tem opção de usuário no remove, vamos assumir que remove TODAS ou a última?
        // Vamos remover TODAS por enquanto para simplificar a migração, ou pedir update no comando para aceitar usuario.
        // Como não posso editar o builder do comando facilmente sem redeploy, vamos limpar tudo.
        
        const couples = await couplesStore.load();
        const existing = couples[guildId] || {};
        let currentDamas = existing[userId];

        if (!currentDamas || (Array.isArray(currentDamas) && currentDamas.length === 0)) {
            return interaction.reply({ embeds: [createErrorEmbed("Você não tem damas definidas.")], ephemeral: true });
        }

        if (!Array.isArray(currentDamas)) currentDamas = [currentDamas];

        const config = await getGuildConfig(guildId);
        if (config.damaRoleId) {
            for (const damaId of currentDamas) {
                const member = await interaction.guild.members.fetch(damaId).catch(() => null);
                if (member) await member.roles.remove(config.damaRoleId).catch(() => {});
            }
        }

        delete existing[userId];
        couples[guildId] = existing;
        await couplesStore.save(couples);

        await interaction.reply({ 
            embeds: [createSuccessEmbed("Todas as suas damas foram removidas.")] 
        });
    }
  }
};
