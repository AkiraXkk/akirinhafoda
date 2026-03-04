const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("economy")
    .setDescription("Sistema de economia do servidor")
    .addSubcommand(s => s.setName("balance").setDescription("Verifica seu saldo ou de outro usuário")
        .addUserOption(o => o.setName("usuario").setDescription("Usuário para ver o saldo").setRequired(false)))
    .addSubcommand(s => s.setName("work").setDescription("Trabalhe para ganhar moedas"))
    .addSubcommand(s => s.setName("daily").setDescription("Resgate seu bônus diário (Vips ganham bônus)"))
    .addSubcommand(s => s.setName("pay").setDescription("Transfere moedas para alguém")
        .addUserOption(o => o.setName("usuario").setDescription("Quem vai receber").setRequired(true))
        .addIntegerOption(o => o.setName("quantidade").setDescription("Valor da transferência").setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName("add").setDescription("Adiciona moedas (Staff)")
        .addUserOption(o => o.setName("usuario").setDescription("Usuário alvo").setRequired(true))
        .addIntegerOption(o => o.setName("quantidade").setDescription("Valor a adicionar").setRequired(true)))
    .addSubcommand(s => s.setName("remove").setDescription("Remove moedas (Staff)")
        .addUserOption(o => o.setName("usuario").setDescription("Usuário alvo").setRequired(true))
        .addIntegerOption(o => o.setName("quantidade").setDescription("Valor a remover").setRequired(true))),

  async execute(interaction) {
    const { economy: eco, vip: vipService } = interaction.client.services;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (sub === "balance") {
        const target = interaction.options.getUser("usuario") || interaction.user;
        const bal = await eco.getBalance(guildId, target.id);
        return interaction.reply({ embeds: [createEmbed({ title: `💰 Carteira de ${target.username}`, description: `🪙 Moedas: **${bal.coins || 0}**\n🏦 Banco: **${bal.bank || 0}**`, color: 0xF1C40F })] });
    }

    if (sub === "daily") {
        const base = 500;
        const tier = await vipService.getMemberTier(interaction.member);
        const extra = tier?.valor_daily_extra || 0;
        const mult = tier?.mao_de_midas ? 2 : 1;
        const total = base + (extra * mult);

        const result = await eco.daily(guildId, userId, total); 
        
        if (!result || !result.success) {
            const nextDate = result?.nextDaily ? Math.floor(result.nextDaily / 1000) : Math.floor(Date.now() / 1000) + 86400;
            return interaction.reply({ 
                embeds: [createErrorEmbed(`Você já resgatou seu daily hoje!\n⏳ Tente novamente <t:${nextDate}:R> (<t:${nextDate}:f>)`)], 
                ephemeral: true 
            });
        }

        let msg = `Você recebeu **${total} 🪙**!`;
        if (tier?.mao_de_midas) msg += "\n✨ **Mão de Midas:** Seu bônus VIP foi dobrado!";
        return interaction.reply({ embeds: [createSuccessEmbed(msg)] });
    }

    // ... lógica de pay, add, remove (basta seguir o padrão que você já tinha)
    if (sub === "add" || sub === "remove") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "Sem permissão.", ephemeral: true });
        const target = interaction.options.getUser("usuario");
        const amount = interaction.options.getInteger("quantidade");
        if (sub === "add") await eco.addCoins(guildId, target.id, amount);
        else await eco.removeCoins(guildId, target.id, amount);
        return interaction.reply(`✅ Operação de **${amount} 🪙** realizada para ${target}.`);
    }
  }
};
