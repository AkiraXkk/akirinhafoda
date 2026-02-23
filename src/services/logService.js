const { getGuildConfig } = require("../config/guildConfig");
const { createEmbed } = require("../embeds");

function createLogService({ client }) {
  async function log(guild, { title, description, color, fields, user }) {
    if (!guild) return;
    const config = await getGuildConfig(guild.id);
    if (!config.logsChannelId) return;

    const channel = guild.channels.cache.get(config.logsChannelId);
    if (!channel) return;

    const embed = createEmbed({
      title,
      description,
      color,
      fields,
      footer: { text: `Log de Auditoria` },
      timestamp: true,
      user
    });

    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  return { log };
}

module.exports = { createLogService };
