const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

const familyStore = createDataStore("families.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("family")
    .setDescription("Sistema de Família VIP")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Cria uma nova família (Requer VIP)")
        .addStringOption((opt) => opt.setName("nome").setDescription("Nome da família").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Deleta sua família")
    )
    .addSubcommand((sub) =>
      sub
        .setName("invite")
        .setDescription("Convida um membro para a família")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário a convidar").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("kick")
        .setDescription("Remove um membro da família")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário a remover").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("leave")
        .setDescription("Sai da família atual")
    )
    .addSubcommand((sub) =>
      sub
        .setName("info")
        .setDescription("Mostra informações da família")
    )
    .addSubcommandGroup((group) =>
        group
            .setName("config")
            .setDescription("Personaliza sua família")
            .addSubcommand((sub) =>
                sub.setName("rename").setDescription("Renomeia a família").addStringOption(opt => opt.setName("novo_nome").setDescription("Novo nome").setRequired(true))
            )
            .addSubcommand((sub) =>
                sub.setName("color").setDescription("Altera a cor do cargo").addStringOption(opt => opt.setName("cor").setDescription("Cor Hex (ex: #FF0000)").setRequired(true))
            )
            .addSubcommand((sub) =>
                sub.setName("decorate").setDescription("Decora os canais com templates")
            )
    )
    .addSubcommand((sub) =>
        sub.setName("promote").setDescription("Promove um membro a admin da família").addUserOption(opt => opt.setName("usuario").setDescription("Membro a promover").setRequired(true))
    )
    .addSubcommand((sub) =>
        sub.setName("demote").setDescription("Rebaixa um admin da família").addUserOption(opt => opt.setName("usuario").setDescription("Admin a rebaixar").setRequired(true))
    )
    .addSubcommand((sub) =>
        sub.setName("list").setDescription("Lista o ranking das maiores famílias")
    )
    .addSubcommand((sub) =>
        sub.setName("transfer").setDescription("Transfere a liderança da família").addUserOption(opt => opt.setName("novo_lider").setDescription("Novo dono").setRequired(true))
    )
    .addSubcommandGroup((group) =>
        group.setName("bank").setDescription("Banco da Família")
            .addSubcommand(sub => sub.setName("deposit").setDescription("Deposita moedas").addIntegerOption(opt => opt.setName("quantia").setDescription("Valor").setMinValue(1).setRequired(true)))
            .addSubcommand(sub => sub.setName("withdraw").setDescription("Saca moedas (Dono/Admin)").addIntegerOption(opt => opt.setName("quantia").setDescription("Valor").setMinValue(1).setRequired(true)))
            .addSubcommand(sub => sub.setName("balance").setDescription("Ver saldo"))
    )
    .addSubcommand((sub) =>
        sub.setName("upgrade").setDescription("Compra slot extra de membro")
    )
    .addSubcommand((sub) =>
        sub.setName("panel").setDescription("Abre o painel de controle da família")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup();
    const families = await familyStore.load();
    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const economyService = interaction.client.services.economy;

    // Helper: Buscar família onde sou MEMBRO (para bank/upgrade)
    const userFamily = Object.values(families).find(f => f.members.includes(userId));

    // PANEL
    if (sub === "panel") {
        if (!userFamily) return interaction.reply({ embeds: [createErrorEmbed("Você não tem família!")], ephemeral: true });

        const embed = createEmbed({
            title: `🏰 Painel da Família: ${userFamily.name}`,
            description: `Gerencie sua família com facilidade.\nCargo: <@&${userFamily.roleId || "Nenhum"}>\nSaldo: **${userFamily.bank || 0} 🪙**`,
            color: 0x9B59B6
        });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("family_btn_info").setLabel("Info").setStyle(ButtonStyle.Primary).setEmoji("ℹ️"),
            new ButtonBuilder().setCustomId("family_btn_members").setLabel("Membros").setStyle(ButtonStyle.Secondary).setEmoji("👥"),
            new ButtonBuilder().setCustomId("family_btn_bank").setLabel("Banco").setStyle(ButtonStyle.Success).setEmoji("🏦"),
            new ButtonBuilder().setCustomId("family_btn_upgrade").setLabel("Upgrade").setStyle(ButtonStyle.Success).setEmoji("⬆️")
        );
        
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("family_btn_invite_menu").setLabel("Convidar").setStyle(ButtonStyle.Primary).setEmoji("📩"),
            new ButtonBuilder().setCustomId("family_btn_leave").setLabel("Sair").setStyle(ButtonStyle.Danger).setEmoji("🚪")
        );

        await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
        return;
    }

    // BANK GROUP
    if (group === "bank") {
        if (!userFamily) return interaction.reply({ embeds: [createErrorEmbed("Você não tem família!")], ephemeral: true });

        if (sub === "balance") {
            await interaction.reply({ embeds: [createEmbed({ 
                title: `🏦 Banco da Família ${userFamily.name}`,
                description: `Saldo: **${userFamily.bank || 0} 🪙**`,
                color: 0xF1C40F
            })] });
        }

        if (sub === "deposit") {
            const amount = interaction.options.getInteger("quantia");
            const balance = await economyService.getBalance(userId);
            
            if ((balance.coins || 0) < amount) {
                return interaction.reply({ embeds: [createErrorEmbed(`Você não tem **${amount} 🪙**.`)] });
            }

            await economyService.removeCoins(userId, amount);
            userFamily.bank = (userFamily.bank || 0) + amount;
            await familyStore.save(families);

            await interaction.reply({ embeds: [createSuccessEmbed(`Você depositou **${amount} 🪙** no cofre da família.`)] });
        }

        if (sub === "withdraw") {
            const isOwner = userFamily.ownerId === userId;
            const isAdmin = userFamily.admins && userFamily.admins.includes(userId);
            
            if (!isOwner && !isAdmin) {
                return interaction.reply({ embeds: [createErrorEmbed("Apenas Dono e Admins podem sacar.")] });
            }

            const amount = interaction.options.getInteger("quantia");
            if ((userFamily.bank || 0) < amount) {
                return interaction.reply({ embeds: [createErrorEmbed(`A família não tem **${amount} 🪙** (Saldo: ${userFamily.bank || 0}).`)] });
            }

            userFamily.bank -= amount;
            await familyStore.save(families);
            await economyService.addCoins(userId, amount);

            await interaction.reply({ embeds: [createSuccessEmbed(`Você sacou **${amount} 🪙** do cofre da família.`)] });
        }
        return;
    }

    // UPGRADE
    if (sub === "upgrade") {
        if (!userFamily) return interaction.reply({ embeds: [createErrorEmbed("Você não tem família!")], ephemeral: true });
        
        const isOwner = userFamily.ownerId === userId;
        const isAdmin = userFamily.admins && userFamily.admins.includes(userId);
        
        if (!isOwner && !isAdmin) {
             return interaction.reply({ embeds: [createErrorEmbed("Apenas Dono e Admins podem comprar upgrades.")] });
        }

        const boughtSlots = userFamily.boughtSlots || 0;
        const nextSlot = boughtSlots + 1;
        const cost = nextSlot * 5000;

        if ((userFamily.bank || 0) < cost) {
            return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente no banco da família!\nCusto do próximo slot: **${cost} 🪙**\nSaldo atual: **${userFamily.bank || 0} 🪙**`)] });
        }

        userFamily.bank -= cost;
        userFamily.boughtSlots = nextSlot;
        await familyStore.save(families);

        await interaction.reply({ embeds: [createSuccessEmbed(`Upgrade realizado! A família agora tem **+${nextSlot}** slots extras de membro.\nCusto: **${cost} 🪙**`)] });
        return;
    }

    // Helper: Buscar família do usuário (dono)
    const myFamily = Object.values(families).find(f => f.ownerId === userId);
    
    // CONFIG GROUP
    if (group === "config") {
        if (!myFamily) return interaction.reply({ embeds: [createErrorEmbed("Você não é dono de uma família!")], ephemeral: true });

        if (sub === "rename") {
            const newName = interaction.options.getString("novo_nome");
            myFamily.name = newName;
            await familyStore.save(families);

            // Renomear cargo
            const guild = interaction.guild;
            if (myFamily.roleId) {
                const role = await guild.roles.fetch(myFamily.roleId).catch(() => null);
                if (role) await role.setName(`Família ${newName}`).catch(() => {});
            }

            // Renomear canais (se tiver)
            if (myFamily.textChannelId) {
                const channel = await guild.channels.fetch(myFamily.textChannelId).catch(() => null);
                if (channel) await channel.setName(`🏰・${newName}`).catch(() => {});
            }
            if (myFamily.voiceChannelId) {
                const channel = await guild.channels.fetch(myFamily.voiceChannelId).catch(() => null);
                if (channel) await channel.setName(`🔊・${newName}`).catch(() => {});
            }

            await interaction.reply({ embeds: [createSuccessEmbed(`Família renomeada para **${newName}**!`)] });
        }

        if (sub === "color") {
            const color = interaction.options.getString("cor");
            if (!/^#[0-9A-F]{6}$/i.test(color)) {
                return interaction.reply({ embeds: [createErrorEmbed("Cor inválida! Use formato HEX (ex: #FF0000)")], ephemeral: true });
            }

            const guild = interaction.guild;
            if (myFamily.roleId) {
                const role = await guild.roles.fetch(myFamily.roleId).catch(() => null);
                if (role) await role.setColor(color).catch(() => {});
            }
            
            myFamily.color = color;
            await familyStore.save(families);

            await interaction.reply({ embeds: [createSuccessEmbed(`Cor da família atualizada para **${color}**!`)] });
        }

        if (sub === "decorate") {
             const templates = [
                { label: "✨ • {nome}", value: "✨・{nome}", description: "Estilo Brilho" },
                { label: "🏰 | {nome}", value: "🏰 | {nome}", description: "Estilo Castelo" },
                { label: "⚔️ {nome} ⚔️", value: "⚔️ {nome} ⚔️", description: "Estilo Guerreiro" },
                { label: "🐲 {nome}", value: "🐲 {nome}", description: "Estilo Dragão" },
                { label: "💎 {nome}", value: "💎 {nome}", description: "Estilo Diamante" }
            ];

            const options = templates.map(t => 
                new StringSelectMenuOptionBuilder()
                    .setLabel(t.label.replace("{nome}", "Nome"))
                    .setValue(t.value)
                    .setDescription(t.description)
            );

            const select = new StringSelectMenuBuilder()
                .setCustomId("family_decorate")
                .setPlaceholder("Escolha um estilo para os canais")
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(select);

            await interaction.reply({
                content: "Escolha um estilo para os canais da família:",
                components: [row],
                ephemeral: true
            });
            // Local collector removed, using global handleSelectMenu
        }
        return;
    }

    // LIST
    if (sub === "list") {
        const sorted = Object.values(families).sort((a, b) => b.members.length - a.members.length).slice(0, 10);
        
        const description = sorted.map((f, i) => {
            return `**${i + 1}. ${f.name}** - ${f.members.length} membros (Dono: <@${f.ownerId}>)`;
        }).join("\n");

        await interaction.reply({ 
            embeds: [createEmbed({
                title: "🏆 Top Famílias",
                description: description || "Nenhuma família encontrada.",
                color: 0xF1C40F
            })] 
        });
        return;
    }

    // PROMOTE
    if (sub === "promote") {
        if (!myFamily) return interaction.reply({ embeds: [createErrorEmbed("Você não é dono de uma família!")], ephemeral: true });
        
        const target = interaction.options.getUser("usuario");
        if (!myFamily.members.includes(target.id)) {
            return interaction.reply({ embeds: [createErrorEmbed("Usuário não está na família.")], ephemeral: true });
        }
        if (target.id === userId) return interaction.reply({ embeds: [createErrorEmbed("Você já é o dono.")], ephemeral: true });

        if (!myFamily.admins) myFamily.admins = [];
        if (myFamily.admins.includes(target.id)) {
            return interaction.reply({ embeds: [createErrorEmbed("Usuário já é admin.")], ephemeral: true });
        }

        myFamily.admins.push(target.id);
        await familyStore.save(families);
        
        await interaction.reply({ embeds: [createSuccessEmbed(`${target} foi promovido a admin da família!`)] });
        return;
    }

    // DEMOTE
    if (sub === "demote") {
        if (!myFamily) return interaction.reply({ embeds: [createErrorEmbed("Você não é dono de uma família!")], ephemeral: true });
        
        const target = interaction.options.getUser("usuario");
        if (!myFamily.admins || !myFamily.admins.includes(target.id)) {
            return interaction.reply({ embeds: [createErrorEmbed("Usuário não é admin.")], ephemeral: true });
        }

        myFamily.admins = myFamily.admins.filter(id => id !== target.id);
        await familyStore.save(families);
        
        await interaction.reply({ embeds: [createSuccessEmbed(`${target} foi rebaixado para membro.`)] });
        return;
    }

    // TRANSFER
    if (sub === "transfer") {
        if (!myFamily) return interaction.reply({ embeds: [createErrorEmbed("Você não é dono de uma família!")], ephemeral: true });

        const newOwner = interaction.options.getUser("novo_lider");
        
        if (!myFamily.members.includes(newOwner.id)) {
            return interaction.reply({ embeds: [createErrorEmbed("O novo líder precisa ser membro da família!")], ephemeral: true });
        }

        if (newOwner.id === userId) {
            return interaction.reply({ embeds: [createErrorEmbed("Você já é o líder!")], ephemeral: true });
        }

        myFamily.ownerId = newOwner.id;
        await familyStore.save(families);

        await interaction.reply({ embeds: [createSuccessEmbed(`Liderança transferida para ${newOwner}!`)] });
        return;
    }
    
    // CREATE
    if (sub === "create") {
        const vipConfig = interaction.client.services.vipConfig;
        const tier = await vipConfig.getMemberTier(interaction.member);

        if (!tier || !tier.limits?.allowFamily) {
            return interaction.reply({ embeds: [createErrorEmbed("Seu nível VIP não permite criar famílias ou você não é VIP.")], ephemeral: true });
        }

        if (Object.values(families).some(f => f.ownerId === userId)) {
            return interaction.reply({ embeds: [createErrorEmbed("Você já é dono de uma família!")], ephemeral: true });
        }

        const name = interaction.options.getString("nome");
        const familyId = `fam_${Date.now()}`;
        
        // Criar canais (se configurado categoria)
        const vipService = interaction.client.services.vip;
        const guildConfig = vipService.getGuildConfig(guildId);
        let textChannelId = null;
        let voiceChannelId = null;
        let roleId = null;

        const guild = interaction.guild;

        // 1. Criar Cargo da Família
        try {
            const role = await guild.roles.create({
                name: `Família ${name}`,
                color: 0x9B59B6, // Roxo
                reason: `Família criada por ${interaction.user.tag}`
            });
            roleId = role.id;
            
            // Dá o cargo pro dono
            await interaction.member.roles.add(role);
        } catch (e) {
            return interaction.reply({ embeds: [createErrorEmbed("Erro ao criar cargo da família. Verifique minhas permissões.")], ephemeral: true });
        }

        // 2. Criar Canais vinculados ao Cargo
        if (guildConfig?.vipCategoryId) {
            try {
                const text = await guild.channels.create({
                    name: `🏰・${name}`,
                    type: ChannelType.GuildText,
                    parent: guildConfig.vipCategoryId,
                    topic: `Família de ${interaction.user.tag}`,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                        { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] }
                    ]
                });
                textChannelId = text.id;
                
                const voice = await guild.channels.create({
                    name: `🔊・${name}`,
                    type: ChannelType.GuildVoice,
                    parent: guildConfig.vipCategoryId,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
                        { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] }
                    ]
                });
                voiceChannelId = voice.id;
            } catch (e) {
                // Falha ao criar canais
            }
        }

        families[familyId] = {
            id: familyId,
            name,
            ownerId: userId,
            members: [userId],
            textChannelId,
            voiceChannelId,
            roleId, // Salva o ID do cargo
            createdAt: Date.now()
        };

        await familyStore.save(families);
        
        // Log
        if (interaction.client.services.log) {
            await interaction.client.services.log.log(guild, {
                title: "🏰 Família Criada",
                description: `**${name}** foi criada por ${interaction.user}.`,
                color: 0x9B59B6,
                user: interaction.user
            });
        }

        await interaction.reply({ 
            embeds: [createSuccessEmbed(`Família **${name}** criada com sucesso!\nCargo: <@&${roleId}>`)] 
        });
    }

    // DELETE
    if (sub === "delete") {
        if (!myFamily) return interaction.reply({ embeds: [createErrorEmbed("Você não é dono de uma família!")], ephemeral: true });

        const guild = interaction.guild;
        const familyName = myFamily.name;
        
        // Deletar canais
        if (myFamily.textChannelId) {
            const channel = await guild.channels.fetch(myFamily.textChannelId).catch(() => null);
            if (channel) await channel.delete().catch(() => {});
        }
        if (myFamily.voiceChannelId) {
            const channel = await guild.channels.fetch(myFamily.voiceChannelId).catch(() => null);
            if (channel) await channel.delete().catch(() => {});
        }

        // Deletar cargo
        if (myFamily.roleId) {
            const role = await guild.roles.fetch(myFamily.roleId).catch(() => null);
            if (role) await role.delete().catch(() => {});
        }

        delete families[myFamily.id];
        await familyStore.save(families);
        
        // Log
        if (interaction.client.services.log) {
            await interaction.client.services.log.log(guild, {
                title: "🏰 Família Deletada",
                description: `**${familyName}** foi deletada por ${interaction.user}.`,
                color: 0xFF0000,
                user: interaction.user
            });
        }

        await interaction.reply({ embeds: [createSuccessEmbed("Sua família foi excluída com sucesso.")] });
    }

    // KICK
    if (sub === "kick") {
        const family = Object.values(families).find(f => f.ownerId === userId || (f.admins && f.admins.includes(userId)));
        if (!family) return interaction.reply({ embeds: [createErrorEmbed("Você não tem permissão para expulsar!")], ephemeral: true });

        const target = interaction.options.getUser("usuario");
        
        if (!family.members.includes(target.id)) {
            return interaction.reply({ embeds: [createErrorEmbed("Esse usuário não está na sua família!")], ephemeral: true });
        }

        if (target.id === userId) {
            return interaction.reply({ embeds: [createErrorEmbed("Você não pode se expulsar!")], ephemeral: true });
        }
        
        if (target.id === family.ownerId) {
            return interaction.reply({ embeds: [createErrorEmbed("Você não pode expulsar o dono!")], ephemeral: true });
        }
        
        // Admin não pode expulsar outro admin (só dono pode)
        if (family.admins && family.admins.includes(target.id) && family.ownerId !== userId) {
            return interaction.reply({ embeds: [createErrorEmbed("Você não pode expulsar outro admin!")], ephemeral: true });
        }

        family.members = family.members.filter(id => id !== target.id);
        if (family.admins) family.admins = family.admins.filter(id => id !== target.id); // Remove de admin também se for kickado (pelo dono)
        
        await familyStore.save(families);

        // Remover cargo
        const guild = interaction.guild;
        if (family.roleId) {
            const member = await guild.members.fetch(target.id).catch(() => null);
            if (member) await member.roles.remove(family.roleId).catch(() => {});
        }
        
        // Se não tiver cargo, remove permissões dos canais
        if (!family.roleId) {
             if (family.textChannelId) {
                 const channel = await guild.channels.fetch(family.textChannelId).catch(() => null);
                 if (channel) await channel.permissionOverwrites.delete(target.id).catch(() => {});
             }
             if (family.voiceChannelId) {
                 const channel = await guild.channels.fetch(family.voiceChannelId).catch(() => null);
                 if (channel) await channel.permissionOverwrites.delete(target.id).catch(() => {});
             }
        }

        await interaction.reply({ embeds: [createSuccessEmbed(`${target} foi removido da família.`)] });
    }

    // LEAVE
    if (sub === "leave") {
        // Busca família onde é membro (mas não dono)
        const family = Object.values(families).find(f => f.members.includes(userId) && f.ownerId !== userId);
        
        if (!family) {
            // Se for dono, avisa que tem que deletar ou transferir
            if (myFamily) return interaction.reply({ embeds: [createErrorEmbed("Você é o dono! Transfira a liderança ou delete a família.")], ephemeral: true });
            return interaction.reply({ embeds: [createErrorEmbed("Você não está em nenhuma família.")], ephemeral: true });
        }

        family.members = family.members.filter(id => id !== userId);
        await familyStore.save(families);

        const guild = interaction.guild;
        if (family.roleId) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) await member.roles.remove(family.roleId).catch(() => {});
        }
        
        // Fallback permissions
        if (!family.roleId) {
             if (family.textChannelId) {
                 const channel = await guild.channels.fetch(family.textChannelId).catch(() => null);
                 if (channel) await channel.permissionOverwrites.delete(userId).catch(() => {});
             }
             if (family.voiceChannelId) {
                 const channel = await guild.channels.fetch(family.voiceChannelId).catch(() => null);
                 if (channel) await channel.permissionOverwrites.delete(userId).catch(() => {});
             }
        }

        await interaction.reply({ embeds: [createSuccessEmbed(`Você saiu da família **${family.name}**. `)] });
    }

    // INVITE
    if (sub === "invite") {
        const family = Object.values(families).find(f => f.ownerId === userId || (f.admins && f.admins.includes(userId)));
        if (!family) {
            return interaction.reply({ embeds: [createErrorEmbed("Você não tem permissão para convidar (não é dono nem admin de família)!")], ephemeral: true });
        }

        // Checar limite de membros do Tier do Dono
        // Precisamos buscar o dono para checar o tier DELE, não do admin que está convidando
        const ownerMember = await interaction.guild.members.fetch(family.ownerId).catch(() => null);
        const vipConfig = interaction.client.services.vipConfig;
        
        let limit = 3;
        if (ownerMember) {
            const tier = await vipConfig.getMemberTier(ownerMember);
            limit = tier?.limits?.familyMembers || 3;
        }
        
        // Adiciona slots comprados via upgrade
        limit += (family.boughtSlots || 0);

        if (family.members.length >= limit) {
             return interaction.reply({ embeds: [createErrorEmbed(`A família atingiu o limite de **${limit}** membros.`)], ephemeral: true });
        }

        const target = interaction.options.getUser("usuario");
        const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);

        if (!targetMember) return interaction.reply({ embeds: [createErrorEmbed("Usuário não encontrado.")], ephemeral: true });

        if (family.members.includes(target.id)) {
            return interaction.reply({ embeds: [createErrorEmbed("Esse usuário já está na família!")], ephemeral: true });
        }

        // Adicionar membro
        family.members.push(target.id);
        await familyStore.save(families);

        // Dar cargo da família
        if (family.roleId) {
            await targetMember.roles.add(family.roleId).catch(() => {});
        }
        
        // Permissões nos canais
        if (!family.roleId) {
             const guild = interaction.guild;
             if (family.textChannelId) {
                 const channel = await guild.channels.fetch(family.textChannelId).catch(() => null);
                 if (channel) await channel.permissionOverwrites.edit(target.id, { [PermissionFlagsBits.ViewChannel]: true, [PermissionFlagsBits.SendMessages]: true });
             }
             if (family.voiceChannelId) {
                 const channel = await guild.channels.fetch(family.voiceChannelId).catch(() => null);
                 if (channel) await channel.permissionOverwrites.edit(target.id, { [PermissionFlagsBits.ViewChannel]: true, [PermissionFlagsBits.Connect]: true });
             }
        }

        await interaction.reply({ 
            embeds: [createSuccessEmbed(`${target} foi adicionado à família **${family.name}**!`)] 
        });
    }

    // INFO
    if (sub === "info") {
        // Busca família onde o usuário é membro
        const family = Object.values(families).find(f => f.members.includes(userId));
        
        if (!family) {
            return interaction.reply({ embeds: [createErrorEmbed("Você não pertence a nenhuma família.")], ephemeral: true });
        }

        const owner = await interaction.client.users.fetch(family.ownerId).catch(() => ({ tag: "Desconhecido" }));
        
        const admins = family.admins && family.admins.length > 0 
            ? family.admins.map(id => `<@${id}>`).join(", ") 
            : "Nenhum";

        await interaction.reply({
            embeds: [createEmbed({
                title: `🏰 Família ${family.name}`,
                fields: [
                    { name: "Dono", value: `${owner.tag}`, inline: true },
                    { name: "Admins", value: admins, inline: true },
                    { name: "Membros", value: `${family.members.length}`, inline: true },
                    { name: "Criada em", value: `<t:${Math.floor(family.createdAt / 1000)}:d>`, inline: true },
                    { name: "Canais", value: `${family.textChannelId ? `<#${family.textChannelId}>` : "Nenhum"} | ${family.voiceChannelId ? `<#${family.voiceChannelId}>` : "Nenhum"}` }
                ],
                color: 0x9B59B6 // Purple
            })]
        });
    }
  },

  async handleSelectMenu(interaction) {
      if (interaction.customId === "family_decorate") {
          const families = await familyStore.load();
          const userId = interaction.user.id;
          const myFamily = Object.values(families).find(f => f.ownerId === userId);

          if (!myFamily) {
              return interaction.reply({ embeds: [createErrorEmbed("Você não é dono de uma família!")], ephemeral: true });
          }

          const template = interaction.values[0];
          const baseName = myFamily.name;
          const newName = template.replace("{nome}", baseName);
          
          const guild = interaction.guild;
          if (myFamily.textChannelId) {
              const channel = await guild.channels.fetch(myFamily.textChannelId).catch(() => null);
              if (channel) await channel.setName(newName.toLowerCase().replace(/\s+/g, '-')).catch(() => {});
          }
          if (myFamily.voiceChannelId) {
              const channel = await guild.channels.fetch(myFamily.voiceChannelId).catch(() => null);
              if (channel) await channel.setName(newName).catch(() => {});
          }

          await interaction.update({ content: `Estilo aplicado! Canais atualizados para: **${newName}**`, components: [] });
      }

      // Invite User Selection
      if (interaction.customId === "family_invite_select") {
          const targetId = interaction.values[0];
          // Call invite logic (similar to command)
          // Need to reuse invite logic. For now, just reply with instruction.
          // Or duplicate logic? Let's duplicate carefully or refactor.
          // Duplication is safer for now.
          
          const families = await familyStore.load();
          const userId = interaction.user.id;
          const family = Object.values(families).find(f => f.ownerId === userId || (f.admins && f.admins.includes(userId)));
          
          if (!family) {
              return interaction.reply({ embeds: [createErrorEmbed("Você não tem permissão para convidar!")], ephemeral: true });
          }
          
          // Checar limite de membros
          const ownerMember = await interaction.guild.members.fetch(family.ownerId).catch(() => null);
          const vipConfig = interaction.client.services.vipConfig;
          
          let limit = 3;
          if (ownerMember) {
              const tier = await vipConfig.getMemberTier(ownerMember);
              limit = tier?.limits?.familyMembers || 3;
          }
          limit += (family.boughtSlots || 0);
  
          if (family.members.length >= limit) {
               return interaction.reply({ embeds: [createErrorEmbed(`A família atingiu o limite de **${limit}** membros.`)], ephemeral: true });
          }

          if (family.members.includes(targetId)) {
               return interaction.reply({ embeds: [createErrorEmbed("Usuário já na família.")], ephemeral: true });
          }
          
          if (targetId === userId) {
              return interaction.reply({ embeds: [createErrorEmbed("Você não pode convidar a si mesmo.")], ephemeral: true });
          }

          const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
          if (!targetMember) return interaction.reply({ embeds: [createErrorEmbed("Usuário não encontrado.")], ephemeral: true });
          
          if (targetMember.user.bot) {
              return interaction.reply({ embeds: [createErrorEmbed("Você não pode convidar bots.")], ephemeral: true });
          }
          
          family.members.push(targetId);
          await familyStore.save(families);
          
          if (family.roleId) {
              await targetMember.roles.add(family.roleId).catch(() => {});
          }

          await interaction.reply({ embeds: [createSuccessEmbed(`<@${targetId}> convidado com sucesso!`)] });
      }
  },

  async handleButton(interaction) {
      if (!interaction.customId.startsWith("family_btn_")) return;
      
      const families = await familyStore.load();
      const userId = interaction.user.id;
      const userFamily = Object.values(families).find(f => f.members.includes(userId));

      if (!userFamily) {
          return interaction.reply({ embeds: [createErrorEmbed("Você não tem família!")], ephemeral: true });
      }

      if (interaction.customId === "family_btn_info") {
        const owner = await interaction.client.users.fetch(userFamily.ownerId).catch(() => ({ tag: "Desconhecido" }));
        const admins = userFamily.admins && userFamily.admins.length > 0 
            ? userFamily.admins.map(id => `<@${id}>`).join(", ") 
            : "Nenhum";

        await interaction.reply({
            embeds: [createEmbed({
                title: `🏰 Família ${userFamily.name}`,
                fields: [
                    { name: "Dono", value: `${owner.tag}`, inline: true },
                    { name: "Admins", value: admins, inline: true },
                    { name: "Membros", value: `${userFamily.members.length}`, inline: true },
                    { name: "Criada em", value: `<t:${Math.floor(userFamily.createdAt / 1000)}:d>`, inline: true },
                    { name: "Banco", value: `${userFamily.bank || 0} 🪙`, inline: true }
                ],
                color: 0x9B59B6
            })],
            ephemeral: true
        });
      }

      if (interaction.customId === "family_btn_members") {
          const members = userFamily.members.map(id => `<@${id}>`).join("\n");
          await interaction.reply({
              embeds: [createEmbed({
                  title: `👥 Membros de ${userFamily.name}`,
                  description: members || "Nenhum membro.",
                  color: 0x9B59B6
              })],
              ephemeral: true
          });
      }

      if (interaction.customId === "family_btn_bank") {
          const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("family_btn_deposit_modal").setLabel("Depositar").setStyle(ButtonStyle.Success).setEmoji("💰"),
              new ButtonBuilder().setCustomId("family_btn_withdraw_modal").setLabel("Sacar").setStyle(ButtonStyle.Danger).setEmoji("💸")
          );

          await interaction.reply({
              content: `💰 **Banco da Família**\nSaldo atual: **${userFamily.bank || 0} 🪙**`,
              components: [row],
              ephemeral: true
          });
      }

      if (interaction.customId === "family_btn_upgrade") {
          const boughtSlots = userFamily.boughtSlots || 0;
          const nextSlot = boughtSlots + 1;
          const cost = nextSlot * 5000;
          
          const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                  .setCustomId("family_btn_upgrade_confirm")
                  .setLabel(`Comprar Slot (${cost} 🪙)`)
                  .setStyle(ButtonStyle.Success)
                  .setEmoji("🛒")
          );

          await interaction.reply({
              content: `**Upgrade de Família**\nSlots extras atuais: ${boughtSlots}\nPróximo slot custa: **${cost} 🪙**\nSaldo do banco: **${userFamily.bank || 0} 🪙**`,
              components: [row],
              ephemeral: true
          });
      }

      if (interaction.customId === "family_btn_upgrade_confirm") {
          const isOwner = userFamily.ownerId === userId;
          const isAdmin = userFamily.admins && userFamily.admins.includes(userId);
          
          if (!isOwner && !isAdmin) {
               return interaction.reply({ embeds: [createErrorEmbed("Apenas Dono e Admins podem comprar upgrades.")], ephemeral: true });
          }
  
          const boughtSlots = userFamily.boughtSlots || 0;
          const nextSlot = boughtSlots + 1;
          const cost = nextSlot * 5000;
  
          if ((userFamily.bank || 0) < cost) {
              return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente no banco da família!\nCusto: **${cost} 🪙**\nSaldo: **${userFamily.bank || 0} 🪙**`)] });
          }
  
          userFamily.bank -= cost;
          userFamily.boughtSlots = nextSlot;
          await familyStore.save(families);
  
          await interaction.reply({ embeds: [createSuccessEmbed(`Upgrade realizado! A família agora tem **+${nextSlot}** slots extras de membro.\nNovo Saldo: **${userFamily.bank} 🪙**`)] });
      }
      
      if (interaction.customId === "family_btn_invite_menu") {
          // Show User Select Menu
          const userSelect = new UserSelectMenuBuilder()
              .setCustomId("family_invite_select")
              .setPlaceholder("Selecione um usuário para convidar")
              .setMaxValues(1);

          const row = new ActionRowBuilder().addComponents(userSelect);

          await interaction.reply({
              content: "Quem você deseja convidar?",
              components: [row],
              ephemeral: true
          });
      }
      
      if (interaction.customId === "family_btn_leave") {
          // Confirm leave? Just execute leave logic.
          // Reuse leave logic logic
           if (userFamily.ownerId === userId) {
               return interaction.reply({ embeds: [createErrorEmbed("Você é o dono! Use `/family delete` ou `/family transfer`.")], ephemeral: true });
           }
           
           userFamily.members = userFamily.members.filter(id => id !== userId);
           await familyStore.save(families);
           
           // Remove roles... (Simplified)
           const guild = interaction.guild;
           if (userFamily.roleId) {
               const member = await guild.members.fetch(userId).catch(() => null);
               if (member) await member.roles.remove(userFamily.roleId).catch(() => {});
           }
           
           await interaction.reply({ embeds: [createSuccessEmbed(`Você saiu da família **${userFamily.name}**.`)] });
      }

      // SUB-BUTTONS (Modals)
      if (interaction.customId === "family_btn_deposit_modal") {
          const modal = new ModalBuilder().setCustomId("family_deposit_modal").setTitle("Depositar no Banco");
          const input = new TextInputBuilder().setCustomId("amount").setLabel("Quantia").setStyle(TextInputStyle.Short).setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
          await interaction.showModal(modal);
      }
      
      if (interaction.customId === "family_btn_withdraw_modal") {
          const modal = new ModalBuilder().setCustomId("family_withdraw_modal").setTitle("Sacar do Banco");
          const input = new TextInputBuilder().setCustomId("amount").setLabel("Quantia").setStyle(TextInputStyle.Short).setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
          await interaction.showModal(modal);
      }
  },

  async handleModal(interaction) {
      if (interaction.customId === "family_deposit_modal" || interaction.customId === "family_withdraw_modal") {
          const amount = parseInt(interaction.fields.getTextInputValue("amount"));
          if (isNaN(amount) || amount <= 0) {
              return interaction.reply({ embeds: [createErrorEmbed("Quantia inválida.")], ephemeral: true });
          }

          const families = await familyStore.load();
          const userId = interaction.user.id;
          const userFamily = Object.values(families).find(f => f.members.includes(userId));
          
          if (!userFamily) return interaction.reply({ embeds: [createErrorEmbed("Você não tem família!")], ephemeral: true });
          const economyService = interaction.client.services.economy;

          if (interaction.customId === "family_deposit_modal") {
              const balance = await economyService.getBalance(userId);
              if ((balance.coins || 0) < amount) {
                  return interaction.reply({ embeds: [createErrorEmbed("Saldo insuficiente na carteira.")], ephemeral: true });
              }
              
              await economyService.removeCoins(userId, amount);
              userFamily.bank = (userFamily.bank || 0) + amount;
              await familyStore.save(families);
              
              await interaction.reply({ embeds: [createSuccessEmbed(`Depositado **${amount} 🪙** com sucesso!`)] });
          }
          
          if (interaction.customId === "family_withdraw_modal") {
              const isOwner = userFamily.ownerId === userId;
              const isAdmin = userFamily.admins && userFamily.admins.includes(userId);
              if (!isOwner && !isAdmin) return interaction.reply({ embeds: [createErrorEmbed("Apenas admins podem sacar.")], ephemeral: true });
              
              if ((userFamily.bank || 0) < amount) {
                  return interaction.reply({ embeds: [createErrorEmbed("Saldo insuficiente no banco.")], ephemeral: true });
              }
              
              userFamily.bank -= amount;
              await familyStore.save(families);
              await economyService.addCoins(userId, amount);
              
              await interaction.reply({ embeds: [createSuccessEmbed(`Sacado **${amount} 🪙** com sucesso!`)] });
          }
      }
  }
};
