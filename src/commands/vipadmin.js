const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { createEmbed, createErrorEmbed, createSuccessEmbed } = require("../embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vipadmin")
    .setDescription("Administração completa do sistema VIP")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("tier")
        .setDescription("Cria ou atualiza um tier VIP")
        .addRoleOption((opt) => opt.setName("cargo").setDescription("Cargo do tier VIP").setRequired(true))
        .addStringOption((opt) => opt.setName("nome").setDescription("Nome de exibição do tier").setRequired(true))
        .addIntegerOption((opt) => opt.setName("preco").setDescription("Preço em moedas para compra").setMinValue(0).setRequired(true))
        .addNumberOption((opt) => opt.setName("multiplicador_xp").setDescription("Multiplicador de XP para o tier").setMinValue(1).setRequired(true))
        .addIntegerOption((opt) => opt.setName("bonus_daily").setDescription("Bônus diário em porcentagem").setMinValue(0).setRequired(true))
        .addChannelOption((opt) => opt.setName("canal_voz").setDescription("Canal de voz VIP do tier").setRequired(false))
        .addIntegerOption((opt) => opt.setName("limite_familia").setDescription("Limite de membros de família").setMinValue(0).setRequired(false))
        .addIntegerOption((opt) => opt.setName("limite_damas").setDescription("Limite de damas").setMinValue(0).setRequired(false))
        .addBooleanOption((opt) => opt.setName("pode_criar_familia").setDescription("Permite criar família").setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Adiciona VIP para um usuário")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário que receberá VIP").setRequired(true))
        .addRoleOption((opt) => opt.setName("cargo").setDescription("Tier (cargo) que será aplicado").setRequired(true))
        .addIntegerOption((opt) => opt.setName("dias").setDescription("Dias de duração do VIP").setMinValue(1).setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove VIP de um usuário")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário que perderá VIP").setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Lista tiers e usuários VIP ativos"))
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Configura o cargo VIP funcional do servidor")
        .addRoleOption((opt) => opt.setName("cargo_vip").setDescription("Cargo VIP funcional para recursos gerais").setRequired(true)),
    ),

  async execute(interaction, services) {
    const vipService = services?.vip;
    const vipRoleManager = services?.vipRole;
    const vipConfig = services?.vipConfig;

    if (!vipService || !vipConfig) {
      return interaction.reply({ embeds: [createErrorEmbed("Serviços VIP indisponíveis no momento.")], ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    try {
      if (sub === "setup") {
        const role = interaction.options.getRole("cargo_vip", true);
        await vipService.setGuildConfig(interaction.guildId, { vipRoleId: role.id, updatedAt: Date.now() });
        return interaction.reply({ embeds: [createSuccessEmbed(`Cargo VIP funcional configurado para ${role}.`)], ephemeral: true });
      }

      if (sub === "tier") {
        const role = interaction.options.getRole("cargo", true);
        const voiceChannel = interaction.options.getChannel("canal_voz");
        const payload = {
          name: interaction.options.getString("nome", true),
          roleId: role.id,
          price: interaction.options.getInteger("preco", true),
          multiplicadorXp: interaction.options.getNumber("multiplicador_xp", true),
          bonusDaily: interaction.options.getInteger("bonus_daily", true),
          voiceChannelId: voiceChannel?.id || null,
          limits: {
            familyMembers: interaction.options.getInteger("limite_familia") ?? 0,
            damas: interaction.options.getInteger("limite_damas") ?? 0,
            allowFamily: interaction.options.getBoolean("pode_criar_familia") ?? false,
          },
        };

        await vipConfig.setGuildTier(interaction.guildId, role.id, payload);

        return interaction.reply({
          embeds: [
            createEmbed({
              title: "✅ Tier VIP salvo",
              color: 0x2ecc71,
              fields: [
                { name: "Tier", value: payload.name, inline: true },
                { name: "Cargo", value: `<@&${role.id}>`, inline: true },
                { name: "Preço", value: `${payload.price} 🪙`, inline: true },
                { name: "Multiplicador XP", value: `${payload.multiplicadorXp}x`, inline: true },
                { name: "Bônus Daily", value: `${payload.bonusDaily}%`, inline: true },
                { name: "Canal de Voz", value: payload.voiceChannelId ? `<#${payload.voiceChannelId}>` : "Não definido", inline: true },
              ],
            }),
          ],
          ephemeral: true,
        });
      }

      if (sub === "add") {
        const user = interaction.options.getUser("usuario", true);
        const role = interaction.options.getRole("cargo", true);
        const days = interaction.options.getInteger("dias") ?? null;
        const tiers = await vipConfig.getGuildTiers(interaction.guildId);
        const tier = tiers[role.id];

        if (!tier) {
          return interaction.reply({ embeds: [createErrorEmbed("Esse cargo ainda não foi configurado como tier. Use /vipadmin tier primeiro.")], ephemeral: true });
        }

        const result = await vipService.addVip(user.id, { days, tierId: role.id });
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (member) {
          await member.roles.add(role.id).catch(() => null);
          const guildConfig = vipService.getGuildConfig(interaction.guildId);
          if (guildConfig?.vipRoleId) {
            await member.roles.add(guildConfig.vipRoleId).catch(() => null);
          }
        }

        if (vipRoleManager) {
          await vipRoleManager.ensurePersonalRole(user.id, { guildId: interaction.guildId }).catch(() => null);
        }

        return interaction.reply({ embeds: [createSuccessEmbed(`${user} recebeu VIP no tier **${tier.name}**${result.vip.expiresAt ? ` até <t:${Math.floor(result.vip.expiresAt / 1000)}:F>` : ""}.`)], ephemeral: true });
      }

      if (sub === "remove") {
        const user = interaction.options.getUser("usuario", true);
        const removed = await vipService.removeVip(user.id);
        if (!removed.removed) {
          return interaction.reply({ embeds: [createErrorEmbed("Esse usuário não está na lista VIP.")], ephemeral: true });
        }

        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (member) {
          if (removed.vip?.tierId) {
            await member.roles.remove(removed.vip.tierId).catch(() => null);
          }
          const guildConfig = vipService.getGuildConfig(interaction.guildId);
          if (guildConfig?.vipRoleId) {
            await member.roles.remove(guildConfig.vipRoleId).catch(() => null);
          }
        }

        return interaction.reply({ embeds: [createSuccessEmbed(`VIP removido de ${user}.`)], ephemeral: true });
      }

      if (sub === "list") {
        const tiers = await vipConfig.getGuildTiers(interaction.guildId);
        const vipIds = vipService.listVipIds();
        const activeVips = vipIds.map((id) => vipService.getVip(id)).filter(Boolean);

        return interaction.reply({
          embeds: [
            createEmbed({
              title: "📋 Painel VIP",
              color: 0x9b59b6,
              fields: [
                {
                  name: `Tiers Configurados (${Object.keys(tiers).length})`,
                  value: Object.values(tiers).length
                    ? Object.values(tiers)
                        .map((tier) => `• **${tier.name}** (${tier.price} 🪙, ${tier.multiplicadorXp}x XP, +${tier.bonusDaily}% daily)`)
                        .join("\n")
                    : "Nenhum tier configurado.",
                },
                {
                  name: `VIPs Ativos (${activeVips.length})`,
                  value: activeVips.length
                    ? activeVips
                        .slice(0, 20)
                        .map((entry) => `• <@${entry.userId}> - ${entry.tierId ? `<@&${entry.tierId}>` : "Sem tier"}${entry.expiresAt ? ` (expira <t:${Math.floor(entry.expiresAt / 1000)}:R>)` : ""}`)
                        .join("\n")
                    : "Nenhum VIP ativo.",
                },
              ],
            }),
          ],
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error("[vipadmin] erro", error);
      return interaction.reply({ embeds: [createErrorEmbed("Falha ao executar o comando vipadmin. Verifique logs do bot.")], ephemeral: true });
    }
  },
};
