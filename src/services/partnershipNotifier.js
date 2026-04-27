const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig } = require("../config/guildConfig");

function createPartnershipNotifier({ client, logger }) {
  const partnersStore = createDataStore("partners.json");

  async function checkAndNotify() {
    try {
      const partners = await partnersStore.load();
      const now = Date.now();
      
      const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
      // 4 dias (3 dias de espera normal + 24 horas de tolerância após a notificação)
      const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000; 

      for (const [id, pData] of Object.entries(partners)) {
        if (pData.status !== "accepted" && pData.status !== "ACTIVE") continue;
        if (!pData.autoBump) continue;

        const lastBump = pData.lastBump || new Date(pData.date).getTime();
        const lastNotified = pData.lastNotified || 0;
        const timeSinceBump = now - lastBump;

        // ==========================================
        // 1. PUNIÇÃO: MAIS DE 4 DIAS SEM DAR BUMP
        // ==========================================
        if (timeSinceBump >= FOUR_DAYS_MS) {
          
          // Desativa o benefício no Banco de Dados
          await partnersStore.update(id, (p) => {
            if (p) p.autoBump = false; 
            return p;
          });

          // Encontra a Guild e remove o Cargo VIP
          let guild = null;
          if (pData.channelId) {
            const channel = client.channels.cache.get(pData.channelId);
            if (channel) guild = channel.guild;
          }

          if (guild) {
            const guildConfig = await getGuildConfig(guild.id);
            const boostRoleId = guildConfig?.partnership?.boostRole;
            const member = await guild.members.fetch(pData.requesterId).catch(() => null);
            if (member && boostRoleId) await member.roles.remove(boostRoleId).catch(() => null);
          }

          // Envia DM de perda de benefício
          const repUser = await client.users.fetch(pData.requesterId).catch(() => null);
          if (repUser) {
            const embedLost = new EmbedBuilder()
              .setTitle("💔 Benefício de Parceria Perdido")
              .setColor(0xFF0000)
              .setDescription(`Olá. Notamos que sua parceria **${pData.serverName}** ficou inativa por mais de 3 dias sem receber Bumps.\n\nDevido à inatividade e falta de resposta, o seu **Cargo de Parceiro Boost** e as notificações automáticas foram **removidos** do nosso servidor.\n\nSe desejar recuperar sua permissão, entre em contato com a nossa Staff.`);
            await repUser.send({ embeds: [embedLost] }).catch(() => null);
          }

          logger?.info?.({ partnerId: id }, "Parceiro perdeu o AutoBump por inatividade.");
          continue; // Como ele perdeu o VIP, pula o resto pra ele não receber mais cobranças.
        }

        // ==========================================
        // 2. COBRANÇA: DEU 3 DIAS E AINDA NÃO FOI COBRADO
        // ==========================================
        if (timeSinceBump >= THREE_DAYS_MS && now - lastNotified >= THREE_DAYS_MS) {
          const repUser = await client.users.fetch(pData.requesterId).catch(() => null);
          
          if (repUser) {
            const embedDM = new EmbedBuilder()
              .setTitle("🚀 Hora de renovar sua Parceria Premium!")
              .setColor(0xf1c40f)
              .setDescription(`Olá! Já se passaram **3 dias** e é hora de dar um **UP** na nossa parceria com o **${pData.serverName}**.\n\n⚠️ **Atenção:** Você tem 24 horas para clicar no botão abaixo, caso contrário, perderá o benefício do seu Cargo e sua permissão de AutoBump!\n\nNossa postagem antiga será apagada e a nova irá para o topo do chat:`);

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`boost_parceria_${id}`)
                .setLabel("Dar Bump na Parceria")
                .setStyle(ButtonStyle.Success)
                .setEmoji("🚀")
            );

            await repUser.send({ embeds: [embedDM], components: [row] }).catch(() => null);
          }

          // Marca que ele já foi cobrado hoje
          await partnersStore.update(id, (p) => {
            if (p) p.lastNotified = now;
            return p;
          });
        }
      }
    } catch (error) {
      logger?.error?.({ err: error }, "Erro ao verificar notificações de parceria");
    }
  }

  function start({ intervalMs = 60 * 60 * 1000 } = {}) {
    checkAndNotify().catch(() => {});
    setInterval(() => checkAndNotify().catch(() => {}), intervalMs);
  }

  return { start, checkAndNotify };
}

module.exports = { createPartnershipNotifier };
