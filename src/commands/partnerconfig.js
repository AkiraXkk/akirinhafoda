const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  MessageFlags, } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../config/guildConfig");
const { createDataStore } = require("../store/dataStore");

const partnersStore = createDataStore("partners.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("partnerconfig")
    .setDescription("configuracoes administrativas do sistema de parceria")
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
      sub.setName("boostrole")
        .setDescription("configura o cargo VIP para parceiros com AutoBump")
        .addRoleOption(o => o.setName("cargo").setDescription("Cargo de Parceiro Boost").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("info")
        .setDescription("consulta os detalhes de uma parceria especifica")
        .addStringOption(o => o.setName("id").setDescription("ID da parceria (ex: PARC12345)").setRequired(true))
    )
    // ==========================================
    // NOVO SUBCOMANDO: LIST (VISÃO DE ADMIN)
    // ==========================================
    .addSubcommand(sub =>
      sub.setName("list")
        .setDescription("lista TODAS as parcerias ativas do servidor")
    )
    .addSubcommand(sub =>
      sub.setName("clear")
        .setDescription("apaga TODAS as parcerias do banco de dados (Reset)")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guildId } = interaction;
    
    let guildConfig = await getGuildConfig(guildId) || {};
    if (!guildConfig.partnership) guildConfig.partnership = { enabledForAll: false, ranks: {} };
    let pConfig = guildConfig.partnership;

    if (sub === "set") {
      const logChan = interaction.options.getChannel("logs");
      const active = interaction.options.getBoolean("ativo");
      const staffRole = interaction.options.getRole("staff_ping");

      if (logChan) pConfig.logChannelId = logChan.id;
      if (active !== null) pConfig.enabledForAll = active;
      if (staffRole) pConfig.staffPingRoleId = staffRole.id; 

      await setGuildConfig(guildId, { partnership: pConfig });
      return interaction.reply({ content: "✅ Configurações básicas de parceria atualizadas.", flags: MessageFlags.Ephemeral });
    }

    if (sub === "ranks") {
      pConfig.ranks = {
        bronze: interaction.options.getRole("bronze").id,
        prata: interaction.options.getRole("prata").id,
        ouro: interaction.options.getRole("ouro").id
      };
      await setGuildConfig(guildId, { partnership: pConfig });
      return interaction.reply({ content: "✅ Cargos de Ranking configurados com sucesso.", flags: MessageFlags.Ephemeral });
    }

    if (sub === "boostrole") {
      pConfig.boostRole = interaction.options.getRole("cargo").id;
      await setGuildConfig(guildId, { partnership: pConfig });
      return interaction.reply({ content: "✅ Cargo VIP de **Parceiro Boost** configurado com sucesso!", flags: MessageFlags.Ephemeral });
    }

    if (sub === "info") {
      const partners = await partnersStore.load();
      const searchId = interaction.options.getString("id").toUpperCase();
      const data = partners[searchId];

      if (!data) return interaction.reply({ content: "❌ Nenhuma parceria encontrada com este ID.", flags: MessageFlags.Ephemeral });

      const embed = new EmbedBuilder()
        .setTitle(`Ficha Técnica - ${data.id}`)
        .setColor(data.status === "accepted" ? 0x00FF00 : (data.status === "pending" ? 0xFFFF00 : 0xFF0000))
        .addFields(
          { name: "Servidor", value: data.serverName, inline: true },
          { name: "Tier", value: data.tier || "Não definido", inline: true },
          { name: "Membros Reais", value: `${data.memberCount}`, inline: true },
          { name: "Representante", value: `<@${data.requesterId}>`, inline: true },
          { name: "Status", value: data.status.toUpperCase(), inline: true },
          { name: "AutoBump VIP?", value: data.autoBump ? "✅ Ativo" : "❌ Inativo", inline: true },
          { name: "Link", value: `[Clique aqui](${data.inviteLink})`, inline: true }
        )
        .setFooter({ text: `Solicitado em: ${new Date(data.date).toLocaleDateString('pt-BR')}` });

      if (data.processedBy) embed.addFields({ name: "Processado por", value: `<@${data.processedBy}>`, inline: false });
      if (data.reason) embed.addFields({ name: "Motivo da Recusa", value: data.reason, inline: false });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ==========================================
    // EXECUÇÃO DA NOVA LISTA DE ADMIN
    // ==========================================
    if (sub === "list") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const allPartners = await partnersStore.load();
      const activePartners = Object.values(allPartners).filter(p => p.status === "accepted");

      if (activePartners.length === 0) {
        return interaction.editReply({ content: "❌ Não há nenhuma parceria ativa no momento." });
      }

      const embedList = new EmbedBuilder()
        .setTitle("🤝 Parcerias Ativas (Painel Admin)")
        .setColor(0x3498db)
        .setDescription(`Temos um total de **${activePartners.length}** parceria(s) fechada(s) e ativa(s) no banco de dados.`);

      // Exibe até 25 parcerias (limite do Discord para Embed Fields)
      activePartners.slice(0, 25).forEach(p => {
        embedList.addFields({
          name: `🔰 ${p.serverName} (${p.tier || "Bronze"})`,
          value: `**ID:** \`${p.id}\`\n**Rep:** <@${p.requesterId}>\n**Staff:** <@${p.processedBy}>\n**Link:** [Convite](${p.inviteLink})`,
          inline: true
        });
      });

      if (activePartners.length > 25) {
        embedList.setFooter({ text: `Mostrando as primeiras 25 de ${activePartners.length} parcerias.` });
      }

      return interaction.editReply({ embeds: [embedList] });
    }

    if (sub === "clear") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const allPartners = await partnersStore.load();
      const keys = Object.keys(allPartners);
      if (keys.length === 0) return interaction.editReply({ content: "❌ O banco de dados já está vazio!" });

      for (const key of keys) {
        try {
            await partnersStore.update(key, (data) => { if (data) data.status = "deleted"; return data; });
            if (typeof partnersStore.delete === 'function') await partnersStore.delete(key);
        } catch (e) {}
      }
      return interaction.editReply({ content: `✅ Limpeza forçada concluída! **${keys.length}** parcerias removidas.` });
    }
  }
};
