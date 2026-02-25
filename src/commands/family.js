const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

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
    const userId = interaction.user.id;
    const guild = interaction.guild;
    
    const familyService = interaction.client.services.family;
    const economyService = interaction.client.services.economy;
    const vipConfigService = interaction.client.services.vipConfig;
    const vipService = interaction.client.services.vip;

    try {
        // PANEL
        if (sub === "panel") {
            const userFamily = await familyService.getFamilyByMember(userId);
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
            const userFamily = await familyService.getFamilyByMember(userId);
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
                await familyService.deposit(userId, amount, economyService);
                await interaction.reply({ embeds: [createSuccessEmbed(`Você depositou **${amount} 🪙** no cofre da família.`)] });
            }

            if (sub === "withdraw") {
                const amount = interaction.options.getInteger("quantia");
                await familyService.withdraw(userId, amount, economyService);
                await interaction.reply({ embeds: [createSuccessEmbed(`Você sacou **${amount} 🪙** do cofre da família.`)] });
            }
            return;
        }

        // UPGRADE
        if (sub === "upgrade") {
            const nextSlot = await familyService.upgradeSlots(userId);
            await interaction.reply({ embeds: [createSuccessEmbed(`Upgrade realizado! A família agora tem **+${nextSlot}** slots extras de membro.`)] });
            return;
        }

        // CONFIG GROUP
        if (group === "config") {
            if (sub === "rename") {
                const newName = interaction.options.getString("novo_nome");
                await familyService.renameFamily(guild, userId, newName);
                await interaction.reply({ embeds: [createSuccessEmbed(`Família renomeada para **${newName}**!`)] });
            }

            if (sub === "color") {
                const color = interaction.options.getString("cor");
                if (!/^#[0-9A-F]{6}$/i.test(color)) {
                    return interaction.reply({ embeds: [createErrorEmbed("Cor inválida! Use formato HEX (ex: #FF0000)")], ephemeral: true });
                }
                await familyService.setFamilyColor(guild, userId, color);
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
            }
            return;
        }

        // LIST
        if (sub === "list") {
            const families = await familyService.getAllFamilies();
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
            const target = interaction.options.getUser("usuario");
            await familyService.promoteMember(userId, target.id);
            await interaction.reply({ embeds: [createSuccessEmbed(`${target} foi promovido a admin da família!`)] });
            return;
        }

        // DEMOTE
        if (sub === "demote") {
            const target = interaction.options.getUser("usuario");
            await familyService.demoteMember(userId, target.id);
            await interaction.reply({ embeds: [createSuccessEmbed(`${target} foi rebaixado para membro.`)] });
            return;
        }

        // TRANSFER
        if (sub === "transfer") {
            const newOwner = interaction.options.getUser("novo_lider");
            await familyService.transferOwnership(userId, newOwner.id);
            await interaction.reply({ embeds: [createSuccessEmbed(`Liderança transferida para ${newOwner}!`)] });
            return;
        }
        
        // CREATE
        if (sub === "create") {
            const name = interaction.options.getString("nome");
            const tier = await vipConfigService.getMemberTier(interaction.member);
            if (!tier || !tier.limits?.allowFamily) {
              throw new Error("Seu nível VIP não permite criar famílias ou você não é VIP.");
            }
            const family = await familyService.createFamilyFull(guild, interaction.member, name, vipService);
            
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
                embeds: [createSuccessEmbed(`Família **${name}** criada com sucesso!\nCargo: <@&${family.roleId}>`)] 
            });
            return;
        }

        // DELETE
        if (sub === "delete") {
            const family = await familyService.getFamilyByOwner(userId);
            if (!family) throw new Error("Você não é dono de uma família.");
            const familyName = family.name;

            await familyService.deleteFamily(guild, userId);
            
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
            return;
        }

        // KICK
        if (sub === "kick") {
            const target = interaction.options.getUser("usuario");
            const families = await familyService.getAllFamilies();
            const userFamily = Object.values(families).find(f => f.ownerId === userId || (f.admins && f.admins.includes(userId)));
            
            if (!userFamily) throw new Error("Você não tem permissão para expulsar!");
            
            // 2. Validate Target
            if (!userFamily.members.includes(target.id)) throw new Error("Usuário não está na família.");
            if (target.id === userId) throw new Error("Você não pode se expulsar!");
            if (target.id === userFamily.ownerId) throw new Error("Não pode expulsar o dono.");
            if (userFamily.admins?.includes(target.id) && userFamily.ownerId !== userId) throw new Error("Admin não pode expulsar admin.");

            await familyService.removeMember(guild, userFamily.id, target.id);
            await interaction.reply({ embeds: [createSuccessEmbed(`${target} foi removido da família.`)] });
            return;
        }

        // LEAVE
        if (sub === "leave") {
            const family = await familyService.getFamilyByMember(userId);
            if (!family) throw new Error("Você não está em nenhuma família.");
            if (family.ownerId === userId) throw new Error("Dono não pode sair. Delete ou transfira.");

            await familyService.removeMember(guild, family.id, userId);
            await interaction.reply({ embeds: [createSuccessEmbed(`Você saiu da família **${family.name}**. `)] });
            return;
        }

        // INVITE
        if (sub === "invite") {
            const families = await familyService.getAllFamilies();
            const family = Object.values(families).find(f => f.ownerId === userId || (f.admins && f.admins.includes(userId)));
            if (!family) throw new Error("Você não tem permissão para convidar!");

            const target = interaction.options.getUser("usuario");
            const targetMember = await guild.members.fetch(target.id).catch(() => null);
            if (!targetMember) throw new Error("Usuário não encontrado.");
            if (targetMember.user.bot) throw new Error("Não pode convidar bots.");

            await familyService.addMember(guild, family.id, targetMember, vipConfigService);
            await interaction.reply({ 
                embeds: [createSuccessEmbed(`${target} foi adicionado à família **${family.name}**!`)] 
            });
            return;
        }

        // INFO
        if (sub === "info") {
            const family = await familyService.getFamilyByMember(userId);
            if (!family) throw new Error("Você não pertence a nenhuma família.");

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
                    color: 0x9B59B6
                })]
            });
            return;
        }

    } catch (error) {
        if (interaction.replied || interaction.deferred) {
             await interaction.followUp({ embeds: [createErrorEmbed(error.message)], ephemeral: true });
        } else {
             await interaction.reply({ embeds: [createErrorEmbed(error.message)], ephemeral: true });
        }
    }
  },

  async handleSelectMenu(interaction) {
      const familyService = interaction.client.services.family;
      const vipConfigService = interaction.client.services.vipConfig;
      const userId = interaction.user.id;
      const guild = interaction.guild;

      try {
          if (interaction.customId === "family_decorate") {
              const template = interaction.values[0];
              await familyService.decorateChannels(guild, userId, template);
              await interaction.update({ content: "Estilo aplicado!", components: [] });
          }

          if (interaction.customId === "family_invite_select") {
              const targetId = interaction.values[0];
              
              const families = await familyService.getAllFamilies();
              const family = Object.values(families).find(f => f.ownerId === userId || (f.admins && f.admins.includes(userId)));
              if (!family) throw new Error("Permissão negada.");

              const targetMember = await guild.members.fetch(targetId).catch(() => null);
              if (!targetMember) throw new Error("Usuário não encontrado.");
              if (targetMember.user.bot) throw new Error("Não pode convidar bots.");

              await familyService.addMember(guild, family.id, targetMember, vipConfigService);
              await interaction.update({ embeds: [createSuccessEmbed(`<@${targetId}> convidado com sucesso!`)], components: [] });
          }
      } catch (error) {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ embeds: [createErrorEmbed(error.message)], ephemeral: true });
          }
      }
  },

  async handleButton(interaction) {
      if (!interaction.customId.startsWith("family_btn_")) return;
      
      const familyService = interaction.client.services.family;
      const userId = interaction.user.id;
      const userFamily = await familyService.getFamilyByMember(userId);

      if (!userFamily) {
          return interaction.reply({ embeds: [createErrorEmbed("Você não tem família!")], ephemeral: true });
      }

      try {
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
              // This logic is mostly in service upgradeSlots, but it returns nextSlot.
              // I can call service.
              const nextSlot = await familyService.upgradeSlots(userId);
              await interaction.reply({ embeds: [createSuccessEmbed(`Upgrade realizado! A família agora tem **+${nextSlot}** slots extras de membro.`)] });
          }
          
          if (interaction.customId === "family_btn_invite_menu") {
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
               if (userFamily.ownerId === userId) {
                   return interaction.reply({ embeds: [createErrorEmbed("Você é o dono! Use `/family delete` ou `/family transfer`.")], ephemeral: true });
               }
               
               await familyService.removeMember(interaction.guild, userFamily.id, userId);
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

      } catch (error) {
           if (!interaction.replied) await interaction.reply({ embeds: [createErrorEmbed(error.message)], ephemeral: true });
      }
  },

  async handleModal(interaction) {
      if (interaction.customId === "family_deposit_modal" || interaction.customId === "family_withdraw_modal") {
          const amount = parseInt(interaction.fields.getTextInputValue("amount"));
          const familyService = interaction.client.services.family;
          const economyService = interaction.client.services.economy;
          const userId = interaction.user.id;

          if (isNaN(amount) || amount <= 0) {
              return interaction.reply({ embeds: [createErrorEmbed("Quantia inválida.")], ephemeral: true });
          }

          try {
              if (interaction.customId === "family_deposit_modal") {
                  await familyService.deposit(userId, amount, economyService);
                  await interaction.reply({ embeds: [createSuccessEmbed(`Depositado **${amount} 🪙** com sucesso!`)] });
              }
              
              if (interaction.customId === "family_withdraw_modal") {
                  await familyService.withdraw(userId, amount, economyService);
                  await interaction.reply({ embeds: [createSuccessEmbed(`Sacado **${amount} 🪙** com sucesso!`)] });
              }
          } catch (error) {
              await interaction.reply({ embeds: [createErrorEmbed(error.message)], ephemeral: true });
          }
      }
  }
};
