const { Events, EmbedBuilder } = require("discord.js");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig } = require("../config/guildConfig");

const partnersStore = createDataStore("partners.json");
const boostStore = createDataStore("boosts.json");

module.exports = {
  name: Events.ClientReady, // Usando a constante oficial do discord.js
  once: true,
  async execute(client) {
    console.log("🔍 [CHECKER] Verificação automática de parcerias e boosts iniciada.");

    // Executar verificação inicial após o bot ligar
    setTimeout(async () => {
      await checkExpiredPartnerships(client);
      await checkExpiredBoosts(client);
    }, 5000); // Espera 5 segundos para garantir que o cache de canais carregou

    // Verificar a cada 10 minutos (mais eficiente para o servidor)
    setInterval(async () => {
      await checkExpiredPartnerships(client);
      await checkExpiredBoosts(client);
    }, 10 * 60 * 1000);
  }
};

async function checkExpiredPartnerships(client) {
  try {
    const partners = await partnersStore.load();
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    let expiredCount = 0;

    for (const [id, data] of Object.entries(partners)) {
      // Só verificamos parcerias que estão com status 'accepted'
      if (data.status !== "accepted") continue;

      // Usamos a data de solicitação ou processamento para calcular o tempo
      const baseDate = data.requestedAt || data.date;
      if (!baseDate) continue;

      const partnershipAge = now - new Date(baseDate).getTime();

      if (partnershipAge > thirtyDays) {
        // Atualiza o banco de dados
        await partnersStore.update(id, (current) => ({
          ...current,
          status: "expired",
          expiredAt: new Date().toISOString()
        }));

        expiredCount++;

        // Tentativa de enviar log para o canal configurado
        const guild = client.guilds.cache.first(); // Pega a primeira guilda onde o bot está (ou use process.env.GUILD_ID)
        if (guild) {
          const config = await getGuildConfig(guild.id);
          const logChannelId = config?.partnership?.logChannelId;
          
          if (logChannelId) {
            const logChannel = guild.channels.cache.get(logChannelId);
            if (logChannel) {
              const expireEmbed = new EmbedBuilder()
                .setTitle("📅 Parceria Expirada (30 Dias)")
                .setColor(0xffa500)
                .addFields(
                  { name: "Servidor", value: data.serverName || "Desconhecido", inline: true },
                  { name: "ID", value: `\`${id}\``, inline: true },
                  { name: "Representante", value: `<@${data.requesterId}>` }
                )
                .setDescription("Esta parceria atingiu o limite de 30 dias e foi marcada como expirada no sistema.")
                .setTimestamp();

              await logChannel.send({ embeds: [expireEmbed] }).catch(() => null);
            }
          }
        }
      }
    }

    if (expiredCount > 0) {
      console.log(`📅 [CHECKER] ${expiredCount} parcerias marcadas como expiradas.`);
    }
  } catch (error) {
    console.error("❌ Erro no checker de parcerias:", error);
  }
}

async function checkExpiredBoosts(client) {
  try {
    const boosts = await boostStore.load();
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, boost] of Object.entries(boosts)) {
      if (boost.status === "active" && new Date(boost.expiresAt).getTime() <= now) {
        await boostStore.update(key, (current) => ({
          ...current,
          status: "expired",
          expiredAt: new Date().toISOString()
        }));
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`⏰ [CHECKER] ${expiredCount} boosts expirados.`);
    }
  } catch (error) {
    console.error("❌ Erro no checker de boosts:", error);
  }
}