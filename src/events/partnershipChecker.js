const { Events } = require("discord.js");
const { EmbedBuilder } = require("discord.js");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig } = require("../config/guildConfig");

const partnersStore = createDataStore("partners.json");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    setInterval(async () => {
      try {
        const partners = await partnersStore.load();
        const now = new Date();
        let changed = false;

        for (const [id, data] of Object.entries(partners)) {
          if ((data.status !== "accepted" && data.status !== "ACTIVE") || !data.acceptedAt) continue;

          const acceptedDate = new Date(data.acceptedAt);
          const diffDays = (now - acceptedDate) / (1000 * 60 * 60 * 24);

          if (diffDays >= 30) {
            const guild = client.guilds.cache.first();
            if (!guild) continue;

            const config = await getGuildConfig(guild.id);
            const pConfig = config?.partnership || {};
            const logChan = guild.channels.cache.get(pConfig.logChannelId);

            if (logChan) {
              const embed = new EmbedBuilder()
                .setTitle("Parceria Expirada")
                .setDescription(`A parceria ${id} (${data.serverName}) completou 30 dias e precisa de revisão.`)
                .setColor(0xFF0000);
              await logChan.send({ embeds: [embed] }).catch(() => null);
            }

            data.status = "expired";
            changed = true;
          }
        } // A chave que faltava fechar o for!

        if (changed) {
          await partnersStore.save(partners);
        }
      } catch (error) {
        console.error("Erro no verificador de parcerias:", error.message);
      }
    }, 1000 * 60 * 60);
  }
};
