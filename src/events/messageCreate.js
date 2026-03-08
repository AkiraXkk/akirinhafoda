const { Events } = require("discord.js");
const { logger } = require("../logger");

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

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
        });

        // Apagar mensagem após 20 segundos
        setTimeout(() => {
          levelUpMessage.delete().catch(() => {
            // Ignora o erro silenciosamente caso a mensagem já tenha sido apagada
          });
        }, 20000);
      }
    } catch (err) {
      logger.error({ err }, "Erro ao processar XP no messageCreate");
    }
  },
};
