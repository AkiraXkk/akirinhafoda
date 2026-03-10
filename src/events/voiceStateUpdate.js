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

    // 🚨 A TRAVA ABSOLUTA: Verifica se a pessoa está mutada ou ensurdecida de QUALQUER forma (Self ou Server)
    const isMutedOrDeaf = newState.selfMute || newState.selfDeaf || newState.serverMute || newState.serverDeaf;

    // 1. Usuário entrou em um canal de voz
    if (!oldState.channelId && newState.channelId) {
      const voiceChannel = newState.channel;
      
      // Se entrou mutado ou surdo, ignora completamente (não inicia a sessão)
      if (isMutedOrDeaf) return;

      // Verificar se não está sozinho (ignorando bots)
      const nonBotMembers = voiceChannel.members.filter(m => !m.user.bot);
      if (nonBotMembers.size <= 1) return;

      // Iniciar sessão de contagem de tempo e XP
      voiceSessions.set(userId, {
        guildId,
        channelId: newState.channelId,
        startTime: Date.now(),
        lastXpTime: Date.now()
      });

      logger.debug({ userId, guildId, channelId: newState.channelId }, "Usuário entrou em canal de voz apto para XP");
    }
    
    // 2. Usuário saiu do canal de voz
    else if (oldState.channelId && !newState.channelId) {
      const session = voiceSessions.get(userId);
      if (session) {
        await finalizeVoiceSession(userId, session);
        voiceSessions.delete(userId); // Apaga a sessão da memória
        logger.debug({ userId, guildId: session.guildId }, "Usuário saiu de canal de voz, sessão finalizada");
      }
    }
    
    // 3. Usuário mudou de canal ou mudou o status (mutou/desmutou o mic/fone)
    else if (oldState.channelId && newState.channelId) {
      const session = voiceSessions.get(userId);
      
      if (!session) {
        // Se NÃO tinha sessão (porque estava mutado) e agora DESMUTOU, criar uma nova
        if (!isMutedOrDeaf) {
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
        // Se TINHA sessão (estava ganhando XP)
        const voiceChannel = newState.channel;
        const nonBotMembers = voiceChannel.members.filter(m => !m.user.bot);
        
        // 🛑 Se ele MUTOU, ENSURDECEU ou ficou SOZINHO na call: Finaliza e para de contar TUDO!
        if (isMutedOrDeaf || nonBotMembers.size <= 1) {
          await finalizeVoiceSession(userId, session);
          voiceSessions.delete(userId); // Mágica: Apaga a sessão e congela XP/Tempo
        } else if (session.channelId !== newState.channelId) {
          // Se apenas mudou de canal (e continuou desmutado), só atualiza o ID do canal na sessão
          session.channelId = newState.channelId;
        }
      }
    }
  }
};

// Processar XP em intervalos (A cada 1 minuto chamado pelo ready.js ou index.js)
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
        
        // Trava final de segurança redundante: Se estiver mutado/deaf na hora de receber, ignora
        if (member.voice.selfMute || member.voice.selfDeaf || member.voice.serverMute || member.voice.serverDeaf) continue;
        
        const nonBotMembers = voiceChannel.members.filter(m => !m.user.bot);
        if (nonBotMembers.size <= 1) continue;
        
        // Dispara a função do rank.js que dá XP e soma o tempo
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

// O processamento contínuo de XP continua sendo disparado pelo timer global (ready.js)