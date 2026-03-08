const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");

const bumpsStore = createDataStore("serverbumps.json");

function normalizeInviteLink(link) {
  let normalized = link.trim();
  if (!normalized.startsWith("http")) normalized = `https://${normalized}`;
  return normalized;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("serverbpost")
    .setDescription("Sistema de bump/post do servidor")
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("Configura o sistema de bump (admin)")
        .addChannelOption((opt) =>
          opt
            .setName("canal")
            .setDescription("Canal onde os bumps serão postados")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("cooldown")
            .setDescription("Cooldown entre bumps em horas (padrão: 2)")
            .setMinValue(1)
            .setMaxValue(24)
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("convite")
            .setDescription("Link de convite padrão do servidor")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("bump")
        .setDescription("Dê bump no servidor para divulgá-lo")
        .addStringOption((opt) =>
          opt
            .setName("descricao")
            .setDescription("Descrição do servidor para o bump")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("convite")
            .setDescription("Link de convite (opcional se já configurado)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("info")
        .setDescription("Veja as estatísticas de bump do servidor")
    )
    .addSubcommand((sub) =>
      sub
        .setName("top")
        .setDescription("Ranking dos servidores mais bumpados")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    // ==========================================
    // SUBCOMANDO: CONFIG (Admin)
    // ==========================================
    if (sub === "config") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas administradores podem configurar o sistema de bump!")],
          ephemeral: true,
        });
      }

      const canal = interaction.options.getChannel("canal");
      const cooldown = interaction.options.getInteger("cooldown");
      const convite = interaction.options.getString("convite");

      if (!canal && cooldown == null && !convite) {
        // Mostrar configuração atual
        const config = await getGuildConfig(guildId);
        const sbConfig = config.serverbpost || {};

        const channelMention = sbConfig.channelId
          ? `<#${sbConfig.channelId}>`
          : "❌ Não configurado";
        const cooldownText = sbConfig.cooldownHours
          ? `${sbConfig.cooldownHours} horas`
          : "2 horas (padrão)";
        const inviteText = sbConfig.defaultInvite || "❌ Não configurado";

        return interaction.reply({
          embeds: [
            createEmbed({
              title: "⚙️ Configuração do Server Bump",
              description:
                `**Canal de Bumps:** ${channelMention}\n` +
                `**Cooldown:** ${cooldownText}\n` +
                `**Convite Padrão:** ${inviteText}`,
              color: 0x3498db,
              footer: { text: "WDA - Todos os direitos reservados" },
            }),
          ],
          ephemeral: true,
        });
      }

      const currentConfig = await getGuildConfig(guildId);
      const sbConfig = currentConfig.serverbpost || {};
      const patch = { ...sbConfig };

      const changes = [];

      if (canal) {
        patch.channelId = canal.id;
        changes.push(`**Canal:** <#${canal.id}>`);
      }

      if (cooldown != null) {
        patch.cooldownHours = cooldown;
        changes.push(`**Cooldown:** ${cooldown} horas`);
      }

      if (convite) {
        const link = normalizeInviteLink(convite);
        patch.defaultInvite = link;
        changes.push(`**Convite:** ${link}`);
      }

      await setGuildConfig(guildId, { serverbpost: patch });

      return interaction.reply({
        embeds: [
          createSuccessEmbed(
            `**Sistema de Bump configurado!**\n\n${changes.join("\n")}`
          ),
        ],
        ephemeral: true,
      });
    }

    // ==========================================
    // SUBCOMANDO: BUMP
    // ==========================================
    if (sub === "bump") {
      await interaction.deferReply({ ephemeral: true });

      const guildConfig = await getGuildConfig(guildId);
      const sbConfig = guildConfig.serverbpost || {};

      if (!sbConfig.channelId) {
        return interaction.editReply({
          embeds: [
            createErrorEmbed(
              "O sistema de bump não foi configurado! Peça a um administrador para usar `/serverbpost config`."
            ),
          ],
        });
      }

      const bumpChannel = interaction.guild.channels.cache.get(sbConfig.channelId);
      if (!bumpChannel) {
        return interaction.editReply({
          embeds: [
            createErrorEmbed(
              "O canal de bumps configurado não foi encontrado. Peça a um administrador para reconfigurar."
            ),
          ],
        });
      }

      // Cooldown
      const cooldownMs = (sbConfig.cooldownHours || 2) * 60 * 60 * 1000;
      const allBumps = await bumpsStore.load();
      const guildBumps = Object.values(allBumps).filter(
        (b) => b.guildId === guildId && b.userId === userId
      );

      if (guildBumps.length > 0) {
        const lastBump = guildBumps.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        )[0];
        const elapsed = Date.now() - new Date(lastBump.createdAt).getTime();

        if (elapsed < cooldownMs) {
          const remainingMs = cooldownMs - elapsed;
          const remainingH = Math.floor(remainingMs / (60 * 60 * 1000));
          const remainingM = Math.ceil(
            (remainingMs % (60 * 60 * 1000)) / (60 * 1000)
          );

          return interaction.editReply({
            embeds: [
              createErrorEmbed(
                `Aguarde **${remainingH}h ${remainingM}m** para dar bump novamente!`
              ),
            ],
          });
        }
      }

      // Dados do bump
      const descricao = (interaction.options.getString("descricao") || "").replace(/@/g, "");
      let convite =
        interaction.options.getString("convite") || sbConfig.defaultInvite;

      if (!convite) {
        return interaction.editReply({
          embeds: [
            createErrorEmbed(
              "Nenhum link de convite fornecido e nenhum convite padrão configurado. Use a opção `convite` ou peça ao admin para configurar um padrão."
            ),
          ],
        });
      }

      if (!convite.startsWith("http")) convite = normalizeInviteLink(convite);

      // Salvar bump
      const bumpId = `${guildId}_${userId}_${Date.now()}`;
      const bumpData = {
        guildId,
        userId,
        guildName: interaction.guild.name,
        guildIcon: interaction.guild.iconURL(),
        memberCount: interaction.guild.memberCount,
        description: descricao,
        inviteLink: convite,
        createdAt: new Date().toISOString(),
      };

      await bumpsStore.update(bumpId, () => bumpData);

      // Contar total de bumps deste servidor
      const updatedBumps = await bumpsStore.load();
      const totalGuildBumps = Object.values(updatedBumps).filter(
        (b) => b.guildId === guildId
      ).length;

      // Postar embed no canal
      const bumpEmbed = new EmbedBuilder()
        .setColor(0x00d166)
        .setAuthor({
          name: interaction.guild.name,
          iconURL: interaction.guild.iconURL() || undefined,
        })
        .setDescription(
          `🔔 **Server Bump!**\n\n${descricao}\n\n` +
          `👥 **Membros:** ${interaction.guild.memberCount}\n` +
          `🔗 **Convite:** ${convite}\n` +
          `📊 **Total de Bumps:** ${totalGuildBumps}`
        )
        .setFooter({
          text: `Bump por ${interaction.user.username} • WDA`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      if (interaction.guild.iconURL()) {
        bumpEmbed.setThumbnail(interaction.guild.iconURL({ size: 256 }));
      }

      await bumpChannel.send({ embeds: [bumpEmbed] });

      return interaction.editReply({
        embeds: [
          createSuccessEmbed(
            `**Bump realizado com sucesso!** 🎉\n\n` +
            `Seu servidor foi postado em <#${sbConfig.channelId}>.\n` +
            `Você pode dar bump novamente em **${sbConfig.cooldownHours || 2} horas**.`
          ),
        ],
      });
    }

    // ==========================================
    // SUBCOMANDO: INFO
    // ==========================================
    if (sub === "info") {
      const allBumps = await bumpsStore.load();
      const guildBumps = Object.values(allBumps)
        .filter((b) => b.guildId === guildId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      if (guildBumps.length === 0) {
        return interaction.reply({
          embeds: [
            createEmbed({
              title: "📊 Estatísticas de Bump",
              description: "Este servidor ainda não recebeu nenhum bump.",
              color: 0x95a5a6,
              footer: { text: "WDA - Todos os direitos reservados" },
            }),
          ],
          ephemeral: true,
        });
      }

      // Contagem por usuário
      const userCounts = {};
      for (const b of guildBumps) {
        userCounts[b.userId] = (userCounts[b.userId] || 0) + 1;
      }

      const topBumpers = Object.entries(userCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([uid, count], i) => `**${i + 1}.** <@${uid}> — ${count} bumps`)
        .join("\n");

      const lastBump = guildBumps[0];
      const lastBumpDate = new Date(lastBump.createdAt);
      const timestamp = Math.floor(lastBumpDate.getTime() / 1000);

      return interaction.reply({
        embeds: [
          createEmbed({
            title: "📊 Estatísticas de Bump",
            description:
              `**Servidor:** ${interaction.guild.name}\n` +
              `**Total de Bumps:** ${guildBumps.length}\n` +
              `**Último Bump:** <t:${timestamp}:R>\n\n` +
              `**🏆 Top Bumpers:**\n${topBumpers}`,
            color: 0x3498db,
            thumbnail: interaction.guild.iconURL() || undefined,
            footer: { text: "WDA - Todos os direitos reservados" },
          }),
        ],
        ephemeral: true,
      });
    }

    // ==========================================
    // SUBCOMANDO: TOP
    // ==========================================
    if (sub === "top") {
      const allBumps = await bumpsStore.load();
      const bumpValues = Object.values(allBumps);

      if (bumpValues.length === 0) {
        return interaction.reply({
          embeds: [
            createEmbed({
              title: "🏆 Ranking de Bumps",
              description: "Nenhum servidor foi bumpado ainda.",
              color: 0x95a5a6,
              footer: { text: "WDA - Todos os direitos reservados" },
            }),
          ],
          ephemeral: true,
        });
      }

      // Agrupar por servidor
      const serverCounts = {};
      for (const b of bumpValues) {
        if (!serverCounts[b.guildId]) {
          serverCounts[b.guildId] = {
            guildName: b.guildName,
            guildId: b.guildId,
            count: 0,
            lastBump: b.createdAt,
          };
        }
        serverCounts[b.guildId].count++;
        if (new Date(b.createdAt) > new Date(serverCounts[b.guildId].lastBump)) {
          serverCounts[b.guildId].lastBump = b.createdAt;
        }
      }

      const ranking = Object.values(serverCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const medals = ["🥇", "🥈", "🥉"];
      const list = ranking
        .map((s, i) => {
          const medal = medals[i] || `**${i + 1}.**`;
          const ts = Math.floor(new Date(s.lastBump).getTime() / 1000);
          return `${medal} **${s.guildName}** — ${s.count} bumps (último: <t:${ts}:R>)`;
        })
        .join("\n");

      return interaction.reply({
        embeds: [
          createEmbed({
            title: "🏆 Ranking de Bumps",
            description: list,
            color: 0xf1c40f,
            footer: { text: "WDA - Todos os direitos reservados" },
          }),
        ],
        ephemeral: true,
      });
    }
  },
};
