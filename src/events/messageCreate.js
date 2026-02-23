const { Events } = require("discord.js");

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    // XP System
    const levelsCommand = client.commands.get("level");
    if (levelsCommand && typeof levelsCommand.addXp === "function") {
        try {
            const { leveledUp, newLevel } = await levelsCommand.addXp(message.author.id, 10);
            if (leveledUp) {
                await message.channel.send(`🎉 Parabéns ${message.author}! Você subiu para o nível **${newLevel}**!`);
            }
        } catch (err) {
            // Ignore XP errors
        }
    }
  },
};
