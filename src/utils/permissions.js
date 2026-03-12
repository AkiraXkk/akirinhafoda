const { PermissionFlagsBits,
  MessageFlags, } = require("discord.js");
const { getGuildConfig } = require("../config/guildConfig");

/**
 * Verifica se um usuário tem permissão para usar um comando
 * @param {CommandInteraction} interaction - Interação do Discord
 * @param {Object} options - Opções de verificação
 * @param {boolean} options.adminOnly - Se apenas admins podem usar
 * @param {boolean} options.checkStaff - Se deve verificar cargos de staff
 * @param {boolean} options.checkChannel - Se deve verificar canal permitido
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
async function checkCommandPermissions(interaction, options = {}) {
  const { adminOnly = false, checkStaff = false, checkChannel = true } = options;
  
  // Se não tiver guild, permitir (para DMs, embora não devia acontecer)
  if (!interaction.guild) return { allowed: true };

  const member = interaction.member;
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;

  try {
    const guildConfig = await getGuildConfig(guildId);
    
    // 1. Verificar se é admin
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return { allowed: true };
    }

    // 2. Se o comando é admin only, negar
    if (adminOnly) {
      return { allowed: false, reason: "Apenas administradores podem usar este comando." };
    }

    // 3. Verificar se tem bypass de canais
    const bypassRoles = guildConfig.channelBypassRoles || [];
    const hasBypass = member.roles.cache.some(role => bypassRoles.includes(role.id));
    
    // 4. Verificar canais permitidos (se não tiver bypass)
    if (checkChannel && !hasBypass) {
      const allowedChannels = guildConfig.allowedChannels || [];
      
      // Se não há canais configurados, permitir em todos
      if (allowedChannels.length > 0 && !allowedChannels.includes(channelId)) {
        return { 
          allowed: false, 
          reason: "Este comando só pode ser usado nos canais permitidos." 
        };
      }
    }

    // 5. Verificar se é staff autorizado
    if (checkStaff) {
      const authorizedStaff = guildConfig.authorizedVipStaff || [];
      const isStaff = member.roles.cache.some(role => authorizedStaff.includes(role.id));
      
      if (!isStaff) {
        return { 
          allowed: false, 
          reason: "Apenas staff autorizado pode usar este comando." 
        };
      }
    }

    return { allowed: true };

  } catch (error) {
    console.error("Erro ao verificar permissões:", error);
    // Em caso de erro, permitir para não quebrar funcionalidade
    return { allowed: true };
  }
}

/**
 * Middleware para aplicar verificação de permissões em comandos
 * @param {Function} execute - Função execute original do comando
 * @param {Object} options - Opções de verificação
 * @returns {Function} - Função execute com verificação
 */
function withPermissionCheck(execute, options = {}) {
  return async (interaction, ...args) => {
    const check = await checkCommandPermissions(interaction, options);
    
    if (!check.allowed) {
      const { createErrorEmbed } = require("../embeds");
      return interaction.reply({
        embeds: [createErrorEmbed(check.reason || "Sem permissão para usar este comando.")],
        flags: MessageFlags.Ephemeral,
      });
    }

    return execute(interaction, ...args);
  };
}

module.exports = {
  checkCommandPermissions,
  withPermissionCheck,
};
