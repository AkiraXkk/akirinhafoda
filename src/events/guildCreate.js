const { Events, EmbedBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");
const { getGuildConfig } = require("../config/guildConfig");

const partnersStore = createDataStore("partners.json");
const boostStore = createDataStore("boosts.json");

module.exports = {
  name: Events.GuildCreate,
  async execute(guild, client) {
    console.log(`🔍 Verificando parceria do servidor: ${guild.name} (${guild.id})`);

    try {
      // Verificar se é um servidor parceiro
      const partners = await partnersStore.load();
      const partnership = Object.values(partners).find(p => 
        (p.requesterGuild === guild.id || p.partnerGuild === guild.id) && 
        (p.status === "accepted" || p.status === "ACTIVE")
      );

      if (!partnership) {
        console.log(`❌ Servidor ${guild.name} não é parceiro`);
        // Ainda sincronizar dados de XP para membros existentes
        await syncExistingMembers(guild, client);
        return;
      }

      console.log(`✅ Servidor ${guild.name} é parceiro - Configurando acesso...`);

      // Obter configurações do servidor principal
      const mainGuildId = process.env.MAIN_GUILD_ID;
      const mainGuild = client.guilds.cache.get(mainGuildId);
      
      if (!mainGuild) {
        console.log(`❌ Servidor principal não encontrado: ${mainGuildId}`);
        return;
      }

      const config = await getGuildConfig(mainGuildId);
      
      // Enviar mensagem de boas-vindas ao servidor principal
      const partnerChannelId = config.partnerChannelId;
      if (partnerChannelId) {
        const partnerChannel = mainGuild.channels.cache.get(partnerChannelId);
        
        if (partnerChannel) {
          const welcomeMessage = config.partnerWelcomeMessage || 
            "🎉 Novo servidor parceiro detectado!\n\n" +
            "**Servidor:** {serverName}\n" +
            "**Membros:** {memberCount}\n" +
            "**Dono:** {ownerName}\n\n" +
            "Bem-vindo à família WDA! 🤝";

          const formattedMessage = welcomeMessage
            .replace("{serverName}", guild.name)
            .replace("{memberCount}", guild.memberCount)
            .replace("{ownerName}", guild.owner ? guild.owner.user.username : "Desconhecido")
            .replace("{guildId}", guild.id);

          const embed = createEmbed({
            title: "🤝 Nova Parceria Detectada",
            description: formattedMessage,
            color: 0x00ff00,
            thumbnail: guild.iconURL(),
            footer: { text: "WDA - Todos os direitos reservados" },
            timestamp: new Date()
          });

          await partnerChannel.send({ embeds: [embed] });
          console.log(`✅ Mensagem de parceria enviada para o canal ${partnerChannelId}`);
        } else {
          console.log(`❌ Canal de parcerias não encontrado: ${partnerChannelId}`);
        }
      }

      // Configurar cargo de parceiro se existir
      const partnerRoleId = config.partnerRoleId;
      if (partnerRoleId && guild.ownerId) {
        try {
          // Adicionar cargo ao dono do servidor
          const owner = await guild.members.fetch(guild.ownerId);
          if (owner) {
            const role = guild.roles.cache.get(partnerRoleId);
            if (role) {
              await owner.roles.add(role);
              console.log(`✅ Cargo de parceiro adicionado ao dono ${guild.owner.user.username}`);
            } else {
              console.log(`❌ Cargo de parceiro não encontrado: ${partnerRoleId}`);
            }
          }
        } catch (error) {
          console.log(`❌ Erro ao adicionar cargo de parceiro:`, error.message);
        }
      }

      // Enviar mensagem de boas-vindas ao servidor parceiro
      try {
        const systemChannel = guild.systemChannel || guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(guild.members.me).has('SendMessages'));
        
        if (systemChannel) {
          const welcomeEmbed = createEmbed({
            title: "🎉 Bem-vindo à WDA Partners!",
            description: 
              "Seu servidor agora é oficialmente parceiro da WDA!\n\n" +
              "**Benefícios:**\n" +
              "• 📢 Destaque em nossa lista de parcerias\n" +
              "• 🚀 Acesso a promoções exclusivas\n" +
              "• 🤝 Suporte prioritário\n" +
              "• 💎 Acesso a recursos VIP\n\n" +
              "Obrigado pela parceria! Estamos felizes em ter você conosco! 🚀",
            color: 0x00ff00,
            thumbnail: client.user.displayAvatarURL(),
            footer: { text: "WDA - Todos os direitos reservados" },
            timestamp: new Date()
          });

          await systemChannel.send({ embeds: [welcomeEmbed] });
          console.log(`✅ Mensagem de boas-vindas enviada ao servidor ${guild.name}`);
        }
      } catch (error) {
        console.log(`❌ Erro ao enviar mensagem de boas-vindas:`, error.message);
      }

      console.log(`✅ Configuração de parceria concluída para ${guild.name}`);

      // Sincronizar dados de XP para membros existentes
      await syncExistingMembers(guild, client);

    } catch (error) {
      console.error(`❌ Erro ao configurar parceria para ${guild.name}:`, error);
    }
  }
};

// Função auxiliar para sincronizar membros existentes
async function syncExistingMembers(guild, client) {
  try {
    const levelsCommand = client.commands.get("rank");
    if (!levelsCommand) return;

    const levelsStore = levelsCommand.getLevelsStore?.();
    if (!levelsStore) return;

    const members = await guild.members.fetch();
    let syncedCount = 0;

    for (const member of members.values()) {
      if (member.user.bot) continue;
      
      // Verificar se o usuário já tem dados de XP
      const data = await levelsStore.load();
      if (!data[member.id]) {
        // Inicializar dados básicos para novos usuários
        await levelsStore.update(member.id, () => ({
          xp: 0,
          level: 1,
          totalXp: 0,
          messages_count: 0,
          voice_time: 0
        }));
        syncedCount++;
      }
    }

    if (syncedCount > 0) {
      console.log(`Sincronizados ${syncedCount} usuários no servidor ${guild.name}`);
    }
  } catch (error) {
    console.error(`Erro ao sincronizar dados do servidor ${guild.name}:`, error);
  }
}
