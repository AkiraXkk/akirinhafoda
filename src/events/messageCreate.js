const { Events } = require("discord.js");

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
      if (subiuNivel && levelsCommand.applyLevelRoles) {
        await levelsCommand.applyLevelRoles(membro, nivelAnterior, novoNivel);
        
        // Enviar mensagem de level up
        const levelUpMessage = await message.channel.send({
          embeds: [{
            title: "🎉 LEVEL UP!",
            description: `Parabéns ${message.author}! Você subiu para o nível **${novoNivel}**!`,
            color: 0x00ff00,
            thumbnail: message.author.displayAvatarURL({ dynamic: true }),
            footer: { text: "Esta mensagem será excluída em 15 segundos • WDA - Todos os direitos reservados" }
          }]
        });
        
        // Apagar mensagem após 15 segundos
        setTimeout(() => {
          levelUpMessage.delete().catch(() => {
            console.log("Não foi possível apagar mensagem de level up (pode já ter sido excluída)");
          });
        }, 15000);
      }
    } catch (_) {}
  },
};
