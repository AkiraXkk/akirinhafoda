const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

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
    )
    .addSubcommand((sub) =>
        sub.setName("add").setDescription("Adiciona moedas (Admin)").addUserOption(opt => opt.setName("usuario").setDescription("Usuário").setRequired(true)).addIntegerOption(opt => opt.setName("quantidade").setDescription("Valor").setRequired(true))
    )
    .addSubcommand((sub) =>
        sub.setName("remove").setDescription("Remove moedas (Admin)").addUserOption(opt => opt.setName("usuario").setDescription("Usuário").setRequired(true)).addIntegerOption(opt => opt.setName("quantidade").setDescription("Valor").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const economyService = interaction.client.services.economy;
    const vipService = interaction.client.services.vip;
    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    if (!economyService) {
        return interaction.reply({ content: "Serviço de economia indisponível.", ephemeral: true });
    }

    // BALANCE
    if (sub === "balance") {
      const user = interaction.options.getUser("usuario") || interaction.user;
      const balance = await economyService.getBalance(guildId, user.id);
      
      await interaction.reply({ 
          embeds: [createEmbed({
              title: `💰 Saldo de ${user.username}`,
              fields: [
                  { name: "Carteira", value: `${balance.coins || 0} 🪙`, inline: true },
                  { name: "Banco", value: `${balance.bank || 0} 🏦`, inline: true }
              ],
              color: 0xF1C40F // Gold
          })] 
      });
    }

    // WORK
    if (sub === "work") {
      const data = await economyService.getBalance(guildId, userId);
      const lastWork = data.lastWork || 0;
      const cooldown = 60 * 60 * 1000; // 1 hora
      const now = Date.now();
      
      if (now - lastWork < cooldown) {
          const remaining = Math.ceil((cooldown - (now - lastWork)) / 1000 / 60);
          return interaction.reply({ embeds: [createErrorEmbed(`Você precisa descansar! Tente novamente em ${remaining} minutos.`)], ephemeral: true });
      }
      
      const earnings = Math.floor(Math.random() * 200) + 50; // 50-250 coins
      await economyService.work(guildId, userId, earnings);

      await interaction.reply({ 
          embeds: [createSuccessEmbed(`Você trabalhou duro e ganhou **${earnings} 🪙**!`)] 
      });
    }

    // DAILY
    if (sub === "daily") {
      const data = await economyService.getBalance(guildId, userId);
      const lastDaily = data.lastDaily || 0;
      const cooldown = 24 * 60 * 60 * 1000; // 24 horas
      const now = Date.now();
      
      if (now - lastDaily < cooldown) {
          const remaining = Math.ceil((cooldown - (now - lastDaily)) / 1000 / 60 / 60);
          return interaction.reply({ embeds: [createErrorEmbed(`Você já pegou seu prêmio hoje! Volte em ${remaining} horas.`)], ephemeral: true });
      }
      
      const base = 500;
      let extra = 0;
      try {
        const tier = vipService?.getUserTierConfig ? await vipService.getUserTierConfig({ guildId, member: interaction.member }) : null;
        extra = tier?.valor_daily_extra ? Number(tier.valor_daily_extra) : 0;
        if (!Number.isFinite(extra) || extra < 0) extra = 0;
      } catch {
        extra = 0;
      }

      const earnings = base + extra;
      await economyService.daily(guildId, userId, earnings);

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
      
      const success = await economyService.transfer(guildId, userId, target.id, amount);
      
      if (!success) {
          return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente!`)], ephemeral: true });
      }
      
      await interaction.reply({ 
          embeds: [createSuccessEmbed(`Você enviou **${amount} 🪙** para ${target}!`)] 
      });
    }
    
    // ADMIN COMMANDS
    if (sub === "add" || sub === "remove") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
             return interaction.reply({ embeds: [createErrorEmbed("Apenas administradores podem usar isso.")], ephemeral: true });
        }
        
        const target = interaction.options.getUser("usuario");
        const amount = interaction.options.getInteger("quantidade");
        
        if (sub === "add") {
            await economyService.addCoins(guildId, target.id, amount);
            await interaction.reply({ embeds: [createSuccessEmbed(`Adicionado **${amount} 🪙** para ${target}.`)] });
        } else {
            await economyService.removeCoins(guildId, target.id, amount);
            await interaction.reply({ embeds: [createSuccessEmbed(`Removido **${amount} 🪙** de ${target}.`)] });
        }
    }
  },
};
