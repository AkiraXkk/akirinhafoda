const { Events } = require("discord.js");

module.exports = {
  name: Events.GuildCreate,
  once: false,
  async execute(guild, client) {
    const levelsCommand = client.commands.get("rank");
    if (!levelsCommand) return;

    try {
      // Sincronizar dados de XP para membros existentes quando o bot entra no servidor
      const members = await guild.members.fetch();
      let syncedCount = 0;

      for (const member of members.values()) {
        if (member.user.bot) continue;
        
        // Verificar se o usuário já tem dados de XP
        const levelsStore = require("../commands/levels.js").getLevelsStore?.();
        if (levelsStore) {
          const data = await levelsStore.load();
          if (!data[member.id]) {
            // Inicializar dados básicos para novos usuários
            await levelsStore.update(member.id, () => ({
              xp: 0,
              level: 1,
              totalXp: 0,
              messages: 0,
              voiceMs: 0
            }));
            syncedCount++;
          }
        }
      }

      if (syncedCount > 0) {
        console.log(`Sincronizados ${syncedCount} usuários no servidor ${guild.name}`);
      }
    } catch (error) {
      console.error(`Erro ao sincronizar dados do servidor ${guild.name}:`, error);
    }
  },
};
