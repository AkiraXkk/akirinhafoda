const { Events } = require("discord.js");
const { logger } = require("../logger");
const { createDataStore } = require("../store/dataStore");

const ticketStore = createDataStore("tickets.json");
const chatStore = createDataStore("sejawda_chats.json");

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    // ── SLA: Atualiza lastMessageAt/lastMessageBy nos tickets ──
    try {
      const tickets = await ticketStore.load();
      const ticketInfo = tickets[message.channelId];
      if (ticketInfo && !ticketInfo.closedAt && ticketInfo.userId) {
        const isOwner = message.author.id === ticketInfo.userId;
        await ticketStore.update(message.channelId, (info) => info ? {
          ...info,
          lastMessageAt: Date.now(),
          lastMessageBy: isOwner ? "user" : "staff",
          ping30Sent: false,
          ping90Sent: false
        } : null);
      }
    } catch (err) {
      logger.error({ err }, "Erro ao atualizar SLA do ticket");
    }

    try {
      const chats = await chatStore.load();
      const chatInfo = chats[message.channelId];
      if (chatInfo && !chatInfo.closedAt && chatInfo.userId) {
        const isOwner = message.author.id === chatInfo.userId;
        await chatStore.update(message.channelId, (info) => info ? {
          ...info,
          lastMessageAt: Date.now(),
          lastMessageBy: isOwner ? "user" : "staff",
          ping30Sent: false,
          ping90Sent: false
        } : null);
      }
    } catch (err) {
      logger.error({ err }, "Erro ao atualizar SLA do sejawda");
    }

    // AFK: verifica menções a usuários AFK e auto-remove AFK de quem falar
    const afkCommand = client.commands.get("afk");
    if (afkCommand?.handleMessage) {
      afkCommand.handleMessage(message).catch((err) =>
        logger.error({ err }, "Erro ao processar AFK no messageCreate")
      );
    }

    const levelsCommand = client.commands.get("rank");
    if (!levelsCommand?.addXpForMessage) return;

    try {
      const membro = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
      if (!membro) return;

      const { subiuNivel, novoNivel, nivelAnterior } = await levelsCommand.addXpForMessage(membro);
      
      // Quando a pessoa subir para QUALQUER nível, sem limites:
      if (subiuNivel && levelsCommand.applyLevelRoles) {
        await levelsCommand.applyLevelRoles(membro, nivelAnterior, novoNivel);

        // Enviar mensagem de level up no canal em que ela acabou de falar
        const levelUpMessage = await message.channel.send({
          embeds: [{
            title: "🎉 LEVEL UP!",
            description: `Parabéns ${message.author}! Você alcançou o nível **${novoNivel}**!`,
            color: 0x00ff00,
            thumbnail: { url: message.author.displayAvatarURL({ dynamic: true }) },
            footer: { text: "Esta mensagem será excluída em 20 segundos • WDA - Todos os direitos reservados" }
          }]
        }).catch((err) => {
          logger.warn({ err, channelId: message.channel.id }, "Falha ao enviar mensagem de level up");
          return null;
        });

        // Apagar mensagem após 20 segundos
        if (levelUpMessage) {
          setTimeout(() => {
            levelUpMessage.delete().catch(() => {});
          }, 20000);
        }
      }
    } catch (err) {
      logger.error({ err }, "Erro ao processar XP no messageCreate");
    }
  },
};
