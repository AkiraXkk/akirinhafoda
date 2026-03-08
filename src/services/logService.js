const { getGuildConfig } = require("../config/guildConfig");
const { createEmbed } = require("../embeds");
const { logger: defaultLogger } = require("../logger");

function createLogService({ client }) {
  // Cores baseadas em Tier VIP
  function getTierColor(tierName) {
    const colors = {
      'ouro': 0xffd700,      // Amarelo/Dourado
      'gold': 0xffd700,      // Amarelo/Dourado
      'diamante': 0x00ffff,  // Ciano
      'diamond': 0x00ffff,   // Ciano
      'imperial': 0x9b59b6,  // Roxo
      'prata': 0xc0c0c0,     // Cinza prateado
      'silver': 0xc0c0c0,    // Cinza prateado
      'bronze': 0xcd7f32,    // Laranja bronze
      'vip': 0x2ecc71,       // Verde padrão
      'padrão': 0x2ecc71,    // Verde padrão
    };
    
    if (!tierName) return 0x2ecc71; // Verde padrão
    
    const normalizedName = tierName.toLowerCase().trim();
    return colors[normalizedName] || 0x2ecc71;
  }

  async function log(guild, { title, description, color, fields, user, tierName, transactionId }) {
    if (!guild) return;
    const config = await getGuildConfig(guild.id);
    if (!config.logsChannelId) return;

    const channel = guild.channels.cache.get(config.logsChannelId);
    if (!channel) return;

    // Se tiver tierName, usa cor correspondente
    const finalColor = color || (tierName ? getTierColor(tierName) : 0x3498db);

    // Formata o footer com transaction ID se fornecido
    const footer = transactionId 
      ? { text: `Log de Auditoria • ID: ${transactionId}` }
      : { text: `Log de Auditoria` };

    const embed = createEmbed({
      title,
      description,
      color: finalColor,
      fields,
      footer,
      timestamp: true,
      user
    });

    await channel.send({ embeds: [embed] }).catch((err) => {
      defaultLogger.warn({ err, channelId: channel.id }, "Falha ao enviar log embed");
    });
  }

  // Função específica para logs VIP
  async function logVipAction(guild, { 
    action, 
    targetUser, 
    staffUser, 
    tierConfig, 
    duration, 
    price, 
    paymentMethod,
    transactionId,
    error 
  }) {
    if (!guild) return;

    const config = await getGuildConfig(guild.id);
    if (!config.logsChannelId) return;

    const channel = guild.channels.cache.get(config.logsChannelId);
    if (!channel) return;

    const isSuccess = !error;
    const tierColor = tierConfig?.name ? getTierColor(tierConfig.name) : 0x2ecc71;
    
    // Formata o Tier com cargo se existir
    let tierDisplay = tierConfig?.name || 'Padrão';
    if (tierConfig?.roleId) {
      const role = guild.roles.cache.get(tierConfig.roleId);
      if (role) {
        tierDisplay = `${tierConfig.name} (${role.toString()})`;
      }
    }

    const executorLabel = staffUser ? '🎫 Executor' : '🤖 Executor';
    const executorValue = staffUser
      ? `${staffUser.username} (${staffUser.id})`
      : 'Sistema';
    const targetValue = targetUser
      ? `${targetUser.username} (${targetUser.id})`
      : 'Desconhecido (N/A)';

    const fields = [
      {
        name: executorLabel,
        value: executorValue,
        inline: true,
      },
      {
        name: '👤 Alvo',
        value: targetValue,
        inline: true,
      },
      {
        name: '💎 Tier',
        value: tierDisplay,
        inline: true,
      },
    ];

    if (duration !== undefined) {
      fields.push({
        name: '📅 Duração',
        value: duration === 0 ? 'Permanente' : `${duration} dias`,
        inline: true
      });
    }

    if (price !== undefined) {
      fields.push({
        name: '💰 Valor',
        value: paymentMethod === 'coins' ? `${price} WDA Coins` : `R$ ${price}`,
        inline: true
      });
    }

    if (paymentMethod) {
      fields.push({
        name: '💳 Método',
        value: paymentMethod === 'coins' ? 'WDA Coins' : 'Pagamento Real',
        inline: true
      });
    }

    if (error) {
      fields.push({
        name: '❌ Erro',
        value: error,
        inline: false
      });
    }

    const embed = createEmbed({
      title: `${isSuccess ? '✅' : '❌'} VIP ${action}`,
      description: isSuccess 
        ? `VIP **${action}** executado por **${staffUser?.username || 'Sistema'}** para **${targetUser?.username || 'Desconhecido'}**.`
        : `Falha ao executar VIP **${action}** para **${targetUser?.username || 'Desconhecido'}**.`,
      color: isSuccess ? tierColor : 0xe74c3c,
      fields,
      footer: transactionId ? { text: `Log de Auditoria • ID: ${transactionId}` } : { text: `Log de Auditoria` },
      timestamp: true,
      user: staffUser
    });

    await channel.send({ embeds: [embed] }).catch((err) => {
      defaultLogger.warn({ err, channelId: channel.id }, "Falha ao enviar log VIP embed");
    });
  }

  return { log, logVipAction };
}

module.exports = { createLogService };
