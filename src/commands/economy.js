const { SlashCommandBuilder } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");
const { createDataStore } = require("../store/dataStore");

const economyStore = createDataStore("economy.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("economy")
    .setDescription("Comandos de economia")
    .addSubcommand((sub) =>
      sub
        .setName("balance")
        .setDescription("Verifica seu saldo ou de outro usuário")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Usuário (opcional)").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("work")
        .setDescription("Trabalha para ganhar moedas")
    )
    .addSubcommand((sub) =>
      sub
        .setName("daily")
        .setDescription("Resgata seu bônus diário")
    )
    .addSubcommand((sub) =>
      sub
        .setName("pay")
        .setDescription("Transfere moedas para outro usuário")
        .addUserOption((opt) => opt.setName("usuario").setDescription("Destinatário").setRequired(true))
        .addIntegerOption((opt) => opt.setName("quantidade").setDescription("Valor a transferir").setMinValue(1).setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const economy = await economyStore.load();
    const userId = interaction.user.id;

    // BALANCE
    if (sub === "balance") {
      const user = interaction.options.getUser("usuario") || interaction.user;
      const balance = economy[user.id] || { coins: 0, bank: 0 };
      
      await interaction.reply({ 
          embeds: [createEmbed({
              title: `💰 Saldo de ${user.username}`,
              fields: [
                  { name: "Carteira", value: `${balance.coins} 🪙`, inline: true },
                  { name: "Banco", value: `${balance.bank || 0} 🏦`, inline: true }
              ],
              color: 0xF1C40F // Gold
          })] 
      });
    }

    // WORK
    if (sub === "work") {
      const lastWork = economy[userId]?.lastWork || 0;
      const cooldown = 60 * 60 * 1000; // 1 hora
      const now = Date.now();
      
      if (now - lastWork < cooldown) {
          const remaining = Math.ceil((cooldown - (now - lastWork)) / 1000 / 60);
          return interaction.reply({ embeds: [createErrorEmbed(`Você precisa descansar! Tente novamente em ${remaining} minutos.`)], ephemeral: true });
      }
      
      const earnings = Math.floor(Math.random() * 200) + 50; // 50-250 coins
      const current = economy[userId] || { coins: 0, bank: 0 };
      
      economy[userId] = {
          ...current,
          coins: (current.coins || 0) + earnings,
          lastWork: now
      };
      
      await economyStore.save(economy);
      
      await interaction.reply({ 
          embeds: [createSuccessEmbed(`Você trabalhou duro e ganhou **${earnings} 🪙**!`)] 
      });
    }

    // DAILY
    if (sub === "daily") {
      const lastDaily = economy[userId]?.lastDaily || 0;
      const cooldown = 24 * 60 * 60 * 1000; // 24 horas
      const now = Date.now();
      
      if (now - lastDaily < cooldown) {
          const remaining = Math.ceil((cooldown - (now - lastDaily)) / 1000 / 60 / 60);
          return interaction.reply({ embeds: [createErrorEmbed(`Você já pegou seu prêmio hoje! Volte em ${remaining} horas.`)], ephemeral: true });
      }
      
      const earnings = 500;
      const current = economy[userId] || { coins: 0, bank: 0 };
      
      economy[userId] = {
          ...current,
          coins: (current.coins || 0) + earnings,
          lastDaily: now
      };
      
      await economyStore.save(economy);
      
      await interaction.reply({ 
          embeds: [createSuccessEmbed(`Você resgatou seu prêmio diário de **${earnings} 🪙**!`)] 
      });
    }

    // PAY
    if (sub === "pay") {
      const target = interaction.options.getUser("usuario");
      const amount = interaction.options.getInteger("quantidade");
      
      if (target.id === userId) {
          return interaction.reply({ embeds: [createErrorEmbed("Você não pode pagar a si mesmo.")], ephemeral: true });
      }
      
      const sender = economy[userId] || { coins: 0, bank: 0 };
      
      if ((sender.coins || 0) < amount) {
          return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente! Você tem apenas **${sender.coins || 0} 🪙** na carteira.`)], ephemeral: true });
      }
      
      const receiver = economy[target.id] || { coins: 0, bank: 0 };
      
      economy[userId] = { ...sender, coins: sender.coins - amount };
      economy[target.id] = { ...receiver, coins: (receiver.coins || 0) + amount };
      
      await economyStore.save(economy);
      
      await interaction.reply({ 
          embeds: [createSuccessEmbed(`Você enviou **${amount} 🪙** para ${target}!`)] 
      });
    }
  },
  
  async addCoins(userId, amount = 10) {
      await economyStore.update(userId, (current) => {
          const data = current || { coins: 0, bank: 0 };
          data.coins = (data.coins || 0) + amount;
          return data;
      });
  }
};
