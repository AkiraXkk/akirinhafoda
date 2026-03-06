const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
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
        .setDescription("configura o canal de logs e cargos da staff")
        .addChannelOption(o => o.setName("logs").setDescription("canal onde os pedidos irao chegar"))
        .addRoleOption(o => o.setName("staff").setDescription("cargo que sera mencionado nos pedidos"))
        .addBooleanOption(o => o.setName("ativo").setDescription("define se o sistema esta aberto ao publico"))
    )
    .addSubcommand(sub =>
      sub.setName("ranks")
        .setDescription("configura os cargos de ranking para quem faz parceria")
        .addRoleOption(o => o.setName("bronze").setDescription("cargo para mais de 350 membros").setRequired(true))
        .addRoleOption(o => o.setName("prata").setDescription("cargo para mais de 750 membros").setRequired(true))
        .addRoleOption(o => o.setName("ouro").setDescription("cargo para mais de 1000 membros").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("info")
        .setDescription("consulta os detalhes de uma parceria especifica")
        .addStringOption(o => o.setName("id").setDescription("digite o id da parceria gerado no log").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guildId } = interaction;
    let guildConfig = await getGuildConfig(guildId) || {};
    let pConfig = guildConfig.partnership || {};

    if (sub === "set") {
      const logChan = interaction.options.getChannel("logs");
      const role = interaction.options.getRole("staff");
      const active = interaction.options.getBoolean("ativo");

      if (logChan) pConfig.logChannelId = logChan.id;
      if (active !== null) pConfig.enabledForAll = active;

      if (role) {
        if (!Array.isArray(pConfig.staffRoles)) pConfig.staffRoles = [];
        if (pConfig.staffRoles.includes(role.id)) {
          pConfig.staffRoles = pConfig.staffRoles.filter(id => id !== role.id);
        } else {
          pConfig.staffRoles.push(role.id);
        }
      }

      await setGuildConfig(guildId, { partnership: pConfig });
      return interaction.reply({ content: "As configurações foram atualizadas e salvas.", ephemeral: true });
    }

    if (sub === "ranks") {
      pConfig.ranks = {
        bronze: interaction.options.getRole("bronze").id,
        prata: interaction.options.getRole("prata").id,
        ouro: interaction.options.getRole("ouro").id
      };

      await setGuildConfig(guildId, { partnership: pConfig });
      return interaction.reply({ content: "Os cargos de ranking foram vinculados.", ephemeral: true });
    }

    if (sub === "info") {
      const partners = await partnersStore.load();
      const searchId = interaction.options.getString("id").toUpperCase();
      const data = partners[searchId];

      if (!data) return interaction.reply({ content: "Nenhuma parceria encontrada com este ID.", ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle(`Informações do ID: ${data.id}`)
        .addFields(
          { name: "Nome do Servidor", value: data.serverName, inline: true },
          { name: "Membros Informados", value: `${data.memberCount}`, inline: true },
          { name: "Situação", value: data.status, inline: true },
          { name: "Solicitante", value: `<@${data.requesterId}>`, inline: true }
        )
        .setTimestamp(new Date(data.date));

      if (data.processedBy) {
        embed.addFields({ name: "Processado por", value: `<@${data.processedBy}>`, inline: true });
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  // === ROTEAMENTO DE BOTÕES ===
  async handleButton(interaction) {
    // Separa a estrutura: partnership_approve_12345
    const parts = interaction.customId.split("_");
    const prefix = parts[0];     // "partnership"
    const action = parts[1];     // "approve" ou "reject"
    const partnerId = parts[2];  // ID gerado no log

    // 1. APROVAÇÃO: Responder pro Discord imediatamente com deferUpdate para não dar 10062
    if (action === "approve") {
      await interaction.deferUpdate(); 
      
      const partners = await partnersStore.load();
      const data = partners[partnerId];

      if (!data) {
        return interaction.followUp({ content: "❌ Esta solicitação de parceria não existe mais no banco de dados.", ephemeral: true });
      }

      // Atualiza o status no banco de dados
      data.status = "Aprovado";
      data.processedBy = interaction.user.id;
      await partnersStore.save(partners);
      
      // Aqui você pode adicionar lógica para dar os cargos, enviar mensagem pro usuário, etc.
      return interaction.followUp({ content: `✅ Parceria com o servidor **${data.serverName}** (ID: ${partnerId}) foi **aprovada** com sucesso por <@${interaction.user.id}>!`, ephemeral: false });
    }

    // 2. RECUSA: O Modal precisa ser aberto IMEDIATAMENTE. Não use deferUpdate aqui.
    if (action === "reject") {
      const modal = new ModalBuilder()
        // customId do Modal mantém o padrão para ser capturado no split
        .setCustomId(`partnership_modal_${partnerId}`) 
        .setTitle(`Recusar Parceria`);

      const reasonInput = new TextInputBuilder()
        .setCustomId("rejectReason")
        .setLabel("Qual o motivo da recusa?")
        .setPlaceholder("Ex: Servidor não atingiu a meta de membros...")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const actionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(actionRow);

      // Abre o modal na tela do staff
      return await interaction.showModal(modal);
    }
  },

  // === ROTEAMENTO DE MODAIS ===
  async handleModal(interaction) {
    // Separa a estrutura: partnership_modal_12345
    const parts = interaction.customId.split("_");
    const partnerId = parts[2]; // Pega o ID

    // DeferUpdate porque agora precisamos processar o texto e salvar no banco
    await interaction.deferUpdate();

    const reason = interaction.fields.getTextInputValue("rejectReason");
    const partners = await partnersStore.load();
    const data = partners[partnerId];

    if (!data) {
      return interaction.followUp({ content: "❌ Esta solicitação de parceria não existe mais no banco de dados.", ephemeral: true });
    }

    // Salva a recusa no banco
    data.status = "Recusado";
    data.rejectReason = reason;
    data.processedBy = interaction.user.id;
    await partnersStore.save(partners);

    return interaction.followUp({ content: `⛔ A parceria com o servidor **${data.serverName}** (ID: ${partnerId}) foi **recusada**.\n**Motivo:** \`${reason}\``, ephemeral: false });
  }
};