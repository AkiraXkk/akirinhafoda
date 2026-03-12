const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { createDataStore } = require("../store/dataStore");

// Banco de dados para os sorteios
const giveawayStore = createDataStore("eventos_sorteios.json");

// Função para converter "10m", "1h", "2d" em milissegundos
function parseTime(timeStr) {
  const regex = /^(\d+)\s*([smhd])$/i;
  const match = timeStr.trim().match(regex);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 's') return val * 1000;
  if (unit === 'm') return val * 60 * 1000;
  if (unit === 'h') return val * 60 * 60 * 1000;
  if (unit === 'd') return val * 24 * 60 * 60 * 1000;
  return null;
}

// ==========================================
// MÁQUINA PRINCIPAL DE SORTEIO
// ==========================================
async function encerrarSorteio(client, messageId, channelId, isReroll = false) {
  const dados = await giveawayStore.load();
  const gw = dados[messageId];

  if (!gw || (gw.ended && !isReroll)) return;

  try {
    const channel = await client.channels.fetch(channelId);
    const message = await channel.messages.fetch(messageId).catch(() => null);

    if (!message) return;

    let winnersText = "Ninguém participou 😢";
    let winArray = [];

    // Lógica de Sorteio (Fisher-Yates parcial)
    if (gw.participantes.length > 0) {
      const pool = [...gw.participantes];
      const numGanhadores = Math.min(gw.vencedores, pool.length);
      const minIndex = pool.length - numGanhadores;
      for (let i = pool.length - 1; i >= minIndex && i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      winArray = pool.slice(minIndex);
      winnersText = winArray.map(id => `<@${id}>`).join(", ");
    }

    const tituloEmbed = isReroll ? `🎁 Sorteio: ${gw.premio} (NOVO GIRO)` : `🎁 Sorteio Encerrado: ${gw.premio}`;

    const embed = EmbedBuilder.from(message.embeds[0])
      .setColor("#95a5a6")
      .setTitle(tituloEmbed)
      .setDescription(
        `🏆 **Vencedor(es):** ${winnersText}\n` +
        `🎁 **Prêmio:** ${gw.premio}\n` +
        `${gw.patrocinador ? `🤝 **Patrocínio:** <@${gw.patrocinador}>\n` : ""}` +
        `👥 **Total de Participantes:** ${gw.participantes.length}`
      );

    const disabledButton = new ButtonBuilder()
      .setCustomId("evento_participar")
      .setLabel(`Encerrado (${gw.participantes.length})`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    await message.edit({ embeds: [embed], components: [new ActionRowBuilder().addComponents(disabledButton)] });

    // Anuncia os vencedores no chat
    if (winArray.length > 0) {
      await channel.send({ content: `🎊 Parabéns ${winnersText}! Vocês ganharam **${gw.premio}**! ${isReroll ? "(Resultado do Reroll)" : ""}\n[Ir para o Sorteio](https://discord.com/channels/${message.guild.id}/${channelId}/${messageId})` });
    } else {
      if (!isReroll) await channel.send({ content: `O sorteio de **${gw.premio}** foi encerrado sem participantes suficientes.` });
    }

  } catch (e) {
    console.error(`Erro ao encerrar sorteio ${messageId}:`, e);
  }

  if (!isReroll) {
    await giveawayStore.update(messageId, (info) => ({ ...info, ended: true }));
  }
}

module.exports = {
  // ==========================================
  // O CORAÇÃO DO ANTI-CRASH (Chamado pelo index.js)
  // ==========================================
  async checkSorteios(client) {
    const dados = await giveawayStore.load();
    const now = Date.now();

    for (const [msgId, gw] of Object.entries(dados)) {
      if (msgId === "counters") continue;
      // Se não acabou, o tempo passou e não é um DROP (drop não tem tempo)
      if (!gw.ended && gw.endTime <= now && gw.tipo !== "drop") {
        await encerrarSorteio(client, msgId, gw.channelId, false);
      }
    }
  },

  data: new SlashCommandBuilder()
    .setName("evento")
    .setDescription("Sistema avançado da equipe de Eventos")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    .addSubcommand(sub => 
      sub.setName("painel").setDescription("Cria o painel de criação rápida de anúncios")
    )

    .addSubcommand(sub => 
      sub.setName("sortear")
      .setDescription("Inicia um sorteio avançado no chat atual")
      .addStringOption(opt => opt.setName("premio").setDescription("Nome do prêmio").setRequired(true))
      .addStringOption(opt => opt.setName("duracao").setDescription("Duração (Ex: 10m, 1h, 1d)").setRequired(true))
      .addIntegerOption(opt => opt.setName("vencedores").setDescription("Quantidade de ganhadores").setRequired(true).setMinValue(1))
      .addStringOption(opt => opt.setName("descricao").setDescription("Descrição ou regras do sorteio").setRequired(false)) // 🟢 NOVA OPÇÃO
      .addAttachmentOption(opt => opt.setName("imagem").setDescription("Imagem ou banner do sorteio").setRequired(false)) // 🟢 NOVA OPÇÃO
      .addRoleOption(opt => opt.setName("requisito_cargo").setDescription("Cargo obrigatório").setRequired(false))
      .addIntegerOption(opt => opt.setName("requisito_dias").setDescription("Dias mínimos no servidor para participar").setRequired(false).setMinValue(1))
      .addUserOption(opt => opt.setName("patrocinador").setDescription("Quem doou o prêmio?").setRequired(false))
      .addRoleOption(opt => opt.setName("ping").setDescription("Cargo para mencionar ao abrir").setRequired(false))
    )

    .addSubcommand(sub => 
      sub.setName("drop")
      .setDescription("Solta um prêmio rápido! O primeiro a clicar ganha.")
      .addStringOption(opt => opt.setName("premio").setDescription("Nome do prêmio").setRequired(true))
      .addUserOption(opt => opt.setName("patrocinador").setDescription("Quem doou?").setRequired(false))
    )

    .addSubcommand(sub => 
      sub.setName("reroll")
      .setDescription("Sorteia um novo vencedor para um sorteio já encerrado")
      .addStringOption(opt => opt.setName("id_mensagem").setDescription("O ID da mensagem do sorteio").setRequired(true))
    )

    .addSubcommand(sub => 
      sub.setName("cancelar")
      .setDescription("Cancela um sorteio que está em andamento")
      .addStringOption(opt => opt.setName("id_mensagem").setDescription("O ID da mensagem do sorteio").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ==========================================
    // PAINEL DE EVENTOS (ANÚNCIOS)
    // ==========================================
    if (sub === "painel") {
      const embedPainel = new EmbedBuilder()
        .setTitle("🎉 Painel de Gestão de Eventos")
        .setColor("#2ecc71")
        .setDescription("Utilize os botões abaixo para criar anúncios oficiais de eventos no servidor.");

      const btnCriar = new ButtonBuilder().setCustomId("evento_modal_criar").setLabel("📝 Anunciar Evento").setStyle(ButtonStyle.Success).setEmoji("📢");
      const row = new ActionRowBuilder().addComponents(btnCriar);

      await interaction.reply({ embeds: [embedPainel], components: [row], ephemeral: true });
      await interaction.channel.send({ embeds: [embedPainel], components: [row] });
    }

    // ==========================================
    // INICIAR SORTEIO AVANÇADO
    // ==========================================
    if (sub === "sortear") {
      const premio = interaction.options.getString("premio");
      const duracaoStr = interaction.options.getString("duracao");
      const vencedores = interaction.options.getInteger("vencedores");
      const descricao = interaction.options.getString("descricao"); // 🟢 EXTRAINDO A DESCRIÇÃO
      const imagem = interaction.options.getAttachment("imagem"); // 🟢 EXTRAINDO A IMAGEM
      const requisitoCargo = interaction.options.getRole("requisito_cargo");
      const requisitoDias = interaction.options.getInteger("requisito_dias");
      const patrocinador = interaction.options.getUser("patrocinador");
      const ping = interaction.options.getRole("ping");

      const tempoMs = parseTime(duracaoStr);
      if (!tempoMs) {
        return interaction.reply({ content: "❌ Formato de tempo inválido! Use algo como `10m`, `2h` ou `1d`.", flags: MessageFlags.Ephemeral });
      }

      const dataFim = Date.now() + tempoMs;

      // 🟢 MONTANDO A DESCRIÇÃO COM A NOVA OPÇÃO
      let desc = descricao ? `**Detalhes:** ${descricao}\n\n` : "";
      desc += `Clique no botão abaixo para participar!\n\n🏆 **Vencedores:** ${vencedores}\n⏳ **Termina em:** <t:${Math.floor(dataFim / 1000)}:R>\n\n**Requisitos:**\n`;
      desc += requisitoCargo ? `🔸 Cargo: <@&${requisitoCargo.id}>\n` : "🔸 Cargo: Livre\n";
      desc += requisitoDias ? `🔸 Conta no servidor: Mínimo ${requisitoDias} dias\n` : "";
      if (patrocinador) desc += `\n🤝 **Patrocinador:** ${patrocinador}\n`;

      const embed = new EmbedBuilder()
        .setTitle(`🎁 Sorteio: ${premio}`)
        .setColor("#f1c40f")
        .setDescription(desc)
        .setFooter({ text: `Criado por ${interaction.user.username}` })
        .setTimestamp(dataFim);

      // 🟢 INJETANDO A IMAGEM SE O USUÁRIO ENVIOU
      if (imagem) {
        embed.setImage(imagem.url);
      }

      const btnParticipar = new ButtonBuilder().setCustomId("evento_participar").setLabel("Participar (0)").setStyle(ButtonStyle.Primary).setEmoji("🎉");
      const row = new ActionRowBuilder().addComponents(btnParticipar);

      const msgContent = ping ? `<@&${ping.id}> Novo sorteio aberto!` : null;

      const msg = await interaction.reply({ content: msgContent, embeds: [embed], components: [row], fetchReply: true, withResponse: true });
      const msgReal = msg.resource ? msg.resource.message : await interaction.fetchReply();

      await giveawayStore.update(msgReal.id, () => ({
        tipo: "sorteio",
        channelId: interaction.channelId,
        premio: premio,
        vencedores: vencedores,
        requisitoCargo: requisitoCargo ? requisitoCargo.id : null,
        requisitoDias: requisitoDias || null,
        patrocinador: patrocinador ? patrocinador.id : null,
        endTime: dataFim,
        participantes: [],
        ended: false
      }));

      // Inicia o timer local (se o bot cair, o index.js cobre)
      setTimeout(() => {
        encerrarSorteio(interaction.client, msgReal.id, interaction.channelId);
      }, tempoMs);
    }

    // ==========================================
    // INICIAR EVENTO DROP (Rápido)
    // ==========================================
    if (sub === "drop") {
      const premio = interaction.options.getString("premio");
      const patrocinador = interaction.options.getUser("patrocinador");

      const embed = new EmbedBuilder()
        .setTitle(`⚡ DROP WDA: ${premio}`)
        .setColor("#e74c3c")
        .setDescription(`O primeiro a clicar no botão leva o prêmio na hora!\n\n${patrocinador ? `🤝 Patrocinador: ${patrocinador}` : ""}`)
        .setFooter({ text: "Seja rápido!" });

      const btnDrop = new ButtonBuilder().setCustomId("evento_drop_pegar").setLabel("Pegar Prêmio!").setStyle(ButtonStyle.Danger).setEmoji("🎁");
      const row = new ActionRowBuilder().addComponents(btnDrop);

      const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true, withResponse: true });
      const msgReal = msg.resource ? msg.resource.message : await interaction.fetchReply();

      await giveawayStore.update(msgReal.id, () => ({
        tipo: "drop",
        channelId: interaction.channelId,
        premio: premio,
        ended: false
      }));
    }

    // ==========================================
    // REROLL E CANCELAR
    // ==========================================
    if (sub === "reroll") {
      const msgId = interaction.options.getString("id_mensagem");
      const dados = await giveawayStore.load();
      const gw = dados[msgId];

      if (!gw) return interaction.reply({ content: "❌ Sorteio não encontrado.", flags: MessageFlags.Ephemeral });
      if (!gw.ended) return interaction.reply({ content: "❌ Este sorteio ainda está rolando!", flags: MessageFlags.Ephemeral });
      if (gw.participantes.length === 0) return interaction.reply({ content: "❌ Ninguém participou.", flags: MessageFlags.Ephemeral });

      await interaction.reply({ content: "🎲 Girando a roleta novamente...", flags: MessageFlags.Ephemeral });
      await encerrarSorteio(interaction.client, msgId, gw.channelId, true);
    }

    if (sub === "cancelar") {
      const msgId = interaction.options.getString("id_mensagem");
      const dados = await giveawayStore.load();
      const gw = dados[msgId];

      if (!gw) return interaction.reply({ content: "❌ Sorteio não encontrado.", flags: MessageFlags.Ephemeral });
      if (gw.ended) return interaction.reply({ content: "❌ Este sorteio já acabou.", flags: MessageFlags.Ephemeral });

      await giveawayStore.update(msgId, (info) => ({ ...info, ended: true }));

      try {
        const channel = await interaction.client.channels.fetch(gw.channelId);
        const message = await channel.messages.fetch(msgId);

        const embedCancelado = EmbedBuilder.from(message.embeds[0])
          .setColor("#e74c3c")
          .setTitle(`🚫 Sorteio Cancelado: ${gw.premio}`)
          .setDescription("Este sorteio foi cancelado pela administração.");

        const btnCancelado = new ButtonBuilder().setCustomId("null").setLabel("Cancelado").setStyle(ButtonStyle.Danger).setDisabled(true);
        await message.edit({ embeds: [embedCancelado], components: [new ActionRowBuilder().addComponents(btnCancelado)] });
      } catch (e) {}

      await interaction.reply({ content: "✅ Sorteio cancelado com sucesso!", flags: MessageFlags.Ephemeral });
    }
  },

  // ==========================================
  // HANDLERS (Botões e Modal)
  // ==========================================
  async handleButton(interaction) {

    // Participar do Sorteio Normal
    if (interaction.customId === "evento_participar") {
      // 🛠️ BUG FIX: deferUpdate() permite atualizar a mensagem E usar followUp() ephemeral.
      await interaction.deferUpdate();
      const gwData = await giveawayStore.load();
      const gw = gwData[interaction.message.id];

      if (!gw || gw.tipo !== "sorteio") return interaction.followUp({ content: "❌ Sorteio inválido.", flags: MessageFlags.Ephemeral });
      if (gw.ended) return interaction.followUp({ content: "❌ Este sorteio já foi encerrado!", flags: MessageFlags.Ephemeral });

      // Verificação de Cargo
      if (gw.requisitoCargo && !interaction.member.roles.cache.has(gw.requisitoCargo)) {
        return interaction.followUp({ content: `❌ Você precisa do cargo <@&${gw.requisitoCargo}> para participar!`, flags: MessageFlags.Ephemeral });
      }

      // Verificação de Dias no Servidor
      if (gw.requisitoDias) {
        const diasNoServer = Math.floor((Date.now() - interaction.member.joinedTimestamp) / (1000 * 60 * 60 * 24));
        if (diasNoServer < gw.requisitoDias) {
          return interaction.followUp({ content: `❌ Você precisa ter no mínimo **${gw.requisitoDias} dias** no servidor para participar (Você tem ${diasNoServer} dias).`, flags: MessageFlags.Ephemeral });
        }
      }

      let novosParticipantes = [...gw.participantes];
      let entrou = false;

      if (novosParticipantes.includes(interaction.user.id)) {
        novosParticipantes = novosParticipantes.filter(id => id !== interaction.user.id);
      } else {
        novosParticipantes.push(interaction.user.id);
        entrou = true;
      }

      await giveawayStore.update(interaction.message.id, (info) => ({ ...info, participantes: novosParticipantes }));

      const novoBotao = new ButtonBuilder().setCustomId("evento_participar").setLabel(`Participar (${novosParticipantes.length})`).setStyle(ButtonStyle.Primary).setEmoji("🎉");
      // 🛠️ BUG FIX: editReply() após deferUpdate() atualiza a mensagem original corretamente.
      await interaction.editReply({ components: [new ActionRowBuilder().addComponents(novoBotao)] });
      await interaction.followUp({ content: entrou ? "✅ Você **entrou** no sorteio! Boa sorte!" : "👋 Você **saiu** do sorteio.", flags: MessageFlags.Ephemeral });
    }

    // Pegar o DROP
    if (interaction.customId === "evento_drop_pegar") {
      // 🛠️ BUG FIX: deferUpdate() para poder atualizar a mensagem pública E usar followUp() para erros.
      await interaction.deferUpdate();
      const gwData = await giveawayStore.load();
      const gw = gwData[interaction.message.id];

      if (!gw || gw.tipo !== "drop") return interaction.followUp({ content: "❌ Drop inválido.", flags: MessageFlags.Ephemeral });
      if (gw.ended) return interaction.followUp({ content: "❌ Alguém foi mais rápido e já pegou!", flags: MessageFlags.Ephemeral });

      // Marca como finalizado para ninguém mais pegar
      await giveawayStore.update(interaction.message.id, (info) => ({ ...info, ended: true }));

      const embedWin = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor("#2ecc71")
        .setTitle(`⚡ DROP RESGATADO: ${gw.premio}`)
        .setDescription(`🏆 **Vencedor:** ${interaction.user} foi o mais rápido e levou o prêmio!`);

      const btnWinner = new ButtonBuilder().setCustomId("null").setLabel(`Pego por ${interaction.user.username}`).setStyle(ButtonStyle.Secondary).setDisabled(true);

      // 🛠️ BUG FIX: editReply() após deferUpdate() atualiza a mensagem do drop corretamente.
      await interaction.editReply({ embeds: [embedWin], components: [new ActionRowBuilder().addComponents(btnWinner)] });
      await interaction.channel.send({ content: `🎊 O dedo mais rápido do oeste! ${interaction.user} pegou **${gw.premio}** no Drop!` });
    }

    // Abrir Modal do Painel
    if (interaction.customId === "evento_modal_criar") {
      // 🛠️ BUG FIX: Removido o deferUpdate() que impedia o showModal() de funcionar.
      const modal = new ModalBuilder().setCustomId("evento_submit").setTitle("Anúncio de Evento");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ev_titulo").setLabel("Nome do Evento").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ev_desc").setLabel("Descrição e Regras").setStyle(TextInputStyle.Paragraph).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ev_data").setLabel("Data e Horário").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ev_premio").setLabel("Premiação (Opcional)").setStyle(TextInputStyle.Short).setRequired(false))
      );
      await interaction.showModal(modal);
    }
  },

  async handleModal(interaction) {
    if (interaction.customId === "evento_submit") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

      const titulo = interaction.fields.getTextInputValue("ev_titulo");
      const desc = interaction.fields.getTextInputValue("ev_desc");
      const data = interaction.fields.getTextInputValue("ev_data");
      const premio = interaction.fields.getTextInputValue("ev_premio");

      const embedEvento = new EmbedBuilder()
        .setTitle(`🎉 EVENTO: ${titulo}`)
        .setColor("#2ecc71")
        .setDescription(`\n${desc}\n\n📅 **Quando:** ${data}${premio ? `\n🏆 **Prêmio:** ${premio}` : ""}`)
        .setFooter({ text: `Evento organizado por ${interaction.user.username}` });

      const canalAnuncio = interaction.guild.channels.cache.find(c => c.name.includes("avisos")) || interaction.channel;
      await canalAnuncio.send({ content: "@everyone Um novo evento vai começar!", embeds: [embedEvento] });
      await interaction.editReply({ content: `✅ Evento anunciado com sucesso em ${canalAnuncio}!` });
    }
  }
};