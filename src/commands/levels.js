const { SlashCommandBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

const levelsStore = createDataStore("levels.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level")
    .setDescription("Sistema de níveis")
    .addSubcommand((sub) =>
      sub
        .setName("rank")
        .setDescription("Verifica seu nível e XP")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário (opcional)").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard")
        .setDescription("Mostra o top 10 usuários com mais XP")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const levels = await levelsStore.load();

    // RANK
    if (sub === "rank") {
      const user = interaction.options.getUser("usuario") || interaction.user;
      const data = levels[user.id] || { xp: 0, level: 1 };
      
      const xpNeeded = data.level * 100;
      
      // Barra de progresso simples
      const progress = Math.min(data.xp / xpNeeded, 1);
      const filled = Math.floor(progress * 10);
      const empty = 10 - filled;
      const bar = "🟦".repeat(filled) + "⬜".repeat(empty);

      await interaction.reply({ 
          embeds: [createEmbed({
              title: `🌟 Nível de ${user.username}`,
              fields: [
                  { name: "Nível", value: `${data.level}`, inline: true },
                  { name: "XP Total", value: `${data.xp}`, inline: true },
                  { name: "Progresso para Próximo Nível", value: `${data.xp}/${xpNeeded} XP\n${bar}` }
              ],
              thumbnail: user.displayAvatarURL(),
              color: 0x9B59B6 // Purple
          })] 
      });
    }

    // LEADERBOARD
    if (sub === "leaderboard") {
      const sorted = Object.entries(levels)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => (b.level * 1000 + b.xp) - (a.level * 1000 + a.xp)) // Ordena por level depois xp
        .slice(0, 10);
        
      if (sorted.length === 0) {
          return interaction.reply({ embeds: [createEmbed({ description: "Ninguém ganhou XP ainda." })], ephemeral: true });
      }

      const top = await Promise.all(sorted.map(async (entry, index) => {
          // Tenta pegar user do cache ou fetch se possível, senão usa ID
          // Como fetch pode ser lento para lista, vamos tentar formatar <@id>
          return `**${index + 1}.** <@${entry.id}> - Nível ${entry.level} (${entry.xp} XP)`;
      }));

      await interaction.reply({ 
          embeds: [createEmbed({
              title: "🏆 Top 10 Níveis",
              description: top.join("\n"),
              color: 0xF1C40F // Gold
          })] 
      });
    }
  },
  
  // Função para adicionar XP (será chamada no index.js)
  async addXp(userId, amount = 10) {
      let leveledUp = false;
      let newLevel = 1;
      
      await levelsStore.update(userId, (current) => {
          const data = current || { xp: 0, level: 1 };
          data.xp += amount;
          
          const xpNeeded = data.level * 100;
          if (data.xp >= xpNeeded) {
              data.level += 1;
              data.xp = 0; // Reset XP for next level? Usually accumulated. Let's reset for simplicity as per code.
              leveledUp = true;
              newLevel = data.level;
          }
          
          return data;
      });
      
      return { leveledUp, newLevel };
  }
};
