const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");
const { createDataStore } = require("../store/dataStore");

const partnersStore = createDataStore("partners.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("partnerconfig")
    .setDescription("configuracoes administrativas do sistema de parceria")
    // GARANTE QUE SÓ QUEM GERENCIA O SERVIDOR VEJA O COMANDO
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("set")
        .setDescription("configura o canal de logs e status do sistema")
        .addChannelOption(o => o.setName("logs").setDescription("canal onde os pedidos irao chegar"))
        .addBooleanOption(o => o.setName("ativo").setDescription("define se o sistema esta aberto ao publico"))
        .addRoleOption(o => o.setName("staff_ping").setDescription("cargo que sera mencionado quando chegar um pedido"))
    )
    .addSubcommand(sub =>
      sub.setName("ranks")
        .setDescription("configura os cargos de ranking (Tiers)")
        .addRoleOption(o => o.setName("bronze").setDescription("cargo para 350+ membros").setRequired(true))
        .addRoleOption(o => o.setName("prata").setDescription("cargo para 500+ membros").setRequired(true))
        .addRoleOption(o => o.setName("ouro").setDescription("cargo para 1000+ membros").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("info")
        .setDescription("consulta os detalhes de uma parceria especifica")
        .addStringOption(o => o.setName("id").setDescription("ID da parceria (ex: PARC12345)").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("clear")
        .setDescription("apaga TODAS as parcerias do banco de dados (Reset)")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guildId } = interaction;
    
    // Carrega a config atual ou cria uma base
    let guildConfig = await getGuildConfig(guildId) || {};
    if (!guildConfig.partnership) guildConfig.partnership = { enabledForAll: false, ranks: {} };
    let pConfig = guildConfig.partnership;

    if (sub === "set") {
      const logChan = interaction.options.getChannel("logs");
      const active = interaction.options.getBoolean("ativo");
      const staffRole = interaction.options.getRole("staff_ping");

      if (logChan) pConfig.logChannelId = logChan.id;
      if (active !== null) pConfig.enabledForAll = active;
      if (staffRole) pConfig.staffPingRoleId = staffRole.id; // Salva para o ping no log

      await setGuildConfig(guildId, { partnership: pConfig });
      return interaction.reply({ content: "✅ Configurações básicas de parceria atualizadas.", ephemeral: true });
    }

    if (sub === "ranks") {
      pConfig.ranks = {
        bronze: interaction.options.getRole("bronze").id,
        prata: interaction.options.getRole("prata").id,
        ouro: interaction.options.getRole("ouro").id
      };

      await setGuildConfig(guildId, { partnership: pConfig });
      return interaction.reply({ content: "✅ Cargos de Ranking (Bronze, Prata e Ouro) configurados com sucesso.", ephemeral: true });
    }

    if (sub === "info") {
      const partners = await partnersStore.load();
      const searchId = interaction.options.getString("id").toUpperCase();
      const data = partners[searchId];

      if (!data) return interaction.reply({ content: "❌ Nenhuma parceria encontrada com este ID.", ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle(`Ficha Técnica - ${data.id}`)
        .setColor(data.status === "accepted" ? 0x00FF00 : (data.status === "pending" ? 0xFFFF00 : 0xFF0000))
        .addFields(
          { name: "Servidor", value: data.serverName, inline: true },
          { name: "Tier", value: data.tier || "Não definido", inline: true },
          { name: "Membros Reais", value: `${data.memberCount}`, inline: true },
          { name: "Representante", value: `<@${data.requesterId}>`, inline: true },
          { name: "Status", value: data.status.toUpperCase(), inline: true },
          { name: "Link", value: `[Clique aqui](${data.inviteLink})`, inline: true }
        )
        .setFooter({ text: `Solicitado em: ${new Date(data.date).toLocaleDateString('pt-BR')}` });

      if (data.processedBy) {
        embed.addFields({ name: "Processado por", value: `<@${data.processedBy}>`, inline: false });
      }
      
      if (data.reason) {
        embed.addFields({ name: "Motivo da Recusa", value: data.reason, inline: false });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "clear") {
      await interaction.deferReply({ ephemeral: true });

      const allPartners = await partnersStore.load();
      const keys = Object.keys(allPartners);

      if (keys.length === 0) {
        return interaction.editReply({ content: "❌ O banco de dados de parcerias já está vazio!" });
      }

      // Varre o banco de dados e apaga todas as chaves de forma segura para o MongoDB
      for (const key of keys) {
        try {
            if (typeof partnersStore.delete === 'function') {
                await partnersStore.delete(key);
            } else {
                await partnersStore.update(key, () => undefined);
            }
        } catch (e) {
            console.error(`Erro ao apagar a chave ${key}:`, e);
        }
      }

      return interaction.editReply({ content: `✅ Limpeza concluída com sucesso! **${keys.length}** parcerias foram permanentemente apagadas do banco de dados.` });
    }
  }
};