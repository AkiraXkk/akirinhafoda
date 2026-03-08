const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { createEmbed, createSuccessEmbed, createErrorEmbed } = require("../embeds");

// Map local para controlar o tempo de espera do /work
const workCooldowns = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName("economy")
    .setDescription("Sistema de economia do servidor")
    .addSubcommand(s => s.setName("balance").setDescription("Verifica seu saldo ou de outro usuário")
        .addUserOption(o => o.setName("usuario").setDescription("Usuário para ver o saldo").setRequired(false)))
    .addSubcommand(s => s.setName("work").setDescription("Trabalhe para ganhar moedas"))
    .addSubcommand(s => s.setName("daily").setDescription("Resgate seu bônus diário (Vips ganham bônus)"))
    .addSubcommand(s => s.setName("hourly").setDescription("Resgate seu bônus a cada hora"))
    .addSubcommand(s => s.setName("weekly").setDescription("Resgate seu bônus semanal"))
    .addSubcommand(s => s.setName("deposit").setDescription("Deposite moedas no banco")
        .addIntegerOption(o => o.setName("quantidade").setDescription("Valor para depositar").setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName("withdraw").setDescription("Saque moedas do banco")
        .addIntegerOption(o => o.setName("quantidade").setDescription("Valor para sacar").setMinValue(1).setRequired(true)))
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

    if (sub === "work") {
        const cooldownTime = 3600000; // 1 hora em milissegundos
        const cooldownKey = `${guildId}:${userId}`;
        const lastWork = workCooldowns.get(cooldownKey) || 0;
        const now = Date.now();

        if (now - lastWork < cooldownTime) {
            const nextTime = Math.floor((lastWork + cooldownTime) / 1000);
            return interaction.reply({ 
                embeds: [createErrorEmbed(`Você está cansado! Descanse um pouco.\n⏳ Volte a trabalhar <t:${nextTime}:R>.`)], 
                ephemeral: true 
            });
        }

        // Gera um valor aleatório entre 100 e 300
        const ganho = Math.floor(Math.random() * 200) + 100;
        
        await eco.addCoins(guildId, userId, ganho);
        workCooldowns.set(cooldownKey, now);

        return interaction.reply({ 
            embeds: [createSuccessEmbed(`💼 Você trabalhou duro e ganhou **${ganho} 🪙 moedas**!`)] 
        });
    }

    if (sub === "pay") {
        const target = interaction.options.getUser("usuario");
        const amount = interaction.options.getInteger("quantidade");

        if (target.bot || target.id === userId) {
            return interaction.reply({ embeds: [createErrorEmbed("Usuário inválido para transferência.")], ephemeral: true });
        }

        const bal = await eco.getBalance(guildId, userId);
        if ((bal.coins || 0) < amount) {
            return interaction.reply({ embeds: [createErrorEmbed(`Saldo insuficiente! Você tem apenas **${bal.coins || 0} 🪙**.`)], ephemeral: true });
        }

        try {
            await eco.removeCoins(guildId, userId, amount);
            await eco.addCoins(guildId, target.id, amount);
        } catch (err) {
            return interaction.reply({ embeds: [createErrorEmbed("Erro ao processar a transferência. Tente novamente.")], ephemeral: true });
        }

        return interaction.reply({ 
            embeds: [createSuccessEmbed(`💸 Você transferiu **${amount} 🪙** para ${target}.`)] 
        });
    }

    if (sub === "daily") {
        const base = 500;
        const tier = await vipService?.getMemberTier(interaction.member);
        const extra = tier?.valor_daily_extra || 0;
        const mult = tier?.midas ? 2 : 1; // Ajustei 'mao_de_midas' para 'midas' conforme o vipadmin.js anterior
        const total = (base + extra) * mult;

        const result = await eco.daily(guildId, userId, total); 
        
        if (!result || !result.success) {
            const nextDate = result?.nextDaily ? Math.floor(result.nextDaily / 1000) : Math.floor(Date.now() / 1000) + 86400;
            return interaction.reply({ 
                embeds: [createErrorEmbed(`Você já resgatou seu daily hoje!\n⏳ Tente novamente <t:${nextDate}:R>.`)], 
                ephemeral: true 
            });
        }

        let msg = `Você recebeu **${total} 🪙** diárias!`;
        if (tier?.midas) msg += "\n✨ **Mão de Midas:** Seu bônus foi dobrado!";
        return interaction.reply({ embeds: [createSuccessEmbed(msg)] });
    }

    if (sub === "hourly") {
        const amount = 50;
        const result = await eco.hourly(guildId, userId, amount);
        if (!result || !result.success) {
            const nextTime = result?.nextHourly ? Math.floor(result.nextHourly / 1000) : Math.floor(Date.now() / 1000) + 3600;
            return interaction.reply({
                embeds: [createErrorEmbed(`Você já resgatou seu bônus por hora!\n⏳ Tente novamente <t:${nextTime}:R>.`)],
                ephemeral: true
            });
        }
        return interaction.reply({ embeds: [createSuccessEmbed(`⏰ Você resgatou **${amount} 🪙** do bônus por hora!`)] });
    }

    if (sub === "weekly") {
        const amount = 2500;
        const result = await eco.weekly(guildId, userId, amount);
        if (!result || !result.success) {
            const nextTime = result?.nextWeekly ? Math.floor(result.nextWeekly / 1000) : Math.floor(Date.now() / 1000) + 604800;
            return interaction.reply({
                embeds: [createErrorEmbed(`Você já resgatou seu bônus semanal!\n⏳ Tente novamente <t:${nextTime}:R>.`)],
                ephemeral: true
            });
        }
        return interaction.reply({ embeds: [createSuccessEmbed(`📅 Você resgatou **${amount} 🪙** do bônus semanal!`)] });
    }

    if (sub === "deposit") {
        const amount = interaction.options.getInteger("quantidade");
        const result = await eco.depositToBank(guildId, userId, amount);
        if (!result.success) {
            const bal = await eco.getBalance(guildId, userId);
            return interaction.reply({
                embeds: [createErrorEmbed(`Saldo insuficiente! Você tem apenas **${bal.coins || 0} 🪙** na carteira.`)],
                ephemeral: true
            });
        }
        return interaction.reply({ embeds: [createSuccessEmbed(`🏦 Você depositou **${amount} 🪙** no banco!`)] });
    }

    if (sub === "withdraw") {
        const amount = interaction.options.getInteger("quantidade");
        const result = await eco.withdrawFromBank(guildId, userId, amount);
        if (!result.success) {
            const bal = await eco.getBalance(guildId, userId);
            return interaction.reply({
                embeds: [createErrorEmbed(`Saldo insuficiente no banco! Você tem apenas **${bal.bank || 0} 🪙** no banco.`)],
                ephemeral: true
            });
        }
        return interaction.reply({ embeds: [createSuccessEmbed(`💵 Você sacou **${amount} 🪙** do banco!`)] });
    }

    if (sub === "add" || sub === "remove") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ embeds: [createErrorEmbed("Sem permissão.")], ephemeral: true });
        }
        
        const target = interaction.options.getUser("usuario");
        const amount = interaction.options.getInteger("quantidade");
        
        if (sub === "add") {
            await eco.addCoins(guildId, target.id, amount);
            return interaction.reply({ embeds: [createSuccessEmbed(`✅ Adicionado **${amount} 🪙** para ${target}.`)] });
        } else {
            await eco.removeCoins(guildId, target.id, amount);
            return interaction.reply({ embeds: [createSuccessEmbed(`✅ Removido **${amount} 🪙** de ${target}.`)] });
        }
    }
  }
};