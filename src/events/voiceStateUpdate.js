const { Events } = require("discord.js");
const { logger } = require("../logger");

const MINUTE_MS = 60000;
const voiceSessions = new Map();
let clientInstance = null;

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState, client) {
    // Armazenar referência do client para uso posterior
    if (!clientInstance) clientInstance = client;
    
    // Ignorar bots e membros nulos
    if (!newState.member || newState.member.user?.bot) return;

    const userId = newState.member.id;
    const guildId = newState.guild.id;

    // Usuário entrou em um canal de voz
    if (!oldState.channelId && newState.channelId) {
      const voiceChannel = newState.channel;
      
      // Verificar se não está mutado ou sozinho
      if (newState.selfMute || newState.selfDeaf) return;

      // Verificar se não está sozinho (ignorando bots)
      const nonBotMembers = voiceChannel.members.filter(m => !m.user.bot);
      if (nonBotMembers.size <= 1) return;

      // Iniciar sessão
      voiceSessions.set(userId, {
        guildId,
        channelId: newState.channelId,
        startTime: Date.now(),
        lastXpTime: Date.now()
      });

      logger.debug({ userId, guildId, channelId: newState.channelId }, "Usuário entrou em canal de voz");
    }
    // Usuário saiu do canal de voz
    else if (oldState.channelId && !newState.channelId) {
      const session = voiceSessions.get(userId);
      if (session) {
        await finalizeVoiceSession(userId, session);
        voiceSessions.delete(userId);
        logger.debug({ userId, guildId: session.guildId }, "Usuário saiu de canal de voz");
      }
    }
    // Usuário mudou de canal ou estado de mute/deafen
    else if (oldState.channelId && newState.channelId) {
      const session = voiceSessions.get(userId);
      
      if (!session) {
        // Se não tinha sessão, criar uma nova se as condições forem favoráveis
        if (!newState.selfMute && !newState.selfDeaf) {
          const voiceChannel = newState.channel;
          const nonBotMembers = voiceChannel.members.filter(m => !m.user.bot);
          if (nonBotMembers.size > 1) {
            voiceSessions.set(userId, {
              guildId,
              channelId: newState.channelId,
              startTime: Date.now(),
              lastXpTime: Date.now()
            });
          }
        }
      } else {
        // Verificar se ficou mutado/deaf ou sozinho
        const voiceChannel = newState.channel;
        const nonBotMembers = voiceChannel.members.filter(m => !m.user.bot);
        
        if (newState.selfMute || newState.selfDeaf || nonBotMembers.size <= 1) {
          // Pausar ou finalizar sessão
          await finalizeVoiceSession(userId, session);
          voiceSessions.delete(userId);
        } else if (session.channelId !== newState.channelId) {
          // Mudou de canal, atualizar sessão
          session.channelId = newState.channelId;
        }
      }
    }
  }
};

// Processar XP em intervalos (A cada 1 minuto)
async function processVoiceXp() {
  if (!clientInstance) return;
  
  const now = Date.now();
  const rankSystem = clientInstance.commands.get("rank");
  if (!rankSystem || !rankSystem.addXpForVoiceTick) return;
  
  for (const [userId, session] of voiceSessions.entries()) {
    // Verificar se já passou 1 minuto desde o último XP
    if (now - session.lastXpTime >= MINUTE_MS) {
      try {
        const guild = clientInstance.guilds.cache.get(session.guildId);
        if (!guild) continue;
        
        const member = guild.members.cache.get(userId);
        if (!member) continue;
        
        const voiceChannel = member.voice.channel;
        if (!voiceChannel || voiceChannel.id !== session.channelId) continue;
        
        if (member.voice.selfMute || member.voice.selfDeaf) continue;
        
        const nonBotMembers = voiceChannel.members.filter(m => !m.user.bot);
        if (nonBotMembers.size <= 1) continue;
        
        // Dispara a função do rank.js que dá XP aleatório e gerencia cargos
        const { subiuNivel, novoNivel, nivelAnterior } = await rankSystem.addXpForVoiceTick(member, 1);
        session.lastXpTime = now;
        
        // Se a pessoa subir de nível, manda a mensagem na call e atualiza o cargo
        if (subiuNivel && rankSystem.applyLevelRoles) {
            await rankSystem.applyLevelRoles(member, nivelAnterior, novoNivel);

            const levelUpMessage = await voiceChannel.send({
              embeds: [{
                title: "🎙️ LEVEL UP EM CALL!",
                description: `Parabéns ${member.user}! Você conversou bastante e alcançou o nível **${novoNivel}**!`,
                color: 0x00ff00,
                thumbnail: { url: member.user.displayAvatarURL({ dynamic: true }) },
                footer: { text: "Esta mensagem será excluída em 20 segundos • WDA - Todos os direitos reservados" }
              }]
            }).catch(() => null);

            if (levelUpMessage) {
              setTimeout(() => {
                levelUpMessage.delete().catch(() => {});
              }, 20000);
            }
        }
      } catch (error) {
        logger.error({ err: error, userId }, "Erro ao processar XP por voz");
      }
    }
  }
}

// Finalizar sessão e dar XP proporcional restante
async function finalizeVoiceSession(userId, session) {
  if (!clientInstance) return;
  const rankSystem = clientInstance.commands.get("rank");
  if (!rankSystem || !rankSystem.addXpForVoiceTick) return;

  const duration = Date.now() - session.lastXpTime;
  const minutes = Math.floor(duration / MINUTE_MS);
  
  if (minutes > 0) {
    try {
        const guild = clientInstance.guilds.cache.get(session.guildId);
        if (!guild) return;
        const member = guild.members.cache.get(userId);
        if (!member) return;

        const { subiuNivel, novoNivel, nivelAnterior } = await rankSystem.addXpForVoiceTick(member, minutes);
        
        if (subiuNivel && rankSystem.applyLevelRoles) {
            await rankSystem.applyLevelRoles(member, nivelAnterior, novoNivel);
            
            const voiceChannel = guild.channels.cache.get(session.channelId);
            if (voiceChannel) {
                const levelUpMessage = await voiceChannel.send({
                  embeds: [{
                    title: "🎙️ LEVEL UP EM CALL!",
                    description: `Parabéns ${member.user}! Você conversou bastante e alcançou o nível **${novoNivel}**!`,
                    color: 0x00ff00,
                    thumbnail: { url: member.user.displayAvatarURL({ dynamic: true }) },
                    footer: { text: "Esta mensagem será excluída em 20 segundos • WDA - Todos os direitos reservados" }
                  }]
                }).catch(() => null);

                if (levelUpMessage) {
                  setTimeout(() => {
                    levelUpMessage.delete().catch(() => {});
                  }, 20000);
                }
            }
        }
    } catch (e) {
        logger.error({ err: e, userId }, "Erro ao finalizar XP por voz");
    }
  }
}

// O processamento de XP por voz é gerenciado pelo timer em ready.js (com cleanup adequado).
// NÃO iniciar outro setInterval aqui para evitar XP duplicado e vazamento de memória.