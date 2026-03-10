const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

const levelsStore = createDataStore("levels.json");
const levelRolesStore = createDataStore("levelRoles.json");
const levelConfigStore = createDataStore("levelConfig.json");

const pendingResets = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leveladmin")
    .setDescription("Administração do sistema de níveis")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => 
        sub.setName("reset").setDescription("Reseta todo o XP e níveis do servidor (requer confirmação)")
    )
    .addSubcommand(sub => 
        sub.setName("info").setDescription("Ver as configurações atuais do sistema de XP")
    )
    .addSubcommandGroup(group => 
        group.setName("xp").setDescription("Gerenciamento de XP e Limites")
        .addSubcommand(sub => sub.setName("manage").setDescription("Adiciona, remove ou seta XP de um usuário")
            .addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true))
            .addStringOption(o => o.setName("action").setDescription("Ação").setRequired(true).addChoices(
                { name: "Add XP", value: "add" },
                { name: "Remover XP", value: "remove" },
                { name: "Setar XP", value: "set" }
            ))
            .addIntegerOption(o => o.setName("quantidade").setDescription("Quantidade").setRequired(true).setMinValue(0))
        )
        .addSubcommand(sub => sub.setName("range").setDescription("Configura os limites de XP ganhos aleatoriamente")
            .addIntegerOption(o => o.setName("msg_min").setDescription("Min XP por mensagem"))
            .addIntegerOption(o => o.setName("msg_max").setDescription("Max XP por mensagem"))
            .addIntegerOption(o => o.setName("voz_min").setDescription("Min XP por minuto de call"))
            .addIntegerOption(o => o.setName("voz_max").setDescription("Max XP por minuto de call"))
        )
    )
    .addSubcommandGroup(group => 
        group.setName("roles").setDescription("Configuração de cargos, multiplicadores e imunes")
        .addSubcommand(sub => sub.setName("level").setDescription("Define ou remove o cargo de um nível")
            .addIntegerOption(o => o.setName("nivel").setDescription("Nível a ser configurado").setRequired(true).setMinValue(1))
            .addRoleOption(o => o.setName("cargo").setDescription("Cargo (deixe vazio para remover)"))
        )
        .addSubcommand(sub => sub.setName("add_multiplier").setDescription("Adiciona um cargo multiplicador de XP")
            .addRoleOption(o => o.setName("cargo").setDescription("Cargo multiplicador").setRequired(true))
            .addNumberOption(o => o.setName("fator").setDescription("Fator (ex: 2 para 2x)").setRequired(true).setMinValue(1.1))
        )
        .addSubcommand(sub => sub.setName("remove_multiplier").setDescription("Remove um cargo multiplicador")
            .addRoleOption(o => o.setName("cargo").setDescription("Cargo").setRequired(true))
        )
        .addSubcommand(sub => sub.setName("add_immune").setDescription("Adiciona um cargo que NÃO ganha XP (Imune)")
            .addRoleOption(o => o.setName("cargo").setDescription("Cargo imune").setRequired(true))
        )
        .addSubcommand(sub => sub.setName("remove_immune").setDescription("Remove um cargo da lista de imunes")
            .addRoleOption(o => o.setName("cargo").setDescription("Cargo").setRequired(true))
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const sub = interaction.options.getSubcommand();
        const group = interaction.options.getSubcommandGroup(false);
        const guildId = interaction.guildId;

        // --- RESET ---
        if (sub === "reset") {
          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`leveladmin_confirm_${interaction.user.id}`).setLabel("✅ Confirmar Reset").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`leveladmin_cancel_${interaction.user.id}`).setLabel("❌ Cancelar").setStyle(ButtonStyle.Secondary)
          );

          const embed = createEmbed({
            title: "⚠️ CONFIRMAÇÃO DE RESET",
            description: `**Você está prestes a resetar TODO o sistema de níveis!**\n\n- Zerar o XP de **TODOS**\n- Resetar níveis para **0**\n- Remover cargos de nível\n- **Ação IRREVERSÍVEL!**`,
            color: 0xff0000,
            footer: { text: "Expira em 60 segundos" }
          });

          pendingResets.set(interaction.user.id, Date.now());
          setTimeout(() => pendingResets.delete(interaction.user.id), 60000);

          return interaction.editReply({ embeds: [embed], components: [confirmRow] });
        }

        // --- INFO ---
        if (sub === "info") {
            const configData = (await levelConfigStore.load()) || {};
            const config = { xpMsgMin: 5, xpMsgMax: 15, xpVoiceMin: 20, xpVoiceMax: 40, immuneRoleIds: [], multiplierRoles: {}, ...(configData[guildId] || {}) };
            
            const rolesData = (await levelRolesStore.load()) || {};
            const guildRoles = rolesData[guildId] || {};

            let levelRolesTxt = Object.entries(guildRoles).sort((a,b) => Number(a[0]) - Number(b[0])).map(([lvl, roleId]) => `**Nível ${lvl}:** <@&${roleId}>`).join("\n");
            if (!levelRolesTxt) levelRolesTxt = "Nenhum cargo configurado.";

            let multTxt = Object.entries(config.multiplierRoles || {}).map(([roleId, fator]) => `<@&${roleId}>: **${fator}x**`).join("\n");
            if (!multTxt) multTxt = "Nenhum multiplicador.";

            let immuneTxt = (config.immuneRoleIds || []).map(roleId => `<@&${roleId}>`).join("\n");
            if (!immuneTxt) immuneTxt = "Nenhum imune.";

            const embed = new EmbedBuilder()
              .setTitle("📊 Painel de Configurações de Nível")
              .setColor(0x5865F2)
              .addFields(
                  { name: "💬 XP por Mensagem", value: `Mínimo: **${config.xpMsgMin}**\nMáximo: **${config.xpMsgMax}**`, inline: true },
                  { name: "🎙️ XP por Call (Min)", value: `Mínimo: **${config.xpVoiceMin}**\nMáximo: **${config.xpVoiceMax}**`, inline: true },
                  { name: "🏆 Cargos de Nível", value: levelRolesTxt, inline: false },
                  { name: "✨ Multiplicadores", value: multTxt, inline: true },
                  { name: "🛡️ Imunes (0 XP)", value: immuneTxt, inline: true }
              );

            return interaction.editReply({ embeds: [embed] });
        }

        // --- GROUP: XP ---
        if (group === "xp") {
            if (sub === "manage") {
                const target = interaction.options.getUser("usuario");
                const action = interaction.options.getString("action");
                const amount = interaction.options.getInteger("quantidade");

                await levelsStore.update(target.id, (cur) => {
                    let d = cur || { xp: 0, level: 0, totalXp: 0 };
                    if (action === "add") d.totalXp += amount;
                    if (action === "remove") d.totalXp = Math.max(0, d.totalXp - amount);
                    if (action === "set") d.totalXp = amount;
                    
                    d.level = Math.floor(d.totalXp / 1000);
                    d.xp = d.totalXp % 1000;
                    return d;
                });

                return interaction.editReply({ embeds: [createSuccessEmbed(`✅ Operação de XP realizada com sucesso em ${target}.`)] });
            }

            if (sub === "range") {
                const patch = {};
                const xpMsgMin = interaction.options.getInteger("msg_min");
                const xpMsgMax = interaction.options.getInteger("msg_max");
                const xpVozMin = interaction.options.getInteger("voz_min");
                const xpVozMax = interaction.options.getInteger("voz_max");
                
                if (xpMsgMin !== null) patch.xpMsgMin = xpMsgMin;
                if (xpMsgMax !== null) patch.xpMsgMax = xpMsgMax;
                if (xpVozMin !== null) patch.xpVoiceMin = xpVozMin;
                if (xpVozMax !== null) patch.xpVoiceMax = xpVozMax;

                await levelConfigStore.update(guildId, (curr) => ({ ...(curr || {}), ...patch }));
                return interaction.editReply({ embeds: [createSuccessEmbed("✅ Limites de ganho aleatório de XP atualizados!")] });
            }
        }

        // --- GROUP: ROLES ---
        if (group === "roles") {
            if (sub === "level") {
                const nivel = interaction.options.getInteger("nivel");
                const cargo = interaction.options.getRole("cargo");

                await levelRolesStore.update(guildId, (roles) => {
                    const atual = roles || {};
                    if (cargo) atual[String(nivel)] = cargo.id; 
                    else delete atual[String(nivel)];
                    return atual;
                });

                if (cargo) return interaction.editReply({ embeds: [createSuccessEmbed(`✅ Nível **${nivel}** atrelado ao cargo ${cargo}.`)] });
                else return interaction.editReply({ embeds: [createSuccessEmbed(`✅ Cargo do nível **${nivel}** removido.`)] });
            }

            if (sub === "add_multiplier") {
                const role = interaction.options.getRole("cargo");
                const fator = interaction.options.getNumber("fator");

                await levelConfigStore.update(guildId, (curr) => {
                    const data = curr || {};
                    data.multiplierRoles = data.multiplierRoles || {};
                    data.multiplierRoles[role.id] = fator;
                    return data;
                });
                return interaction.editReply({ embeds: [createSuccessEmbed(`✅ Cargo ${role} agora multiplica o XP por **${fator}x**.`)] });
            }

            if (sub === "remove_multiplier") {
                const role = interaction.options.getRole("cargo");
                await levelConfigStore.update(guildId, (curr) => {
                    const data = curr || {};
                    data.multiplierRoles = data.multiplierRoles || {};
                    delete data.multiplierRoles[role.id];
                    return data;
                });
                return interaction.editReply({ embeds: [createSuccessEmbed(`✅ Cargo ${role} removido dos multiplicadores.`)] });
            }

            if (sub === "add_immune") {
                const role = interaction.options.getRole("cargo");
                await levelConfigStore.update(guildId, (curr) => {
                    const data = curr || {};
                    data.immuneRoleIds = data.immuneRoleIds || [];
                    if (!data.immuneRoleIds.includes(role.id)) data.immuneRoleIds.push(role.id);
                    return data;
                });
                return interaction.editReply({ embeds: [createSuccessEmbed(`✅ Cargo ${role} adicionado aos imunes (não ganha XP).`)] });
            }

            if (sub === "remove_immune") {
                const role = interaction.options.getRole("cargo");
                await levelConfigStore.update(guildId, (curr) => {
                    const data = curr || {};
                    data.immuneRoleIds = data.immuneRoleIds || [];
                    data.immuneRoleIds = data.immuneRoleIds.filter(id => id !== role.id);
                    return data;
                });
                return interaction.editReply({ embeds: [createSuccessEmbed(`✅ Cargo ${role} removido dos imunes.`)] });
            }
        }
    } catch (error) {
        console.error("Erro ao executar /leveladmin:", error);
        return interaction.editReply({ embeds: [createErrorEmbed("Ocorreu um erro ao processar o comando. Verifique o console da VPS.")] }).catch(()=>{});
    }
  },

  async handleButton(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith("leveladmin_confirm_")) {
      const userId = customId.replace("leveladmin_confirm_", "");
      if (interaction.user.id !== userId) return interaction.reply({ content: "❌ Você não pode confirmar.", ephemeral: true });

      const requestTime = pendingResets.get(userId);
      if (!requestTime || Date.now() - requestTime > 60000) return interaction.reply({ content: "❌ Confirmação expirada.", ephemeral: true });

      try {
        const levels = (await levelsStore.load()) || {};
        const resetCount = Object.keys(levels).length;

        try {
            await levelsStore.save({});
        } catch (e) {
            for (const key of Object.keys(levels)) {
                if (typeof levelsStore.delete === 'function') await levelsStore.delete(key);
                else await levelsStore.update(key, () => undefined);
            }
        }

        const guild = interaction.guild;
        if (guild) {
          const members = await guild.members.fetch();
          const levelRolesData = (await levelRolesStore.load()) || {};
          const guildLevelRoles = levelRolesData[guild.id] || {};

          for (const member of members.values()) {
            for (const roleId of Object.values(guildLevelRoles)) {
              if (member.roles.cache.has(roleId)) await member.roles.remove(roleId).catch(() => {});
            }
          }
        }

        pendingResets.delete(userId);
        return interaction.update({ embeds: [createSuccessEmbed(`✅ **Reset concluído!**\n\n• **${resetCount}** usuários resetados para o nível **0**.\n• Cargos de nível removidos.`)], components: [] });
      } catch (error) {
        console.error("Erro no botão do leveladmin:", error);
        return interaction.update({ embeds: [createErrorEmbed("Ocorreu um erro ao resetar o servidor.")], components: [] });
      }
    }

    if (customId.startsWith("leveladmin_cancel_")) {
      const userId = customId.replace("leveladmin_cancel_", "");
      if (interaction.user.id !== userId) return interaction.reply({ content: "❌ Você não pode cancelar.", ephemeral: true });

      pendingResets.delete(userId);
      return interaction.update({ embeds: [createEmbed({ title: "❌ Reset Cancelado", description: "O reset foi cancelado.", color: 0x00ff00 })], components: [] });
    }
  }
};