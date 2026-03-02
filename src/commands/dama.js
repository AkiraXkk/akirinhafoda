const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { getGuildConfig } = require("../config/guildConfig");

async function limiteDamasDoTier(member, guildId, client) {
  const vipService = client.services.vip;
  const entrada = vipService.getVip(member.id);
  if (!entrada) return 0;
  const tier = await vipService.getTierConfig(guildId, entrada.tierId);
  return tier?.maxDamas ?? 1;
}

async function buildPanelEmbed(guildId) {
  const config = await getGuildConfig(guildId);
  const damaRoleId = config?.damaRoleId;
  const damaPermRoleId = config?.damaPermRoleId;
  return createEmbed({
    title: "⚙️ Painel Admin — Sistema de Damas",
    description: [
      `**Cargo de Dama:** ${damaRoleId ? `<@&${damaRoleId}>` : "❌ Não definido"}`,
      `**Cargo base (permissão):** ${damaPermRoleId ? `<@&${damaPermRoleId}>` : "❌ Não definido"}`,
      "",
      "O limite de damas é lido do **Tier VIP** do usuário (/vipadmin tier).",
    ].join("\n"),
    color: 0x5865f2,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dama")
    .setDescription("Sistema de Primeira Dama")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Define sua primeira dama")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Sua dama").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove uma dama específica ou todas")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Dama específica"))
    )
    .addSubcommand((sub) =>
      sub.setName("config").setDescription("Painel de configuração (Admin)")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guildId, user, client, member } = interaction;
    const vipService = client.services.vip;

    if (sub === "config") {
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ embeds: [createErrorEmbed("Sem permissão.")], ephemeral: true });
      }
      return interaction.reply({
        embeds: [await buildPanelEmbed(guildId)],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("dama_cfg:set_roles").setLabel("Configurar Cargos").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("dama_cfg:close").setLabel("Fechar").setStyle(ButtonStyle.Secondary)
          ),
        ],
        ephemeral: true,
      });
    }

    if (sub === "set") {
      const alvo = interaction.options.getUser("usuario");
      const maxDamas = await limiteDamasDoTier(member, guildId, client);

      if (maxDamas === 0) {
        return interaction.reply({
          embeds: [createErrorEmbed("Apenas VIPs podem definir damas. Seu plano não possui limite de damas.")],
          ephemeral: true,
        });
      }

      const atual = vipService.getDamasCount(guildId, user.id);
      if (atual >= maxDamas) {
        return interaction.reply({
          embeds: [createErrorEmbed(`Limite de **${maxDamas}** dama(s) atingido. Melhore seu VIP para aumentar.`)],
          ephemeral: true,
        });
      }

      if (alvo.id === user.id) {
        return interaction.reply({ embeds: [createErrorEmbed("Não pode ser sua própria dama.")], ephemeral: true });
      }
      if (alvo.bot) {
        return interaction.reply({ embeds: [createErrorEmbed("Bots não podem ser damas.")], ephemeral: true });
      }

      try {
        await vipService.addDama(user.id, alvo.id);
        return interaction.reply({
          embeds: [createSuccessEmbed(`${alvo} agora é sua dama! (${atual + 1}/${maxDamas})`)],
          ephemeral: true,
        });
      } catch (err) {
        return interaction.reply({ embeds: [createErrorEmbed("Falha ao registrar dama.")], ephemeral: true });
      }
    }

    if (sub === "remove") {
      const alvo = interaction.options.getUser("usuario");
      try {
        await vipService.removeDama(user.id, alvo?.id);
        return interaction.reply({ embeds: [createSuccessEmbed("Dama(s) removida(s) com sucesso.")], ephemeral: true });
      } catch (err) {
        return interaction.reply({ embeds: [createErrorEmbed("Falha ao remover.")], ephemeral: true });
      }
    }
  },

  async handleButton(interaction) {
    const id = interaction.customId;
    if (!id.startsWith("dama_cfg:")) return;

    if (id === "dama_cfg:close") {
      return interaction.update({ components: [], embeds: [createSuccessEmbed("Painel fechado.")] });
    }

    if (id === "dama_cfg:set_roles") {
      return interaction.reply({ embeds: [createErrorEmbed("Configuração de cargos ainda não implementada.")], ephemeral: true });
    }
  },
};
