const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { createEmbed } = require("../embeds");

function canManageVip(interaction) {
  const perms = interaction.memberPermissions;
  if (!perms) return false;
  return perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild);
}

async function fetchMember(interaction, userId) {
  if (!interaction.guild) return null;
  return interaction.guild.members.fetch(userId).catch(() => null);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vip")
    .setDescription("Gerencia e consulta VIPs")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Adiciona um usuário ao VIP")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário").setRequired(true))
        .addIntegerOption((opt) =>
          opt
            .setName("dias")
            .setDescription("Dias de VIP (opcional)")
            .setMinValue(1)
            .setRequired(false)
        )
        .addStringOption((opt) => 
            opt.setName("tier")
               .setDescription("Tier VIP (se não especificar, usa o padrão ou mantém o atual)")
               .setAutocomplete(true) // Vamos usar autocomplete ou select manual? Autocomplete é melhor se tiver muitos.
               // Mas como tiers são configurados por guilda, o autocomplete teria que ler do vipConfig.
               // Como não implementei autocomplete handler, vou usar string normal por enquanto e validar.
               .setRequired(false)
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove um usuário do VIP")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Mostra se alguém é VIP")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário (padrão: você)")),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Lista VIPs cadastrados")),

  async execute(interaction) {
    const vip = interaction.client.services?.vip;
    const vipRole = interaction.client.services?.vipRole;
    if (!vip) {
      await interaction.reply({ content: "Serviço de VIP indisponível.", ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "add" || sub === "remove" || sub === "list") {
      if (!canManageVip(interaction)) {
        await interaction.reply({ content: "Você não tem permissão para isso.", ephemeral: true });
        return;
      }
    }

    if (sub === "add") {
      const user = interaction.options.getUser("usuario", true);
      const days = interaction.options.getInteger("dias");
      const tierName = interaction.options.getString("tier");
      
      let tierId = null;
      if (tierName) {
          const vipConfig = interaction.client.services.vipConfig;
          const tiers = await vipConfig.getGuildTiers(interaction.guildId);
          // Busca pelo nome ou ID do cargo
          const found = Object.entries(tiers).find(([id, t]) => t.name.toLowerCase() === tierName.toLowerCase() || id === tierName);
          if (!found) {
              return interaction.reply({ embeds: [createEmbed({ description: `Tier **${tierName}** não encontrado. Use \`/vipadmin list_tiers\` para ver os disponíveis.`, color: 0xFF0000 })], ephemeral: true });
          }
          tierId = found[0];
      }

      const result = await vip.addVip(user.id, { days, tierId });
      
      const ensured =
        interaction.guildId && vipRole
          ? await vipRole.ensurePersonalRole(user.id, { guildId: interaction.guildId })
          : { ok: false };

      // Se tier foi definido, adicionar cargo do Tier ao usuário
      if (tierId && interaction.guild) {
          const member = await interaction.guild.members.fetch(user.id).catch(() => null);
          if (member) {
              // 1. Dar o cargo de permissão do Tier
              await member.roles.add(tierId).catch(() => {});
              
              // 2. Verificar se precisa criar cargo estético extra
              const vipConfig = interaction.client.services.vipConfig;
              const tiers = await vipConfig.getGuildTiers(interaction.guildId);
              const tierData = tiers[tierId];
              
              if (tierData && tierData.aesthetic) {
                  // Cria um cargo estético exclusivo para o usuário
                  try {
                      const aestheticRole = await interaction.guild.roles.create({
                          name: `VIP ${user.username}`,
                          color: 0xFFD700, // Gold padrão
                          reason: `Cargo estético VIP para ${user.tag}`
                      });
                      
                      // Move o cargo estético para cima do cargo de permissão (se possível)
                      // Tenta posicionar logo abaixo do bot ou do cargo de permissão
                      // Por enquanto, apenas cria e atribui
                      
                      await member.roles.add(aestheticRole);
                      
                      // Salva referência desse cargo no settings do usuário para poder gerenciar depois
                      const settings = vip.getSettings(user.id) || {};
                      await vip.setSettings(user.id, {
                          ...settings,
                          aestheticRoleId: aestheticRole.id
                      });
                  } catch (e) {
                      // Falha silenciosa ou log se não tiver permissão
                  }
              }
          }
      }

      const description = result.created
        ? `${user} agora é VIP!`
        : `${user} teve seu VIP renovado!`;

      const fields = [];
      if (tierId) {
          fields.push({ name: "Tier", value: `<@&${tierId}>`, inline: true });
      }
      if (result.vip.expiresAt) {
          fields.push({
              name: "Expira em",
              value: `<t:${Math.floor(result.vip.expiresAt / 1000)}:R>`,
              inline: true
          });
      }
      
      // Se criou cargo estético, avisa
      const settings = vip.getSettings(user.id);
      if (settings && settings.aestheticRoleId) {
          fields.push({ name: "Cargo Estético", value: `<@&${settings.aestheticRoleId}>`, inline: true });
      }
      
      if (ensured.ok) {
          fields.push({ name: "Cargo Personalizado", value: `${ensured.role}`, inline: true });
      }

      const embed = createEmbed({
        title: "🎉 Novo VIP!",
        description,
        thumbnail: user.displayAvatarURL(),
        fields,
      });

      await interaction.reply({ embeds: [embed] });
      
      // Envia DM
      try {
          const dmEmbed = createEmbed({
              title: "Parabéns! Você virou VIP!",
              description: `Você recebeu acesso VIP no servidor **${interaction.guild.name}**.`,
              fields: [
                  { name: "Comandos", value: "Use `/myvip` para configurar seu cargo e sala." },
                  ...(result.vip.expiresAt ? [{ name: "Expira em", value: `<t:${Math.floor(result.vip.expiresAt / 1000)}:F>` }] : [])
              ],
              footer: "Aproveite seus benefícios!"
          });
          await user.send({ embeds: [dmEmbed] });
      } catch (e) {
          // DM fechada, ignora
      }
      
      return;
    }

    if (sub === "remove") {
      const user = interaction.options.getUser("usuario", true);
      const result = await vip.removeVip(user.id);
      const settings = vip.getSettings ? vip.getSettings(user.id) : null;

      if (result.removed && interaction.guild && settings?.roleId) {
        const role = await interaction.guild.roles.fetch(settings.roleId).catch(() => null);
        if (role) await role.delete(`VIP removido: ${user.tag}`).catch(() => {});
        await vip
          .setSettings(user.id, {
            roleId: null,
            roleName: null,
            roleColor: null,
            hoist: false,
            mentionable: false,
            updatedAt: Date.now(),
          })
          .catch(() => {});
      }

      const embed = createEmbed({
        title: "VIP",
        description: result.removed
          ? `${user} foi removido da lista VIP.`
          : `${user} não estava na lista VIP.`,
      });

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === "status") {
      const user = interaction.options.getUser("usuario") || interaction.user;
      const member = await fetchMember(interaction, user.id);
      const isVip = vip.isVip({ userId: user.id, member });
      const entry = vip.getVip(user.id);

      const fields = [];
      if (entry?.addedAt) {
        fields.push({
          name: "Cadastrado em",
          value: `<t:${Math.floor(entry.addedAt / 1000)}:F>`,
          inline: false,
        });
      }

      const embed = createEmbed({
        title: "Status VIP",
        description: `${user} ${isVip ? "é" : "não é"} VIP.`,
        fields,
      });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

const { createPagination } = require("../utils/pagination");

module.exports = {
  // ... data ...
  async execute(interaction) {
    const vip = interaction.client.services?.vip;
    const vipRole = interaction.client.services?.vipRole;
    if (!vip) {
      await interaction.reply({ content: "Serviço de VIP indisponível.", ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();

    // ... add, remove, status ...

    if (sub === "list") {
      const ids = vip.listVipIds();
      
      if (ids.length === 0) {
          return interaction.reply({ embeds: [createEmbed({ description: "Nenhum VIP cadastrado." })], ephemeral: true });
      }

      await createPagination({
          interaction,
          items: ids,
          itemsPerPage: 25,
          title: "VIPs",
          embedBuilder: (items, page, total) => {
              const mentions = items.map(id => `<@${id}>`).join("\n");
              return createEmbed({
                  title: "VIPs",
                  description: mentions,
                  footer: { text: `Página ${page + 1}/${total} • Total: ${ids.length}` }
              });
          }
      });
    }
  },
};
  },
};
