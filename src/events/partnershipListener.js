const { Events, ActionRowBuilder, ButtonBuilder } = require("discord.js");
const { logger } = require("../logger");
const { createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig } = require("../config/guildConfig");

const partnersStore = createDataStore("partners.json");
const staffStatsStore = createDataStore("staff_stats.json");

// ID DO CANAL DE PARCERIAS - EDITE AQUI
const CANAL_PARCERIAS_ID = "COLOQUE_O_ID_DO_CANAL_AQUI";

// Regex para encontrar links do Discord
const DISCORD_LINK_REGEX = /(https?:\/\/)?(www\.)?(discord\.gg\/|discord\.com\/invite\/)[a-zA-Z0-9-]+/g;

// Regex para encontrar URLs de imagem
const IMAGE_URL_REGEX = /(https?:\/\/(?:www\.)?(?:i\.)?imgur\.com\/[a-zA-Z0-9]+\.(?:png|jpg|jpeg|gif)|https?:\/\/(?:www\.)?discord\.com\/attachments\/\d+\/\d+\/[a-zA-Z0-9-]+\.(?:png|jpg|jpeg|gif))/g;

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    // Ignorar bots e mensagens fora de guilds
    if (message.author.bot || !message.guild) return;

    // Verificar se a mensagem foi enviada no canal de parcerias
    if (message.channelId !== CANAL_PARCERIAS_ID) return;

    // Se o canal não foi configurado, não faz nada
    if (CANAL_PARCERIAS_ID === "COLOQUE_O_ID_DO_CANAL_AQUI") return;

    try {
      await processarParceriaAutomatica(message, client);
    } catch (error) {
      logger.error({ err: error, messageId: message.id }, "Erro ao processar parceria automática");
      
      // Envia erro apenas para o usuário que tentou
      message.reply({
        embeds: [createErrorEmbed("Ocorreu um erro ao processar sua parceria. Tente novamente ou contate um administrador.")],
        ephemeral: true
      }).catch(() => {});
    }
  }
};

async function processarParceriaAutomatica(message, client) {
  const responsavel = message.author;
  const canal = message.channel;

  // Extrair informações da mensagem
  const dadosParceria = await extrairDadosMensagem(message);
  
  // Se não encontrou representante, pedir para marcar
  if (!dadosParceria.representante) {
    await message.reply({
      embeds: [createErrorEmbed("Por favor, marque o representante do servidor na mensagem (use @usuário).")],
      ephemeral: true
    });
    return; // Não apaga a mensagem original
  }

  // Se não encontrou link do Discord, pedir para adicionar
  if (!dadosParceria.link) {
    await message.reply({
      embeds: [createErrorEmbed("Por favor, inclua um link de convite do Discord (discord.gg/... ou discord.com/invite/...).")],
      ephemeral: true
    });
    return; // Não apaga a mensagem original
  }

  // Buscar informações do convite
  let inviteData;
  try {
    inviteData = await client.fetchInvite(dadosParceria.link).catch(() => null);
  } catch (error) {
    await message.reply({
      embeds: [createErrorEmbed("Não foi possível validar o link de convite. Verifique se o link está correto e se o servidor não está banido.")],
      ephemeral: true
    });
    return; // Não apaga a mensagem original
  }

  if (!inviteData) {
    await message.reply({
      embeds: [createErrorEmbed("Convite inválido ou expirado. Por favor, verifique o link e tente novamente.")],
      ephemeral: true
    });
    return; // Não apaga a mensagem original
  }

  // Determinar o tier baseado nos membros
  const memberCount = inviteData.memberCount || 0;
  let tier = "Bronze";
  if (memberCount >= 1000) tier = "Ouro";
  else if (memberCount >= 500) tier = "Prata";

  // Apagar mensagem original
  await message.delete().catch(() => {});

  // Criar o embed formatado (usando o mesmo design do /partnership manual)
  const embedParceria = new EmbedBuilder()
    .setTitle(`🤝 Parceria - ${dadosParceria.servidor || inviteData.guild?.name || "Servidor Desconhecido"}`)
    .setColor(tier === "Bronze" ? 0xcd7f32 : tier === "Prata" ? 0xc0c0c0 : 0xffd700)
    .setDescription(dadosParceria.descricao || "Nenhuma descrição fornecida.")
    .addFields(
      { name: "👑 Dono", value: `${responsavel}`, inline: true },
      { name: "👤 Representante", value: `${dadosParceria.representante}`, inline: true },
      { name: "👥 Membros", value: `${memberCount} membros`, inline: true },
      { name: "⭐ Tier", value: `${tier} (${memberCount}+ membros)`, inline: true },
      { name: "🔗 Convite", value: `[Clique aqui](${dadosParceria.link})`, inline: true }
    )
    .setThumbnail(inviteData.guild?.iconURL({ dynamic: true, size: 256 }))
    .setImage(dadosParceria.banner || null)
    .setFooter({ 
      text: `Parceria postada por ${responsavel.username} • ${new Date().toLocaleDateString('pt-BR')}`,
      iconURL: responsavel.displayAvatarURL({ dynamic: true })
    })
    .setTimestamp();

  // Botões de ação (mesmo do partnership manual)
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`partnership_accept_${message.id}`)
      .setLabel("✅ Aceitar")
      .setStyle("Success"),
    new ButtonBuilder()
      .setCustomId(`partnership_reject_${message.id}`)
      .setLabel("❌ Recusar")
      .setStyle("Danger")
  );

  // Enviar a mensagem formatada
  const sentMessage = await canal.send({
    content: `<@&${await getCargoStaffId(canal.guild)}> Nova parceria para análise!`,
    embeds: [embedParceria],
    components: [row]
  });

  // Salvar no banco de dados (mesma estrutura do /partnership manual)
  const dataId = `${message.guild.id}_${sentMessage.id}`;
  const data = {
    type: "manual",
    guildId: message.guildId,
    servidor: dadosParceria.servidor || inviteData.guild?.name || "Servidor Desconhecido",
    representante: dadosParceria.representante.id,
    responsavel: responsavel.id,
    convite: dadosParceria.link,
    descricao: dadosParceria.descricao || "Nenhuma descrição fornecida.",
    banner: dadosParceria.banner || null,
    tier: tier,
    memberCount: memberCount,
    status: "pending",
    messageId: sentMessage.id,
    channelId: canal.id,
    date: new Date().toISOString()
  };

  await partnersStore.update(dataId, () => data);
  await staffStatsStore.update(responsavel.id, c => ({ ...c, parcerias_fechadas: (c?.parcerias_fechadas || 0) + 1 }));

  // Dá o cargo de Parceiro ao Representante (mesma lógica do /partnership manual)
  const guildConfig = await getGuildConfig(message.guildId);
  const ranks = guildConfig?.partnership?.ranks;
  if (ranks) {
    let roleToGiveId = null;
    if (tier === "Bronze") roleToGiveId = ranks.bronze;
    else if (tier === "Prata") roleToGiveId = ranks.prata;
    else if (tier === "Ouro") roleToGiveId = ranks.ouro;
    
    if (roleToGiveId) {
      const member = await message.guild.members.fetch(dadosParceria.representante.id).catch(() => null);
      if (member) await member.roles.add(roleToGiveId).catch(() => null);
    }
  }

  // Notifica o Representante via DM (mesma lógica do /partnership manual)
  const embedDm = new EmbedBuilder()
    .setTitle("🤝 Parceria Registrada!")
    .setColor(0x00FF00)
    .setDescription(`Sua parceria para o servidor **${dadosParceria.servidor || inviteData.guild?.name || "Servidor Desconhecido"}** (Tier ${tier}) foi registrada e está em análise!`)
    .addFields({ 
      name: "⚠️ Aviso Importante", 
      value: "Caso você saia do nosso servidor, a parceria será encerrada e a mensagem de divulgação será apagada automaticamente." 
    });
  
  await dadosParceria.representante.send({ embeds: [embedDm] }).catch(() => null);

  // Confirmação para o responsável
  await responsavel.send({
    embeds: [createSuccessEmbed(`✅ Parceria (Tier ${tier}) registrada com sucesso em ${canal}!`)]
  }).catch(() => null);
}

async function extrairDadosMensagem(message) {
  const content = message.content;
  const attachments = message.attachments;
  
  // Extrair representante (primeira menção)
  const representante = message.mentions.users.first();
  
  // Extrair link do Discord
  const linkMatch = content.match(DISCORD_LINK_REGEX);
  const link = linkMatch ? linkMatch[0] : null;
  
  // Extrair banner (prioridade: anexo > URL no texto)
  let banner = null;
  if (attachments.size > 0) {
    banner = attachments.first().url;
  } else {
    const imageMatch = content.match(IMAGE_URL_REGEX);
    banner = imageMatch ? imageMatch[0] : null;
  }
  
  // Extrair servidor (primeira linha ou antes do link)
  let servidor = null;
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.trim() && !line.includes('@') && !line.match(DISCORD_LINK_REGEX) && !line.match(IMAGE_URL_REGEX)) {
      servidor = line.trim();
      break;
    }
  }
  
  // Extrair descrição (remover menções, links e URLs de imagem)
  let descricao = content;
  descricao = descricao.replace(/<@!?[\d]+>/g, ''); // Remove menções
  descricao = descricao.replace(DISCORD_LINK_REGEX, ''); // Remove links do Discord
  descricao = descricao.replace(IMAGE_URL_REGEX, ''); // Remove URLs de imagem
  
  // Remove linhas vazias e limpa
  descricao = descricao.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
  
  // Se a primeira linha era o servidor, remove da descrição
  if (servidor && descricao.startsWith(servidor)) {
    descricao = descricao.replace(servidor, '').trim();
  }
  
  return {
    representante,
    link,
    banner,
    servidor,
    descricao: descricao || "Nenhuma descrição fornecida."
  };
}

async function getCargoStaffId(guild) {
  // Buscar cargo de staff ou similar - ajuste conforme sua configuração
  const staffRole = guild.roles.cache.find(role => 
    role.name.toLowerCase().includes('staff') || 
    role.name.toLowerCase().includes('parceria') ||
    role.permissions.has("ManageMessages")
  );
  return staffRole?.id || null;
}
