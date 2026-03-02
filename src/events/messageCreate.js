const { Events } = require("discord.js");

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    const levelsService = client.services?.levels;
    const vipConfig = client.services?.vipConfig;
    if (!levelsService) return;

    try {
      const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
      const vipTier = member && vipConfig ? await vipConfig.getMemberTier(member) : null;
      const { leveledUp, newLevel } = await levelsService.addXp(message.author.id, 10, { vipTier });
      if (leveledUp) {
        await message.channel.send(`🎉 Parabéns ${message.author}! Você subiu para o nível **${newLevel}**!`);
      }
    } catch (_) {
      // evita quebrar fluxo de mensagens
    }
  },
};
