let maintenanceInterval = null;

// No seu PresenceService ou similar:
async function startMaintenanceLoop(client, data) {
    if (maintenanceInterval) clearInterval(maintenanceInterval);

    maintenanceInterval = setInterval(async () => {
        try {
            const channel = client.channels.cache.get(data.channelId);
            if (!channel) return;

            const message = await channel.messages.fetch(data.messageId);
            if (!message) return;

            // Importamos a função de gerar embed ou a replicamos aqui
            const uptime = Math.floor((Date.now() - data.startTime) / 1000 / 60);
            const updatedEmbed = new EmbedBuilder(message.embeds[0].data)
                .setFields(
                    { name: "Status", value: "🔴 Instável / Em Manutenção", inline: true },
                    { name: "Duração Atual", value: `\`${uptime} minutos\``, inline: true },
                    { name: "Última Atualização", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: false }
                );

            await message.edit({ embeds: [updatedEmbed] });
        } catch (e) {
            console.error("Erro ao atualizar embed de manutenção:", e);
        }
    }, 120000); // 2 minutos (120.000 ms)
}

function stopMaintenanceLoop() {
    if (maintenanceInterval) {
        clearInterval(maintenanceInterval);
        maintenanceInterval = null;
    }
}
